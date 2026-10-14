"use client";

import { useEffect, useState } from "react";
import type { Direction, GateEventDTO, ProtocolStats } from "@/lib/types";
import { formatAmount, formatUsd, shortenAddress } from "@/lib/format";
import { PROTOCOL_BRAND } from "@/lib/protocols/brand";
import { ProtocolBadge } from "@/components/ProtocolBadge";

type Props = {
  stats: ProtocolStats;
  flash: { direction: Direction; at: number } | null;
};

function LatestSide({
  label,
  event,
  side,
}: {
  label: string;
  event: GateEventDTO | null;
  side: "in" | "out";
}) {
  const tone = side === "in" ? "text-in" : "text-out";
  const bg = side === "in" ? "bg-[#f4fbf7]" : "bg-[#fff7f0]";

  return (
    <div className={`min-w-0 rounded-lg ${bg} px-2 py-1.5`}>
      <div className={`text-[10px] font-semibold tracking-wide uppercase ${tone}`}>
        Latest {label}
      </div>
      {event ? (
        <>
          <div className="mt-0.5 truncate font-display text-[13px] leading-tight text-ink">
            {formatAmount(event.amountFormatted)} {event.assetSymbol}
          </div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-muted">
            {shortenAddress(event.counterparty, 4)}
          </div>
        </>
      ) : (
        <div className="mt-1 text-[11px] text-muted">—</div>
      )}
    </div>
  );
}

export function PoolWell({ stats, flash }: Props) {
  const [phase, setPhase] = useState<"idle" | "in" | "out">("idle");
  const brand = PROTOCOL_BRAND[stats.protocol];

  useEffect(() => {
    if (!flash) return;
    setPhase(flash.direction);
    const timer = window.setTimeout(() => setPhase("idle"), 950);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const active = phase !== "idle";
  const particleClass =
    phase === "in" ? "particle-fall" : phase === "out" ? "particle-rise" : "";

  const poolLabel =
    stats.poolTvlLabel ??
    (stats.poolTvlUsd != null ? formatUsd(stats.poolTvlUsd) : "—");

  return (
    <section
      className="flex flex-col rounded-xl border bg-panel px-3 py-2.5"
      style={{ borderColor: brand.border }}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <ProtocolBadge protocol={stats.protocol} size="sm" />
        <div
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            active
              ? phase === "in"
                ? "bg-[#e8f6ee] text-in"
                : "bg-[#fff1e6] text-out"
              : "bg-[#f4efe4] text-gold-deep"
          }`}
        >
          {active ? (phase === "in" ? "↓ IN" : "↑ OUT") : "Live"}
        </div>
      </div>

      <div
        className={`relative mx-auto mb-1.5 h-[84px] w-[84px] shrink-0 ${
          phase === "idle" ? "well-idle" : ""
        }`}
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`absolute left-1/2 h-2 w-2 rounded-full opacity-0 ${
              phase === "in"
                ? "bg-in"
                : phase === "out"
                  ? "bg-out"
                  : "bg-gold"
            } ${particleClass}`}
            style={{
              marginLeft: `${(i - 1.5) * 8}px`,
              animationDelay: `${i * 70}ms`,
            }}
          />
        ))}
        <div
          className={`absolute left-1/2 top-1/2 flex h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-2 bg-[radial-gradient(circle_at_50%_35%,#fffdf8_0%,#f3ead2_55%,#e8d7a8_100%)] ${
            phase === "in"
              ? "border-in well-active-in"
              : phase === "out"
                ? "border-out well-active-out"
                : "border-gold"
          }`}
        >
          {active ? (
            <span
              className={`pointer-events-none absolute inset-[-8px] rounded-full border well-ring-pulse ${
                phase === "in" ? "border-in/40" : "border-out/40"
              }`}
            />
          ) : null}
          <div className="relative z-[1] px-1 text-center">
            <div className="text-[9px] font-semibold tracking-wide text-muted uppercase">
              Pool
            </div>
            <div className="font-display text-[13px] leading-tight text-gold-deep">
              {poolLabel}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-1.5 grid grid-cols-2 gap-1.5">
        <div className="rounded-lg bg-[#f4fbf7] px-2 py-1">
          <div className="text-[10px] font-medium text-in uppercase">IN</div>
          <div className="font-display text-xl leading-none text-ink">
            {stats.inCount}
          </div>
          <div className="truncate text-[10px] text-muted">
            {formatUsd(stats.inUsd)}
          </div>
        </div>
        <div className="rounded-lg bg-[#fff7f0] px-2 py-1">
          <div className="text-[10px] font-medium text-out uppercase">OUT</div>
          <div className="font-display text-xl leading-none text-ink">
            {stats.outCount}
          </div>
          <div className="truncate text-[10px] text-muted">
            {formatUsd(stats.outUsd)}
          </div>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-1.5">
        <LatestSide label="IN" event={stats.lastInEvent} side="in" />
        <LatestSide label="OUT" event={stats.lastOutEvent} side="out" />
      </div>
    </section>
  );
}
