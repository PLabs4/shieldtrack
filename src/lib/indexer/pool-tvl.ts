import {
  type Address,
  createPublicClient,
  erc20Abi,
  formatUnits,
  http,
} from "viem";
import { mainnet } from "viem/chains";
import { config } from "@/lib/config";
import { TORNADO_ETH_POOLS } from "@/lib/protocols/tornado";
import { RAILGUN_ETH_ADDRESS } from "@/lib/protocols/railgun";
import { getUsdPrices } from "@/lib/indexer/prices";
import type { ProtocolId } from "@/lib/types";

export type PoolTvl = {
  protocol: ProtocolId;
  tvlUsd: number | null;
  label: string | null;
};

const CACHE_TTL_MS = 5 * 60_000;
let cache: { at: number; values: Record<ProtocolId, PoolTvl> } | null = null;

const RAILGUN_TOKENS: Array<{
  address: Address | null;
  symbol: string;
  decimals: number;
}> = [
  { address: null, symbol: "ETH", decimals: 18 },
  {
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    symbol: "USDC",
    decimals: 6,
  },
  {
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    symbol: "USDT",
    decimals: 6,
  },
  {
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    symbol: "DAI",
    decimals: 18,
  },
  {
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    symbol: "WETH",
    decimals: 18,
  },
  {
    address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    symbol: "WBTC",
    decimals: 8,
  },
];

function formatUsdCompact(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

function ethClient() {
  return createPublicClient({
    chain: mainnet,
    transport: http(config.ethRpcUrl, { timeout: 20_000, retryCount: 1 }),
  });
}

async function fetchTornadoTvl(): Promise<number | null> {
  const client = ethClient();
  const prices = await getUsdPrices(["ETH", "DAI", "USDC", "USDT", "WBTC"]);
  // If oracle is down, still price ETH pools with a conservative fallback.
  if (prices.ETH == null) prices.ETH = 2500;

  const amounts = await Promise.all(
    TORNADO_ETH_POOLS.map(async (pool) => {
      try {
        if (!pool.tokenAddress) {
          const bal = await client.getBalance({ address: pool.address });
          return { symbol: pool.symbol, amount: Number(formatUnits(bal, 18)) };
        }
        const bal = await client.readContract({
          address: pool.tokenAddress,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [pool.address],
        });
        return {
          symbol: pool.symbol,
          amount: Number(formatUnits(bal, pool.decimals)),
        };
      } catch {
        return { symbol: pool.symbol, amount: 0 };
      }
    }),
  );

  let total = 0;
  for (const row of amounts) {
    const px =
      prices[row.symbol] ??
      (row.symbol === "DAI" || row.symbol === "USDC" || row.symbol === "USDT"
        ? 1
        : null);
    if (px != null) total += row.amount * px;
  }

  return total > 0 ? total : null;
}

async function fetchRailgunTvl(): Promise<number | null> {
  try {
    const client = ethClient();
    const prices = await getUsdPrices([
      "ETH",
      "WETH",
      "USDC",
      "USDT",
      "DAI",
      "WBTC",
    ]);
    let total = 0;

    const amounts = await Promise.all(
      RAILGUN_TOKENS.map(async (token) => {
        if (!token.address) {
          const bal = await client.getBalance({ address: RAILGUN_ETH_ADDRESS });
          return {
            symbol: token.symbol,
            amount: Number(formatUnits(bal, 18)),
          };
        }
        const bal = await client.readContract({
          address: token.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [RAILGUN_ETH_ADDRESS],
        });
        return {
          symbol: token.symbol,
          amount: Number(formatUnits(bal, token.decimals)),
        };
      }),
    );

    for (const row of amounts) {
      const px =
        prices[row.symbol] ??
        (row.symbol === "USDC" ||
        row.symbol === "USDT" ||
        row.symbol === "DAI"
          ? 1
          : null);
      if (px != null) total += row.amount * px;
    }

    return total > 0 ? total : null;
  } catch {
    return null;
  }
}

async function fetchZcashShieldedTvl(): Promise<{
  tvlUsd: number | null;
  label: string | null;
}> {
  try {
    const base = config.zcashApiBase.replace(/\/$/, "");
    const res = await fetch(`${base}/privacy-stats`, {
      signal: AbortSignal.timeout(12_000),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return { tvlUsd: null, label: null };
    const data = (await res.json()) as {
      shieldedPool?: { currentSize?: number };
    };
    const zec = data.shieldedPool?.currentSize;
    if (zec == null || !Number.isFinite(zec)) {
      return { tvlUsd: null, label: null };
    }
    const prices = await getUsdPrices(["ZEC"]);
    const px = prices.ZEC ?? 40;
    const tvlUsd = zec * px;
    const zecLabel =
      zec >= 1_000_000
        ? `${(zec / 1_000_000).toFixed(2)}M ZEC`
        : `${Math.round(zec).toLocaleString()} ZEC`;
    return {
      tvlUsd,
      label: tvlUsd != null ? formatUsdCompact(tvlUsd) : zecLabel,
    };
  } catch {
    return { tvlUsd: null, label: null };
  }
}

export async function getPoolTvls(): Promise<Record<ProtocolId, PoolTvl>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.values;

  const [tornado, railgun, zcash] = await Promise.all([
    fetchTornadoTvl(),
    fetchRailgunTvl(),
    fetchZcashShieldedTvl(),
  ]);

  const values: Record<ProtocolId, PoolTvl> = {
    tornado: {
      protocol: "tornado",
      tvlUsd: tornado,
      label: tornado != null ? formatUsdCompact(tornado) : null,
    },
    railgun: {
      protocol: "railgun",
      tvlUsd: railgun,
      label: railgun != null ? formatUsdCompact(railgun) : null,
    },
    zcash: {
      protocol: "zcash",
      tvlUsd: zcash.tvlUsd,
      label: zcash.label,
    },
  };

  const anyValue = Object.values(values).some(
    (v) => v.tvlUsd != null || v.label != null,
  );
  if (anyValue) {
    cache = { at: now, values };
  }
  return values;
}
