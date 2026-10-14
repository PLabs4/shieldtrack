function num(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  ethRpcUrl: process.env.ETH_RPC_URL ?? "https://eth.llamarpc.com",
  arbitrumRpcUrl: process.env.ARBITRUM_RPC_URL,
  polygonRpcUrl: process.env.POLYGON_RPC_URL,
  bscRpcUrl: process.env.BSC_RPC_URL,
  lookbackBlocks: num(process.env.INDEXER_LOOKBACK_BLOCKS, 7200),
  pollMs: num(process.env.INDEXER_POLL_MS, 8000),
  logChunk: num(process.env.INDEXER_LOG_CHUNK, 2000),
  largeUsd: num(process.env.LARGE_USD, 50_000),
  ultraUsd: num(process.env.ULTRA_USD, 500_000),
  /** History panel only shows transfers at/above this USD notional. */
  historyMinUsd: num(process.env.HISTORY_MIN_USD, 100_000),
  zcashApiBase: process.env.ZCASH_API_BASE ?? "https://cipherscan.app/api",
  zcashPollMs: num(process.env.ZCASH_POLL_MS, 15_000),
  coingeckoBase:
    process.env.COINGECKO_API_BASE ?? "https://api.coingecko.com/api/v3",
} as const;
