import { config } from "@/lib/config";
import type { AssetPriceQuote } from "@/lib/types";

const CACHE_TTL_MS = 60_000;

const COINGECKO_IDS: Record<string, string> = {
  ETH: "ethereum",
  WETH: "ethereum",
  ZEC: "zcash",
  DAI: "dai",
  USDC: "usd-coin",
  USDT: "tether",
  WBTC: "wrapped-bitcoin",
  BTC: "bitcoin",
  MATIC: "matic-network",
  POL: "polygon-ecosystem-token",
  BNB: "binancecoin",
  ARB: "arbitrum",
  OP: "optimism",
  LINK: "chainlink",
  UNI: "uniswap",
  AAVE: "aave",
  CRV: "curve-dao-token",
  LDO: "lido-dao",
  RETH: "rocket-pool-eth",
  STETH: "staked-ether",
  WSTETH: "wrapped-steth",
};

const STABLES = new Set(["USDC", "USDT", "DAI", "BUSD", "TUSD", "FRAX"]);

const DISPLAY_ORDER = [
  "ETH",
  "WETH",
  "ZEC",
  "WBTC",
  "BTC",
  "USDT",
  "USDC",
  "DAI",
];

type CacheEntry = { usd: number; change24h: number | null; at: number };

const cache = new Map<string, CacheEntry>();

/** Skip truncated address placeholders used when symbol is unknown. */
export function isPricableSymbol(symbol: string): boolean {
  const s = symbol.trim().toUpperCase();
  if (!s || s.startsWith("0X")) return false;
  if (!/^[A-Z][A-Z0-9.-]{0,15}$/.test(s)) return false;
  return true;
}

export async function getUsdPrices(
  symbols: string[],
): Promise<Record<string, number>> {
  const quotes = await getAssetPriceQuotes(symbols);
  const result: Record<string, number> = {};
  for (const q of quotes) {
    if (q.usd != null) result[q.symbol] = q.usd;
  }
  return result;
}

function applyStale(
  symbols: string[],
  prices: Record<string, number>,
  changes: Record<string, number | null>,
) {
  for (const symbol of symbols) {
    const hit = cache.get(symbol);
    if (!hit) continue;
    prices[symbol] = hit.usd;
    changes[symbol] = hit.change24h;
  }
}

type OracleQuote = { usd: number; change24h: number | null };

/** DefiLlama first (spot + 24h %), CoinGecko as spot fallback. */
async function fetchOracleQuotes(
  coingeckoIds: string[],
): Promise<Record<string, OracleQuote>> {
  const out: Record<string, OracleQuote> = {};
  const keys = coingeckoIds.map((id) => `coingecko:${id}`).join(",");

  const [priceRes, changeRes] = await Promise.allSettled([
    fetch(`https://coins.llama.fi/prices/current/${keys}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    }),
    fetch(`https://coins.llama.fi/percentage/${keys}?period=1d`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    }),
  ]);

  let priceMap: Record<string, number> = {};
  let changeMap: Record<string, number> = {};

  if (priceRes.status === "fulfilled" && priceRes.value.ok) {
    try {
      const data = (await priceRes.value.json()) as {
        coins?: Record<string, { price?: number }>;
      };
      for (const id of coingeckoIds) {
        const price = data.coins?.[`coingecko:${id}`]?.price;
        if (typeof price === "number" && Number.isFinite(price)) {
          priceMap[id] = price;
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  if (changeRes.status === "fulfilled" && changeRes.value.ok) {
    try {
      const data = (await changeRes.value.json()) as {
        coins?: Record<string, number>;
      };
      for (const id of coingeckoIds) {
        const pct = data.coins?.[`coingecko:${id}`];
        if (typeof pct === "number" && Number.isFinite(pct)) {
          changeMap[id] = pct;
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  for (const id of coingeckoIds) {
    if (priceMap[id] != null) {
      out[id] = {
        usd: priceMap[id],
        change24h: changeMap[id] ?? null,
      };
    }
  }

  const stillMissing = coingeckoIds.filter((id) => out[id] == null);
  if (stillMissing.length === 0) return out;

  try {
    const url = `${config.coingeckoBase}/simple/price?ids=${stillMissing.join(",")}&vs_currencies=usd&include_24hr_change=true`;
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return out;
    const data = (await res.json()) as Record<
      string,
      { usd?: number; usd_24h_change?: number }
    >;
    for (const id of stillMissing) {
      const usd = data[id]?.usd;
      const change = data[id]?.usd_24h_change;
      if (typeof usd === "number" && Number.isFinite(usd)) {
        out[id] = {
          usd,
          change24h:
            typeof change === "number" && Number.isFinite(change)
              ? change
              : null,
        };
      }
    }
  } catch {
    // partial quotes are fine
  }

  return out;
}

export async function getAssetPriceQuotes(
  symbols: string[],
): Promise<AssetPriceQuote[]> {
  const unique = [
    ...new Set(
      symbols.map((s) => s.toUpperCase()).filter((s) => isPricableSymbol(s)),
    ),
  ].sort((a, b) => {
    const ia = DISPLAY_ORDER.indexOf(a);
    const ib = DISPLAY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const now = Date.now();
  const prices: Record<string, number> = {};
  const changes: Record<string, number | null> = {};
  const missing: string[] = [];

  for (const symbol of unique) {
    if (STABLES.has(symbol)) {
      prices[symbol] = 1;
      changes[symbol] = 0;
      cache.set(symbol, { usd: 1, change24h: 0, at: now });
      continue;
    }
    const hit = cache.get(symbol);
    if (hit && now - hit.at < CACHE_TTL_MS) {
      prices[symbol] = hit.usd;
      changes[symbol] = hit.change24h;
    } else {
      missing.push(symbol);
    }
  }

  const ids = [
    ...new Set(
      missing
        .map((s) => COINGECKO_IDS[s])
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (ids.length > 0) {
    const fetched = await fetchOracleQuotes(ids);
    for (const symbol of missing) {
      const id = COINGECKO_IDS[symbol];
      const quote = id ? fetched[id] : undefined;
      if (quote) {
        cache.set(symbol, {
          usd: quote.usd,
          change24h: quote.change24h,
          at: now,
        });
        prices[symbol] = quote.usd;
        changes[symbol] = quote.change24h;
      }
    }
  }

  const unresolved = missing.filter((s) => prices[s] == null);
  if (unresolved.length > 0) applyStale(unresolved, prices, changes);

  const nowIso = new Date().toISOString();
  return unique.map((symbol) => {
    const usd = prices[symbol];
    const hit = cache.get(symbol);
    return {
      symbol,
      usd: typeof usd === "number" ? usd : null,
      change24h:
        changes[symbol] != null && Number.isFinite(changes[symbol]!)
          ? changes[symbol]!
          : (hit?.change24h ?? null),
      updatedAt: hit
        ? new Date(hit.at).toISOString()
        : usd != null
          ? nowIso
          : null,
    };
  });
}

export function usdForAmount(
  symbol: string,
  amount: number,
  prices: Record<string, number>,
): number | null {
  const px = prices[symbol.toUpperCase()];
  if (px == null || !Number.isFinite(px)) return null;
  return amount * px;
}
