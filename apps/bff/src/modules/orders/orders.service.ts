import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
// TODO(vercel-build): @prisma/client types require `prisma generate` — ensured by package.json#build
import type { Order as DbOrder, OrderLine as DbOrderLine } from "@prisma/client";
import type { OrderStatus } from "@mini-commerce/shared-types";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { PrismaService } from "../../prisma.service";
import { DomainEventsService } from "../../core/domain-events/domain-events.service";
import { CatalogService } from "../catalog/catalog.service";
import type { ManageOrderDto } from "./orders.dto";
import type {
  CreateOrderInput,
  ManageOrderResponse,
  Order,
  OrderLine,
} from "./orders.types";

const tracer = trace.getTracer("orders.service");

function toOrder(row: DbOrder & { lines: DbOrderLine[] }): Order {
  return {
    orderId: row.orderId,
    customerName: row.customerName,
    status: row.status as OrderStatus,
    lines: row.lines.map((l): OrderLine => ({
      productId: l.productId,
      name: l.name,
      quantity: l.quantity,
      unitPrice: { amountMinor: l.unitAmountMinor, currency: l.unitCurrency },
      lineTotal: { amountMinor: l.lineAmountMinor, currency: l.lineCurrency },
    })),
    total: { amountMinor: row.totalAmountMinor, currency: row.totalCurrency },
    placedAt: row.placedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Prisma raises P2002 when a unique constraint is violated. We catch it on
// `clientRequestId` to detect concurrent retries that lost the race to insert.
function isUniqueViolation(err: unknown, target: string): boolean {
  const e = err as { code?: string; meta?: { target?: string[] | string } };
  if (e?.code !== "P2002") return false;
  const t = e.meta?.target;
  return Array.isArray(t) ? t.includes(target) : t === target;
}

@Injectable()
export class OrdersService implements OnModuleInit {
  private readonly logger = new Logger(OrdersService.name);
  private cache: Order[] = [];
  // Idempotency index: clientRequestId → orderId. Lets a retried checkout
  // short-circuit before the seq/tx/decrement work even runs.
  private idempotencyIndex = new Map<string, string>();
  private nextOrderSeq = 1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEvents: DomainEventsService,
    private readonly catalog: CatalogService,
  ) {}

  async onModuleInit() {
    const rows = await this.prisma.order.findMany({
      include: { lines: true },
      orderBy: { placedAt: "asc" },
    });
    this.cache = rows.map(toOrder);
    for (const row of rows) {
      if (row.clientRequestId) {
        this.idempotencyIndex.set(row.clientRequestId, row.orderId);
      }
    }
    const maxSeq = this.cache
      .map((o) => {
        const m = o.orderId.match(/^ord_(\d+)$/);
        return m ? parseInt(m[1]!, 10) : 0;
      })
      .reduce((a, b) => Math.max(a, b), 0);
    this.nextOrderSeq = maxSeq + 1;
  }

  // Lookup for idempotent replay. Returns undefined when the key is unknown
  // or has not been associated with an order yet.
  findByClientRequestId(clientRequestId: string): Order | undefined {
    const orderId = this.idempotencyIndex.get(clientRequestId);
    if (!orderId) return undefined;
    return this.cache.find((o) => o.orderId === orderId);
  }

  listAll(): ReadonlyArray<Order> {
    return this.cache;
  }

  get(orderId: string): Order {
    const order = this.cache.find((o) => o.orderId === orderId);
    if (!order) {
      throw new NotFoundException(`order ${orderId} not found`);
    }
    return order;
  }

  async create(input: CreateOrderInput): Promise<Order> {
    return tracer.startActiveSpan("orders.create", async (span) => {
      try {
        // Fast-path idempotent replay: caller retried with the same key.
        // No seq allocation, no transaction, no inventory work.
        if (input.clientRequestId) {
          const replay = this.findByClientRequestId(input.clientRequestId);
          if (replay) {
            span.setAttribute("order.id", replay.orderId);
            span.setAttribute("order.idempotent_replay", true);
            this.logger.log(
              `idempotent replay key=${input.clientRequestId} order=${replay.orderId}`,
            );
            return replay;
          }
        }

        const orderId = `ord_${String(this.nextOrderSeq).padStart(3, "0")}`;
        this.nextOrderSeq += 1;
        span.setAttribute("order.id", orderId);
        span.setAttribute("order.line_count", input.lines.length);

        // Atomic per-line CAS: `inventory >= quantity` is checked in the same
        // UPDATE that decrements, so concurrent checkouts cannot oversell.
        // A failed guard (count !== 1) throws inside the transaction so the
        // order row and any prior decrements roll back together.
        let row: DbOrder & { lines: DbOrderLine[] };
        try {
          row = await this.prisma.$transaction(async (tx) => {
            for (const line of input.lines) {
              const result = await tx.product.updateMany({
                where: {
                  productId: line.productId,
                  inventory: { gte: line.quantity },
                },
                data: { inventory: { decrement: line.quantity } },
              });
              if (result.count !== 1) {
                throw new ConflictException(
                  `insufficient inventory for product ${line.productId}`,
                );
              }
            }
            return tx.order.create({
              data: {
                orderId,
                clientRequestId: input.clientRequestId ?? null,
                customerName: input.customerName,
                status: "pending",
                totalAmountMinor: input.total.amountMinor,
                totalCurrency: input.total.currency,
                placedAt: new Date(),
                lines: {
                  create: input.lines.map((line) => ({
                    productId: line.productId,
                    name: line.name,
                    quantity: line.quantity,
                    unitAmountMinor: line.unitPrice.amountMinor,
                    unitCurrency: line.unitPrice.currency,
                    lineAmountMinor: line.lineTotal.amountMinor,
                    lineCurrency: line.lineTotal.currency,
                  })),
                },
              },
              include: { lines: true },
            });
          });
        } catch (err) {
          // Concurrent-retry race: another transaction committed the same key
          // first. Our transaction (including any decrements) rolled back, so
          // it's safe to return the winner without touching inventory.
          if (input.clientRequestId && isUniqueViolation(err, "clientRequestId")) {
            const winner = await this.prisma.order.findUnique({
              where: { clientRequestId: input.clientRequestId },
              include: { lines: true },
            });
            if (winner) {
              const replay = toOrder(winner);
              if (!this.cache.find((o) => o.orderId === replay.orderId)) {
                this.cache.push(replay);
              }
              this.idempotencyIndex.set(input.clientRequestId, replay.orderId);
              span.setAttribute("order.id", replay.orderId);
              span.setAttribute("order.idempotent_replay", true);
              this.logger.log(
                `idempotent replay (race) key=${input.clientRequestId} order=${replay.orderId}`,
              );
              return replay;
            }
          }
          throw err;
        }

        for (const line of input.lines) {
          this.catalog.applyInventoryDelta(line.productId, -line.quantity);
        }
        const order = toOrder(row);
        this.cache.push(order);
        if (input.clientRequestId) {
          this.idempotencyIndex.set(input.clientRequestId, order.orderId);
        }
        this.logger.log(`order created id=${orderId} total=${input.total.amountMinor}`);
        this.domainEvents.emit();
        return order;
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        throw err;
      } finally {
        span.end();
      }
    });
  }

  async manage(orderId: string, payload: ManageOrderDto): Promise<ManageOrderResponse> {
    return tracer.startActiveSpan("orders.manage", async (span) => {
      try {
        span.setAttribute("order.id", orderId);
        span.setAttribute("order.action", payload.action);

        const current = this.get(orderId);
        const previousStatus = current.status;

        const nextStatus: OrderStatus = (() => {
          switch (payload.action) {
            case "cancel":
              return "cancelled";
            case "mark_prepared":
              return "prepared";
            case "update_status":
              if (!payload.nextStatus) {
                throw new BadRequestException(
                  "nextStatus is required when action is update_status",
                );
              }
              return payload.nextStatus;
          }
        })();

        await this.prisma.order.update({
          where: { orderId },
          data: { status: nextStatus },
        });

        const acceptedAt = new Date().toISOString();
        const idx = this.cache.findIndex((o) => o.orderId === orderId);
        this.cache[idx] = { ...current, status: nextStatus, updatedAt: acceptedAt };

        this.logger.log(
          `manage order=${orderId} action=${payload.action} ${previousStatus} -> ${nextStatus}`,
        );
        this.domainEvents.emit();

        return {
          orderId,
          action: payload.action,
          previousStatus,
          status: nextStatus,
          acceptedAt,
        };
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        throw err;
      } finally {
        span.end();
      }
    });
  }
}
