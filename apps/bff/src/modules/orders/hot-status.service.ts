// Hot-status snapshot for the web banner: how many of the signed-in user's
// orders are hot, and when the next one cools. One aggregate against
// Postgres — never loads order rows, never reads the in-memory cache.
// Same owner rule as listForAccount, same hot rule as temperatureOf.
import { Inject, Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import {
  DEFAULT_COOL_DOWN_SECONDS,
  ORDER_COOL_DOWN_MS,
  coolsAt,
} from "./order-temperature";
import type { HotStatusResponse } from "./orders.types";

@Injectable()
export class HotStatusService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(ORDER_COOL_DOWN_MS)
    private readonly coolDownMs: number = DEFAULT_COOL_DOWN_SECONDS * 1000,
  ) {}

  async forUser(
    user: { username: string; email: string },
    now: Date = new Date(),
  ): Promise<HotStatusResponse> {
    const { _count, _min } = await this.prisma.order.aggregate({
      where: {
        OR: [{ ownerUsername: user.username }, { ownerEmail: user.email }],
        // Strict: an order exactly coolDownMs old is cold (temperatureOf uses <).
        placedAt: { gt: new Date(now.getTime() - this.coolDownMs) },
      },
      _count: { _all: true },
      _min: { placedAt: true },
    });
    const hotCount = _count._all;
    const earliest = _min.placedAt;
    return {
      hotCount,
      nextCoolsAt:
        hotCount > 0 && earliest
          ? coolsAt(earliest, this.coolDownMs).toISOString()
          : null,
      serverTime: now.toISOString(),
    };
  }
}
