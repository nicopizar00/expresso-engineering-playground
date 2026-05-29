import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
// TODO(vercel-build): @prisma/client types require `prisma generate` — ensured by package.json#build
import type { Order as DbOrder, OrderLine as DbOrderLine } from "@prisma/client";
import type { OrderStatus } from "@mini-commerce/shared-types";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { PrismaService } from "../../prisma.service";
import { DomainEventsService } from "../../core/domain-events/domain-events.service";
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

@Injectable()
export class OrdersService implements OnModuleInit {
  private readonly logger = new Logger(OrdersService.name);
  private cache: Order[] = [];
  private nextOrderSeq = 1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEvents: DomainEventsService,
  ) {}

  async onModuleInit() {
    const rows = await this.prisma.order.findMany({
      include: { lines: true },
      orderBy: { placedAt: "asc" },
    });
    this.cache = rows.map(toOrder);
    const maxSeq = this.cache
      .map((o) => {
        const m = o.orderId.match(/^ord_(\d+)$/);
        return m ? parseInt(m[1]!, 10) : 0;
      })
      .reduce((a, b) => Math.max(a, b), 0);
    this.nextOrderSeq = maxSeq + 1;
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
        const orderId = `ord_${String(this.nextOrderSeq).padStart(3, "0")}`;
        this.nextOrderSeq += 1;
        span.setAttribute("order.id", orderId);
        span.setAttribute("order.line_count", input.lines.length);

        const row = await this.prisma.order.create({
          data: {
            orderId,
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

        const order = toOrder(row);
        this.cache.push(order);
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
