import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { estimateNotionalUsd, toEventDTO } from "@/lib/format";
import { getPoolTvls } from "@/lib/indexer/pool-tvl";
import {
  getAssetPriceQuotes,
  isPricableSymbol,
} from "@/lib/indexer/prices";
import type {
  DashboardSnapshot,
  GateEventDTO,
  ProtocolId,
  ProtocolStats,
} from "@/lib/types";

const PROTOCOLS: ProtocolId[] = ["tornado", "railgun", "zcash"];

export async function listEvents(input: {
  limit?: number;
  afterId?: string;
  protocol?: ProtocolId;
  direction?: "in" | "out";
  tier?: "normal" | "large" | "ultra";
  since?: Date;
  until?: Date;
  minUsd?: number;
  address?: string;
}): Promise<GateEventDTO[]> {
  const take =
    input.minUsd != null || input.address
      ? Math.max(input.limit ?? 100, 500)
      : (input.limit ?? 100);

  const address = input.address?.trim();
  const addressVariants = address
    ? address.startsWith("0x")
      ? [...new Set([address, address.toLowerCase(), address.toUpperCase()])]
      : [address]
    : null;

  const rows = await prisma.gateEvent.findMany({
    where: {
      protocol: input.protocol,
      direction: input.direction,
      tier: input.tier,
      blockTime:
        input.since || input.until
          ? {
              ...(input.since ? { gte: input.since } : {}),
              ...(input.until ? { lte: input.until } : {}),
            }
          : undefined,
      ...(input.afterId
        ? {
            id: { gt: input.afterId },
          }
        : {}),
      ...(addressVariants
        ? {
            OR: [
              { counterparty: { in: addressVariants } },
              { fromAddress: { in: addressVariants } },
              { toAddress: { in: addressVariants } },
              { relayer: { in: addressVariants } },
            ],
          }
        : {}),
    },
    orderBy: [{ blockTime: "desc" }, { id: "desc" }],
    take,
  });

  let events = rows.map(toEventDTO);
  if (input.minUsd != null) {
    events = events
      .filter((e) => {
        const usd = estimateNotionalUsd(e);
        return usd != null && usd >= input.minUsd!;
      })
      .slice(0, input.limit ?? 100);
  }
  return events;
}

export async function getEventById(id: string): Promise<GateEventDTO | null> {
  const row = await prisma.gateEvent.findUnique({ where: { id } });
  return row ? toEventDTO(row) : null;
}

/** Events in a time window around a focus, for investigate candidates. */
export async function listEventsAround(input: {
  center: Date;
  windowMin: number;
  limit?: number;
}): Promise<GateEventDTO[]> {
  const ms = input.windowMin * 60_000;
  const since = new Date(input.center.getTime() - ms);
  const until = new Date(input.center.getTime() + ms);
  return listEvents({
    since,
    until,
    limit: input.limit ?? 300,
  });
}

/**
 * Recent events balanced across protocols × IN/OUT so one busy gate
 * (e.g. Zcash) cannot empty the other columns.
 */
export async function listBalancedLiveEvents(input?: {
  perSide?: number;
}): Promise<GateEventDTO[]> {
  const perSide = input?.perSide ?? 30;
  const batches = await Promise.all(
    PROTOCOLS.flatMap((protocol) =>
      (["in", "out"] as const).map((direction) =>
        listEvents({ protocol, direction, limit: perSide }),
      ),
    ),
  );
  const byId = new Map<string, GateEventDTO>();
  for (const batch of batches) {
    for (const event of batch) byId.set(event.id, event);
  }
  return Array.from(byId.values()).sort(
    (a, b) =>
      new Date(b.blockTime).getTime() - new Date(a.blockTime).getTime() ||
      b.id.localeCompare(a.id),
  );
}

export async function listEventsSinceCursor(input: {
  afterBlockTime?: Date;
  afterId?: string;
  limit?: number;
}): Promise<GateEventDTO[]> {
  const rows = await prisma.gateEvent.findMany({
    where: input.afterBlockTime
      ? {
          OR: [
            { blockTime: { gt: input.afterBlockTime } },
            {
              AND: [
                { blockTime: input.afterBlockTime },
                input.afterId ? { id: { gt: input.afterId } } : {},
              ],
            },
          ],
        }
      : undefined,
    orderBy: [{ blockTime: "asc" }, { id: "asc" }],
    take: input.limit ?? 100,
  });
  return rows.map(toEventDTO);
}

async function protocolStats(since: Date): Promise<ProtocolStats[]> {
  const result: ProtocolStats[] = [];
  const tvls = await getPoolTvls();

  for (const protocol of PROTOCOLS) {
    const [inAgg, outAgg, lastIn, lastOut] = await Promise.all([
      prisma.gateEvent.aggregate({
        where: { protocol, direction: "in", blockTime: { gte: since } },
        _count: true,
        _sum: { amountUsd: true },
      }),
      prisma.gateEvent.aggregate({
        where: { protocol, direction: "out", blockTime: { gte: since } },
        _count: true,
        _sum: { amountUsd: true },
      }),
      prisma.gateEvent.findFirst({
        where: { protocol, direction: "in" },
        orderBy: [{ blockTime: "desc" }, { id: "desc" }],
      }),
      prisma.gateEvent.findFirst({
        where: { protocol, direction: "out" },
        orderBy: [{ blockTime: "desc" }, { id: "desc" }],
      }),
    ]);

    const tvl = tvls[protocol];
    result.push({
      protocol,
      inCount: inAgg._count,
      outCount: outAgg._count,
      inUsd: Number(inAgg._sum.amountUsd ?? 0),
      outUsd: Number(outAgg._sum.amountUsd ?? 0),
      poolTvlUsd: tvl?.tvlUsd ?? null,
      poolTvlLabel: tvl?.label ?? null,
      lastInEvent: lastIn ? toEventDTO(lastIn) : null,
      lastOutEvent: lastOut ? toEventDTO(lastOut) : null,
    });
  }

  return result;
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const startedMeta = await prisma.appMeta.findUnique({
    where: { key: "app:startedAt" },
  });
  const startedAt = startedMeta?.value ?? new Date().toISOString();
  if (!startedMeta) {
    await prisma.appMeta.create({
      data: { key: "app:startedAt", value: startedAt },
    });
  }

  const heartbeat = await prisma.appMeta.findUnique({
    where: { key: "indexer:lastTickAt" },
  });
  // Well counters: rolling 24h window of indexed public gate flow.
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [stats, live, history, ultra, seenSymbols] = await Promise.all([
    protocolStats(since24h),
    // Per-protocol IN/OUT so Zcash volume cannot blank TC/RG columns.
    listBalancedLiveEvents({ perSide: 35 }),
    // History panel is large-notional only (default ≥ $100k).
    listEvents({ limit: 120, minUsd: config.historyMinUsd }),
    prisma.gateEvent.findFirst({
      where: { tier: "ultra" },
      orderBy: [{ blockTime: "desc" }, { id: "desc" }],
    }),
    prisma.gateEvent.findMany({
      distinct: ["assetSymbol"],
      select: { assetSymbol: true },
      orderBy: { assetSymbol: "asc" },
    }),
  ]);

  const symbols = seenSymbols
    .map((r) => r.assetSymbol)
    .filter((s) => isPricableSymbol(s));
  // Always include core privacy-gate assets even before first sighting.
  for (const core of ["ETH", "WETH", "ZEC", "USDC", "USDT", "DAI", "WBTC"]) {
    if (!symbols.includes(core)) symbols.push(core);
  }
  const prices = await getAssetPriceQuotes(symbols);

  const lastTickAt = heartbeat?.value ?? null;
  const healthy =
    lastTickAt != null &&
    Date.now() - new Date(lastTickAt).getTime() < 60_000;

  return {
    startedAt,
    stats,
    live,
    history,
    historyMinUsd: config.historyMinUsd,
    prices,
    ultra: ultra ? toEventDTO(ultra) : null,
    indexer: {
      healthy,
      lastTickAt,
    },
  };
}
