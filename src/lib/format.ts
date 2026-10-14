import type { GateEventDTO } from "@/lib/types";
import type { GateEvent } from "@prisma/client";

export function shortenAddress(value: string | null | undefined, size = 4): string {
  if (!value) return "—";
  if (value === "shielded") return "shielded";
  if (value.length <= size * 2 + 2) return value;
  return `${value.slice(0, size + 2)}…${value.slice(-size)}`;
}

export function formatAmount(value: number | string, digits = 4): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return n.toFixed(Math.min(digits, 4));
  if (n >= 0.0001) return n.toFixed(6);
  return n.toExponential(2);
}

export function formatUsd(value: number | string | null | undefined): string {
  if (value == null) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  }).format(n);
}

/** Stable HH:MM:SS UTC — safe for SSR (no locale/timezone drift). */
export function formatClockTime(iso: string): string {
  return new Date(iso).toISOString().slice(11, 19);
}

/** Compact spot price for the price strip. */
export function formatSpotPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (value >= 1) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}

/** Signed 24h percent change for the price strip. */
export function formatChange24h(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const digits = abs >= 10 ? 1 : 2;
  const body = abs.toFixed(digits);
  if (value > 0) return `+${body}%`;
  if (value < 0) return `−${body}%`;
  return `${body}%`;
}

/** Best-effort USD notional for filtering large history rows. */
export function estimateNotionalUsd(
  event: {
    amountUsd: string | null;
    amountFormatted: string | number;
    assetSymbol: string;
  },
  prices?: Record<string, number>,
): number | null {
  if (event.amountUsd != null) {
    const n = Number(event.amountUsd);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const amount = Number(event.amountFormatted);
  if (!Number.isFinite(amount)) return null;
  const symbol = event.assetSymbol.toUpperCase();
  const live = prices?.[symbol];
  if (typeof live === "number" && Number.isFinite(live) && live > 0) {
    return amount * live;
  }
  if (symbol === "USDC" || symbol === "USDT" || symbol === "DAI") return amount;
  // Fallbacks when oracle/cache miss — keep close to spot so ZEC paths stay usable.
  if (symbol === "ETH" || symbol === "WETH") return amount * 2500;
  if (symbol === "WBTC" || symbol === "BTC") return amount * 80_000;
  if (symbol === "ZEC") return amount * 1200;
  return null;
}

/** Attach live USD onto events that were stored without amountUsd. */
export function withLiveUsd<T extends {
  amountUsd: string | null;
  amountFormatted: string | number;
  assetSymbol: string;
}>(event: T, prices: Record<string, number>): T {
  const usd = estimateNotionalUsd(event, prices);
  if (usd == null) return event;
  if (event.amountUsd != null && Number(event.amountUsd) > 0) return event;
  return { ...event, amountUsd: usd.toFixed(8) };
}

export function toEventDTO(row: GateEvent): GateEventDTO {
  return {
    id: row.id,
    protocol: row.protocol,
    direction: row.direction,
    chainId: row.chainId,
    chainLabel: row.chainLabel,
    assetSymbol: row.assetSymbol,
    assetAddress: row.assetAddress,
    amountRaw: row.amountRaw,
    amountFormatted: row.amountFormatted.toString(),
    amountUsd: row.amountUsd?.toString() ?? null,
    tier: row.tier,
    fromAddress: row.fromAddress,
    toAddress: row.toAddress,
    counterparty: row.counterparty,
    txHash: row.txHash,
    logIndex: row.logIndex,
    blockNumber: row.blockNumber?.toString() ?? null,
    blockTime: row.blockTime.toISOString(),
    poolLabel: row.poolLabel,
    relayer: row.relayer,
    feeRaw: row.feeRaw,
  };
}

export function explorerTxUrl(chainId: number, txHash: string): string | null {
  if (!txHash) return null;
  switch (chainId) {
    case 1:
      return `https://etherscan.io/tx/${txHash}`;
    case 42161:
      return `https://arbiscan.io/tx/${txHash}`;
    case 137:
      return `https://polygonscan.com/tx/${txHash}`;
    case 56:
      return `https://bscscan.com/tx/${txHash}`;
    case 133:
      return `https://cipherscan.app/tx/${txHash}`;
    default:
      return null;
  }
}

export function explorerAddressUrl(
  chainId: number,
  address: string | null | undefined,
): string | null {
  if (!address || address === "shielded") return null;
  switch (chainId) {
    case 1:
      return `https://etherscan.io/address/${address}`;
    case 42161:
      return `https://arbiscan.io/address/${address}`;
    case 137:
      return `https://polygonscan.com/address/${address}`;
    case 56:
      return `https://bscscan.com/address/${address}`;
    case 133:
      return `https://cipherscan.app/address/${address}`;
    default:
      return null;
  }
}

/** Public-side counterparty role for gate events. */
export function counterpartyRole(event: {
  direction: "in" | "out";
  counterparty: string | null;
  protocol: string;
}): { label: string; kind: "from" | "to" | "shielded" } {
  if (!event.counterparty || event.counterparty === "shielded") {
    return { label: "Shielded", kind: "shielded" };
  }
  if (event.direction === "in") {
    return { label: "From address", kind: "from" };
  }
  return { label: "To address", kind: "to" };
}

/** Absolute UTC stamp for investigate rows: YYYY-MM-DD HH:MM:SSZ */
export function formatUtcStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

/** Best-effort fee in asset units from raw fee / amount ratio. */
export function formatFee(event: {
  feeRaw: string | null;
  amountRaw: string;
  amountFormatted: string | number;
  assetSymbol: string;
}): string | null {
  if (!event.feeRaw || event.feeRaw === "0") return null;
  try {
    const fee = BigInt(event.feeRaw);
    if (fee === 0n) return null;
    const raw = BigInt(event.amountRaw || "0");
    const amt = Number(event.amountFormatted);
    if (raw > 0n && Number.isFinite(amt) && amt > 0) {
      const feeAmt = (Number(fee) / Number(raw)) * amt;
      if (Number.isFinite(feeAmt)) {
        return `${formatAmount(feeAmt)} ${event.assetSymbol}`;
      }
    }
  } catch {
    // fall through
  }
  return null;
}
