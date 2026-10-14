import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { classifyTier } from "@/lib/thresholds";
import type { ParsedGateEvent } from "@/lib/types";
import { getUsdPrices, usdForAmount } from "@/lib/indexer/prices";

export async function persistGateEvents(
  events: ParsedGateEvent[],
): Promise<number> {
  if (events.length === 0) return 0;

  const prices = await getUsdPrices(events.map((e) => e.assetSymbol));
  let inserted = 0;

  for (const event of events) {
    const amountUsd = usdForAmount(
      event.assetSymbol,
      event.amountFormatted,
      prices,
    );
    const tier = classifyTier(amountUsd);

    const existing = await prisma.gateEvent.findUnique({
      where: {
        protocol_chainId_txHash_logIndex_direction: {
          protocol: event.protocol,
          chainId: event.chainId,
          txHash: event.txHash,
          logIndex: event.logIndex,
          direction: event.direction,
        },
      },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.gateEvent.create({
      data: {
        protocol: event.protocol,
        direction: event.direction,
        chainId: event.chainId,
        chainLabel: event.chainLabel,
        assetSymbol: event.assetSymbol,
        assetAddress: event.assetAddress,
        amountRaw: event.amountRaw,
        amountFormatted: new Prisma.Decimal(event.amountFormatted.toString()),
        amountUsd:
          amountUsd == null ? null : new Prisma.Decimal(amountUsd.toFixed(8)),
        tier,
        fromAddress: event.fromAddress,
        toAddress: event.toAddress,
        counterparty: event.counterparty,
        txHash: event.txHash,
        logIndex: event.logIndex,
        blockNumber: event.blockNumber,
        blockTime: event.blockTime,
        poolLabel: event.poolLabel,
        relayer: event.relayer,
        feeRaw: event.feeRaw,
        meta: event.meta ? (event.meta as Prisma.InputJsonValue) : undefined,
      },
    });
    inserted += 1;
  }

  return inserted;
}

export async function getCursor(id: string): Promise<bigint | null> {
  const row = await prisma.indexerCursor.findUnique({ where: { id } });
  return row?.blockNumber ?? null;
}

export async function setCursor(input: {
  id: string;
  protocol: "tornado" | "railgun" | "zcash";
  chainId: number;
  cursorKey: string;
  blockNumber: bigint;
}): Promise<void> {
  await prisma.indexerCursor.upsert({
    where: { id: input.id },
    create: {
      id: input.id,
      protocol: input.protocol,
      chainId: input.chainId,
      cursorKey: input.cursorKey,
      blockNumber: input.blockNumber,
    },
    update: {
      blockNumber: input.blockNumber,
    },
  });
}

export async function touchIndexerHeartbeat(): Promise<void> {
  await prisma.appMeta.upsert({
    where: { key: "indexer:lastTickAt" },
    create: {
      key: "indexer:lastTickAt",
      value: new Date().toISOString(),
    },
    update: {
      value: new Date().toISOString(),
    },
  });
}

/** Fill amountUsd/tier for rows stored while the price oracle was down. */
export async function backfillMissingUsd(limit = 400): Promise<number> {
  const rows = await prisma.gateEvent.findMany({
    where: { amountUsd: null },
    orderBy: [{ blockTime: "desc" }],
    take: limit,
  });
  if (rows.length === 0) return 0;

  const prices = await getUsdPrices(rows.map((r) => r.assetSymbol));
  let updated = 0;
  for (const row of rows) {
    const usd = usdForAmount(
      row.assetSymbol,
      Number(row.amountFormatted),
      prices,
    );
    if (usd == null || !Number.isFinite(usd)) continue;
    await prisma.gateEvent.update({
      where: { id: row.id },
      data: {
        amountUsd: new Prisma.Decimal(usd.toFixed(8)),
        tier: classifyTier(usd),
      },
    });
    updated += 1;
  }
  return updated;
}
