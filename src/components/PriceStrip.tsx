"use client";

import type { AssetPriceQuote } from "@/lib/types";
import { formatChange24h, formatSpotPrice } from "@/lib/format";

type Props = {
  prices: AssetPriceQuote[];
};

function changeTone(change24h: number | null): string {
  if (change24h == null || !Number.isFinite(change24h)) return "text-muted";
  if (change24h > 0) return "text-in";
  if (change24h < 0) return "text-out";
  return "text-muted";
}

export function PriceStrip({ prices }: Props) {
  if (prices.length === 0) {
    return (
      <div className="mb-2 flex shrink-0 items-center gap-2 overflow-hidden rounded-xl border border-line bg-panel px-3 py-1.5">
        <span className="text-[10px] font-semibold tracking-wide text-muted uppercase">
          Prices
        </span>
        <span className="text-[11px] text-muted">Fetching spot quotes…</span>
      </div>
    );
  }

  return (
    <div
      className="mb-2 flex shrink-0 items-center gap-2 overflow-x-auto rounded-xl border border-line bg-panel px-3 py-1.5"
      aria-label="Live asset prices"
    >
      <span className="shrink-0 text-[10px] font-semibold tracking-wide text-muted uppercase">
        Prices
      </span>
      <div className="flex min-w-0 items-center gap-1.5">
        {prices.map((quote) => (
          <div
            key={quote.symbol}
            className="inline-flex shrink-0 items-baseline gap-1.5 rounded-md border border-line bg-bg-2 px-2 py-1"
            title={
              quote.updatedAt
                ? `${quote.symbol} · 24h ${formatChange24h(quote.change24h)} · ${quote.updatedAt.slice(11, 19)} UTC`
                : quote.symbol
            }
          >
            <span className="text-[11px] font-semibold text-gold-deep">
              {quote.symbol}
            </span>
            <span className="font-mono text-[11px] tabular-nums text-ink">
              {formatSpotPrice(quote.usd)}
            </span>
            <span
              className={`font-mono text-[10px] tabular-nums font-medium ${changeTone(quote.change24h)}`}
            >
              {formatChange24h(quote.change24h)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
