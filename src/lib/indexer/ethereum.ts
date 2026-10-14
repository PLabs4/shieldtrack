import { type Address, type Hex } from "viem";
import { config } from "@/lib/config";
import {
  TORNADO_DEPOSIT,
  TORNADO_ETH_POOLS,
  TORNADO_WITHDRAWAL,
  parseTornadoLog,
} from "@/lib/protocols/tornado";
import {
  RAILGUN_DEPLOYMENTS,
  RAILGUN_EVENTS,
  parseRailgunLog,
} from "@/lib/protocols/railgun";
import type { ParsedGateEvent } from "@/lib/types";
import { getCursor, persistGateEvents, setCursor } from "@/lib/indexer/store";
import { createEthClient } from "@/lib/rpc";

function ethClient() {
  return createEthClient();
}

async function resolveStartBlock(
  client: ReturnType<typeof ethClient>,
  cursorId: string,
): Promise<bigint> {
  const latest = await client.getBlockNumber();
  const saved = await getCursor(cursorId);
  if (saved != null) return saved + 1n;
  const lookback = BigInt(config.lookbackBlocks);
  return latest > lookback ? latest - lookback : 0n;
}

async function getTxFromMap(
  client: ReturnType<typeof ethClient>,
  hashes: string[],
): Promise<Map<string, Address>> {
  const map = new Map<string, Address>();
  const unique = [...new Set(hashes)];
  const concurrency = 8;
  for (let i = 0; i < unique.length; i += concurrency) {
    const slice = unique.slice(i, i + concurrency);
    const rows = await Promise.all(
      slice.map(async (hash) => {
        try {
          const tx = await client.getTransaction({ hash: hash as Hex });
          return [hash, tx.from] as const;
        } catch {
          return null;
        }
      }),
    );
    for (const row of rows) {
      if (row) map.set(row[0], row[1]);
    }
  }
  return map;
}

async function getBlockTimeMap(
  client: ReturnType<typeof ethClient>,
  blockNumbers: bigint[],
): Promise<Map<string, Date>> {
  const map = new Map<string, Date>();
  const unique = [...new Set(blockNumbers.map((b) => b.toString()))];
  const concurrency = 8;
  for (let i = 0; i < unique.length; i += concurrency) {
    const slice = unique.slice(i, i + concurrency);
    const rows = await Promise.all(
      slice.map(async (n) => {
        try {
          const block = await client.getBlock({ blockNumber: BigInt(n) });
          return [n, new Date(Number(block.timestamp) * 1000)] as const;
        } catch {
          return null;
        }
      }),
    );
    for (const row of rows) {
      if (row) map.set(row[0], row[1]);
    }
  }
  return map;
}

export async function indexTornadoEthereum(): Promise<number> {
  const client = ethClient();
  const cursorId = "tornado:1:pools";
  const latest = await client.getBlockNumber();
  let from = await resolveStartBlock(client, cursorId);
  let inserted = 0;
  const chunk = BigInt(Math.min(config.logChunk, 800));

  while (from <= latest) {
    const to = from + chunk - 1n > latest ? latest : from + chunk - 1n;
    const parsed: ParsedGateEvent[] = [];

    // Query pools in small batches — public RPCs often reject large multi-address filters.
    for (let i = 0; i < TORNADO_ETH_POOLS.length; i += 3) {
      const batch = TORNADO_ETH_POOLS.slice(i, i + 3);
      const logs = await client.getLogs({
        address: batch.map((p) => p.address),
        events: [TORNADO_DEPOSIT, TORNADO_WITHDRAWAL],
        fromBlock: from,
        toBlock: to,
      });

      if (logs.length === 0) continue;

      const txFrom = await getTxFromMap(
        client,
        logs.map((l) => l.transactionHash!).filter(Boolean),
      );
      const blockTimes = await getBlockTimeMap(
        client,
        logs
          .map((l) => l.blockNumber)
          .filter((b): b is bigint => b != null),
      );

      for (const log of logs) {
        const bt =
          (log.blockNumber != null
            ? blockTimes.get(log.blockNumber.toString())
            : null) ?? new Date();
        const fromAddr = log.transactionHash
          ? (txFrom.get(log.transactionHash) ?? null)
          : null;
        const event = parseTornadoLog(log, fromAddr, bt);
        if (event) parsed.push(event);
      }
    }

    if (parsed.length > 0) {
      inserted += await persistGateEvents(parsed);
    }

    await setCursor({
      id: cursorId,
      protocol: "tornado",
      chainId: 1,
      cursorKey: "pools",
      blockNumber: to,
    });
    from = to + 1n;
  }

  return inserted;
}

export async function indexRailgunEthereum(): Promise<number> {
  const client = ethClient();
  const deployment = RAILGUN_DEPLOYMENTS[0];
  const cursorId = `railgun:${deployment.chainId}:${deployment.cursorKey}`;
  const latest = await client.getBlockNumber();
  let from = await resolveStartBlock(client, cursorId);
  let inserted = 0;

  while (from <= latest) {
    const to =
      from + BigInt(config.logChunk) - 1n > latest
        ? latest
        : from + BigInt(config.logChunk) - 1n;

    const logs = await client.getLogs({
      address: deployment.address,
      events: [...RAILGUN_EVENTS],
      fromBlock: from,
      toBlock: to,
    });

    if (logs.length > 0) {
      const txFrom = await getTxFromMap(
        client,
        logs.map((l) => l.transactionHash!).filter(Boolean),
      );
      const blockTimes = await getBlockTimeMap(
        client,
        logs
          .map((l) => l.blockNumber)
          .filter((b): b is bigint => b != null),
      );

      const parsed: ParsedGateEvent[] = [];
      for (const log of logs) {
        const bt =
          (log.blockNumber != null
            ? blockTimes.get(log.blockNumber.toString())
            : null) ?? new Date();
        const fromAddr = log.transactionHash
          ? (txFrom.get(log.transactionHash) ?? null)
          : null;
        parsed.push(
          ...parseRailgunLog(
            log,
            fromAddr,
            bt,
            deployment.chainId,
            deployment.chainLabel,
          ),
        );
      }
      inserted += await persistGateEvents(parsed);
    }

    await setCursor({
      id: cursorId,
      protocol: "railgun",
      chainId: deployment.chainId,
      cursorKey: deployment.cursorKey,
      blockNumber: to,
    });
    from = to + 1n;
  }

  return inserted;
}
