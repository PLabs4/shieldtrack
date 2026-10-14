"use client";

import { useMemo } from "react";
import type { GateEventDTO } from "@/lib/types";
import {
  estimateNotionalUsd,
  explorerTxUrl,
  formatAmount,
  formatUsd,
  shortenAddress,
} from "@/lib/format";
import { PROTOCOL_BRAND } from "@/lib/protocols/brand";

type Props = {
  events: GateEventDTO[];
  minUsd: number;
  prices?: Record<string, number>;
};

function TickerItem({
  event,
  usd,
}: {
  event: GateEventDTO;
  usd: number | null;
}) {
  const brand = PROTOCOL_BRAND[event.protocol];
  const txUrl = explorerTxUrl(event.chainId, event.txHash);
  const isIn = event.direction === "in";
  const dirClass = isIn ? "text-in" : "text-out";

  const label = (
    <>
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-[3px] text-[9px] font-bold"
        style={{ background: brand.bg, color: brand.text }}
      >
        {brand.short === "ZEC" ? "Z" : brand.short}
      </span>
      <span className={`font-semibold ${dirClass}`}>
        {isIn ? "IN" : "OUT"}
      </span>
      <span className={`font-display font-semibold ${dirClass}`}>
        {formatAmount(event.amountFormatted)} {event.assetSymbol}
      </span>
      {usd != null ? (
        <span className={`font-medium ${dirClass}`}>{formatUsd(usd)}</span>
      ) : null}
      <span className="font-mono text-muted">
        {shortenAddress(event.counterparty, 4)}
      </span>
    </>
  );

  const className =
    "inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-4 text-[12px]";
  const title = `${brand.label} ${isIn ? "IN" : "OUT"} · ${formatAmount(event.amountFormatted)} ${event.assetSymbol}`;

  if (txUrl) {
    return (
      <a
        className={`${className} hover:opacity-80`}
        href={txUrl}
        target="_blank"
        rel="noreferrer"
        title={title}
      >
        {label}
      </a>
    );
  }

  return <span className={className}>{label}</span>;
}

export function AlertTicker({ events, minUsd, prices }: Props) {
  const items = useMemo(() => {
    const seen = new Set<string>();
    const list: GateEventDTO[] = [];
    for (const event of events) {
      if (seen.has(event.id)) continue;
      const usd = estimateNotionalUsd(event, prices);
      if (usd == null || usd < minUsd) continue;
      seen.add(event.id);
      list.push(event);
      if (list.length >= 32) break;
    }
    return list;
  }, [events, minUsd, prices]);

  const minLabel =
    minUsd >= 1_000_000
      ? `$${(minUsd / 1_000_000).toFixed(minUsd % 1_000_000 === 0 ? 0 : 1)}M`
      : `$${Math.round(minUsd / 1000)}K`;

  if (items.length === 0) {
    return (
      <div className="mb-2 flex shrink-0 items-center gap-3 overflow-hidden rounded-xl border border-line bg-panel px-3 py-1.5">
        <span className="shrink-0 rounded bg-[#f4efe4] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-gold-deep uppercase">
          Alerts
        </span>
        <span className="text-[11px] text-muted">
          No large IN/OUT ≥ {minLabel} yet
        </span>
      </div>
    );
  }

  const track = [...items, ...items];
  const durationSec = Math.max(28, items.length * 6);

  return (
    <div
      className="ticker-rail mb-2 flex shrink-0 items-stretch overflow-hidden rounded-xl border border-[#e6c76a]/60] bg-[#fffbf0]"
      aria-label="Large IN and OUT alerts"
    >
      <div className="relative z-[1] flex shrink-0 items-center gap-1.5 border-r border-[#e6c76a]/50 bg-[#fff8e1] px-3">
        <span className="text-[10px] font-semibold tracking-wide text-gold-deep uppercase">
          Alerts
        </span>
        <span className="hidden text-[10px] text-muted sm:inline">
          ≥ {minLabel}
        </span>
        <span className="hidden text-[10px] font-semibold text-in sm:inline">
          IN
        </span>
        <span className="hidden text-[10px] text-muted sm:inline">/</span>
        <span className="hidden text-[10px] font-semibold text-out sm:inline">
          OUT
        </span>
      </div>

      <div className="ticker-mask min-w-0 flex-1 overflow-hidden">
        <div
          className="ticker-track flex w-max items-center py-1.5"
          style={{ animationDuration: `${durationSec}s` }}
        >
          {track.map((event, i) => (
            <span key={`${event.id}-${i}`} className="inline-flex items-center">
              <TickerItem
                event={event}
                usd={estimateNotionalUsd(event, prices)}
              />
              <span
                className="mx-1 h-1 w-1 shrink-0 rounded-full bg-gold/50"
                aria-hidden="true"
              />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
