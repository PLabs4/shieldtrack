import { config } from "@/lib/config";
import {
  indexRailgunEthereum,
  indexTornadoEthereum,
} from "@/lib/indexer/ethereum";
import { indexZcash } from "@/lib/indexer/zcash-indexer";
import { touchIndexerHeartbeat } from "@/lib/indexer/store";

export type IndexerTickResult = {
  tornado: number;
  railgun: number;
  zcash: number;
  errors: string[];
};

export async function runIndexerTick(): Promise<IndexerTickResult> {
  const errors: string[] = [];
  let tornado = 0;
  let railgun = 0;
  let zcash = 0;

  try {
    tornado = await indexTornadoEthereum();
  } catch (err) {
    errors.push(`tornado: ${shortErr(err)}`);
  }

  try {
    railgun = await indexRailgunEthereum();
  } catch (err) {
    errors.push(`railgun: ${shortErr(err)}`);
  }

  try {
    zcash = await indexZcash();
  } catch (err) {
    errors.push(`zcash: ${shortErr(err)}`);
  }

  await touchIndexerHeartbeat();
  return { tornado, railgun, zcash, errors };
}

export async function runIndexerLoop(signal?: AbortSignal): Promise<void> {
  console.log(
    `[indexer] starting · poll=${config.pollMs}ms · lookback=${config.lookbackBlocks} · rpc=${config.ethRpcUrl}`,
  );

  while (!signal?.aborted) {
    const started = Date.now();
    try {
      const result = await runIndexerTick();
      console.log(
        `[indexer] tick +${Date.now() - started}ms · tornado=${result.tornado} railgun=${result.railgun} zcash=${result.zcash}` +
          (result.errors.length
            ? ` · errors=${result.errors.join(" | ")}`
            : ""),
      );
    } catch (err) {
      console.error("[indexer] tick failed", err);
    }

    await sleep(config.pollMs, signal);
  }
}

function shortErr(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const firstLine = raw.split("\n").find((l) => l.trim()) ?? raw;
  return firstLine.slice(0, 240);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
