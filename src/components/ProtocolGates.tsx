"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Direction,
  GateEventDTO,
  ProtocolId,
  ProtocolStats,
} from "@/lib/types";
import {
  counterpartyRole,
  estimateNotionalUsd,
  explorerAddressUrl,
  explorerTxUrl,
  formatAmount,
  formatClockTime,
  formatUsd,
  formatUtcStamp,
  shortenAddress,
} from "@/lib/format";
import { eventTouchesAddress, normalizeAddress } from "@/lib/investigate";
import {
  buildEventHighlights,
  type EventLinks,
  type LinkBadge,
} from "@/lib/link-highlights";
import { PROTOCOL_BRAND } from "@/lib/protocols/brand";
import { PROTOCOL_SOURCES } from "@/lib/protocols/sources";
import { FlowTickChart } from "@/components/FlowTickChart";
import { ProtocolBadge } from "@/components/ProtocolBadge";
import { RelativeTime } from "@/components/RelativeTime";
import type { EventActions } from "@/components/EventCard";

const ORDER: ProtocolId[] = ["tornado", "railgun", "zcash"];

type Flash = { direction: Direction; at: number } | null;

type Props = {
  stats: ProtocolStats[];
  events: GateEventDTO[];
  minUsd: number;
  highlightIds: Set<string>;
  addressFilter?: string | null;
  flash: Partial<Record<ProtocolId, Flash>>;
  prices?: Record<string, number>;
  actions?: EventActions;
};

function minLabel(minUsd: number): string {
  if (minUsd >= 1_000_000) {
    return `$${(minUsd / 1_000_000).toFixed(minUsd % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  return `$${Math.round(minUsd / 1000)}K`;
}

function badgeClass(kind: LinkBadge["kind"]): string {
  if (kind === "address_bridge") {
    return "border-[#3b4d9a]/40 bg-[#eef1ff] text-[#1e2a5a]";
  }
  return "border-[#1f7a4c]/35 bg-[#e7f6ee] text-in";
}

function GateRow({
  event,
  large,
  highlight,
  jumped,
  usd,
  links,
  onJumpPeers,
  actions,
}: {
  event: GateEventDTO;
  large: boolean;
  highlight: boolean;
  jumped: boolean;
  usd: number | null;
  links?: EventLinks;
  onJumpPeers?: (peerIds: string[]) => void;
  actions?: EventActions;
}) {
  const selected = actions?.selectedId === event.id;
  const role = counterpartyRole(event);
  const addrUrl = explorerAddressUrl(event.chainId, event.counterparty);
  const txUrl = explorerTxUrl(event.chainId, event.txHash);
  const address = normalizeAddress(event.counterparty);
  // Tornado poolLabel is the denomination (e.g. "100 ETH") — same as amount line.
  const poolMeta =
    event.poolLabel && event.protocol !== "tornado" ? event.poolLabel : null;
  const linked = (links?.badges.length ?? 0) > 0;
  const hasAddrBridge = links?.badges.some((b) => b.kind === "address_bridge");
  const hasMirror = links?.badges.some((b) => b.kind === "pool_mirror");

  const rowBg = jumped || selected
    ? "bg-[#fff3c4] ring-1 ring-[#e6c76a]"
    : hasAddrBridge
      ? "bg-[#f3f5ff]"
      : hasMirror
        ? "bg-[#f2fbf6]"
        : "";

  return (
    <article
      data-event-id={event.id}
      className={`px-2.5 py-2 ${highlight ? "feed-row-enter" : ""} ${rowBg} ${
        linked ? "border-l-2 border-l-gold" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* From/To address · amount · USD */}
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[12px]">
            <span className="shrink-0 text-[10px] font-semibold text-muted">
              {role.kind === "from"
                ? "From"
                : role.kind === "to"
                  ? "To"
                  : "Shielded"}
            </span>
            {role.kind === "shielded" ? (
              <span className="font-mono text-muted">—</span>
            ) : addrUrl ? (
              <a
                className="min-w-0 truncate font-mono font-medium text-ink underline decoration-line underline-offset-2 hover:text-gold-deep"
                href={addrUrl}
                target="_blank"
                rel="noreferrer"
                title={event.counterparty ?? undefined}
                onClick={(e) => e.stopPropagation()}
              >
                {shortenAddress(event.counterparty, 4)}
              </a>
            ) : (
              <span
                className="min-w-0 truncate font-mono text-ink"
                title={event.counterparty ?? undefined}
              >
                {shortenAddress(event.counterparty, 4)}
              </span>
            )}
            <span className="text-muted">·</span>
            <span
              className={`font-display ${
                large
                  ? event.direction === "in"
                    ? "text-[15px] font-semibold text-in"
                    : "text-[15px] font-semibold text-out"
                  : "text-ink"
              }`}
            >
              {formatAmount(event.amountFormatted)} {event.assetSymbol}
            </span>
            <span className="text-muted">·</span>
            <span
              className={`font-medium ${
                large
                  ? event.direction === "in"
                    ? "text-in"
                    : "text-out"
                  : "text-gold-deep"
              }`}
            >
              {formatUsd(usd)}
            </span>
          </div>

          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px]">
            {poolMeta ? (
              <span
                className="max-w-[10rem] truncate rounded bg-[#eef1f6] px-1 py-0.5 font-medium text-[#3b4d6b]"
                title={poolMeta}
              >
                {poolMeta}
              </span>
            ) : null}
            {txUrl ? (
              <a
                className="font-mono font-medium text-ink underline decoration-line underline-offset-2 hover:text-gold-deep"
                href={txUrl}
                target="_blank"
                rel="noreferrer"
                title={event.txHash}
                onClick={(e) => e.stopPropagation()}
              >
                tx {shortenAddress(event.txHash, 3)}
              </a>
            ) : (
              <span className="font-mono text-muted">
                tx {shortenAddress(event.txHash, 3)}
              </span>
            )}
            {address && actions?.onFilterAddress ? (
              <button
                type="button"
                className="rounded border border-line bg-bg-2 px-1 py-0.5 font-medium text-ink hover:border-gold"
                onClick={() => actions.onFilterAddress?.(address)}
              >
                Filter
              </button>
            ) : null}
          </div>
          {links?.badges.length ? (
            <div className="mt-1 flex min-w-0 flex-wrap gap-1">
              {links.badges.map((b) => (
                <button
                  key={`${b.kind}-${b.label}`}
                  type="button"
                  className={`rounded border px-1 py-0.5 text-[9px] font-semibold hover:brightness-95 ${badgeClass(b.kind)}`}
                  title={
                    b.peerIds.length > 1
                      ? `Click to cycle ${b.peerIds.length} matches`
                      : "Click to jump to match"
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onJumpPeers?.(b.peerIds);
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div
          className="shrink-0 text-right text-[10px] tabular-nums text-muted"
          title={formatUtcStamp(event.blockTime)}
        >
          <RelativeTime iso={event.blockTime} />
          <div>{formatClockTime(event.blockTime)}Z</div>
        </div>
      </div>
    </article>
  );
}

function SideColumn({
  side,
  events,
  minUsd,
  highlightIds,
  prices,
  linkMap,
  jumpId,
  onJumpPeers,
  actions,
}: {
  side: "in" | "out";
  events: GateEventDTO[];
  minUsd: number;
  highlightIds: Set<string>;
  prices?: Record<string, number>;
  linkMap: Map<string, EventLinks>;
  jumpId: string | null;
  onJumpPeers: (peerIds: string[]) => void;
  actions?: EventActions;
}) {
  const isIn = side === "in";
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div
        className={`flex shrink-0 items-center justify-between border-b px-2.5 py-1.5 ${
          isIn
            ? "border-[#cfe8d8] bg-[#f4fbf7]"
            : "border-[#f0d7c2] bg-[#fff7f0]"
        }`}
      >
        <span
          className={`text-[11px] font-semibold ${isIn ? "text-in" : "text-out"}`}
        >
          {isIn ? "↓ IN" : "↑ OUT"}
        </span>
        <span
          className={`text-[10px] font-medium ${isIn ? "text-in" : "text-out"}`}
        >
          {events.length}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] [scrollbar-width:thin]">
        <div className="divide-y divide-line">
          {events.length === 0 ? (
            <p className="px-2.5 py-5 text-[11px] text-muted">No {side} yet</p>
          ) : (
            events.map((event) => {
              const usd = estimateNotionalUsd(event, prices);
              const large = usd != null && usd >= minUsd;
              return (
                <GateRow
                  key={event.id}
                  event={event}
                  large={large}
                  highlight={highlightIds.has(event.id)}
                  jumped={jumpId === event.id}
                  usd={usd}
                  links={linkMap.get(event.id)}
                  onJumpPeers={onJumpPeers}
                  actions={actions}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function ProtocolColumn({
  stats,
  events,
  minUsd,
  largeOnly,
  highlightIds,
  flash,
  prices,
  linkMap,
  jumpId,
  onJumpPeers,
  actions,
}: {
  stats: ProtocolStats;
  events: GateEventDTO[];
  minUsd: number;
  largeOnly: boolean;
  highlightIds: Set<string>;
  flash: Flash;
  prices?: Record<string, number>;
  linkMap: Map<string, EventLinks>;
  jumpId: string | null;
  onJumpPeers: (peerIds: string[]) => void;
  actions?: EventActions;
}) {
  const brand = PROTOCOL_BRAND[stats.protocol];
  const source = PROTOCOL_SOURCES[stats.protocol];
  const [flashSide, setFlashSide] = useState<"in" | "out" | null>(null);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    if (!flash) return;
    setFlashSide(flash.direction);
    const timer = window.setTimeout(() => setFlashSide(null), 1000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const { ins, outs } = useMemo(() => {
    const list = largeOnly
      ? events.filter((e) => {
          const usd = estimateNotionalUsd(e, prices);
          return usd != null && usd >= minUsd;
        })
      : events;
    return {
      ins: list.filter((e) => e.direction === "in"),
      outs: list.filter((e) => e.direction === "out"),
    };
  }, [events, largeOnly, minUsd, prices]);

  const poolLabel =
    stats.poolTvlLabel ??
    (stats.poolTvlUsd != null ? formatUsd(stats.poolTvlUsd) : "—");

  return (
    <section
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-panel"
      style={{ borderColor: brand.border }}
    >
      <header
        className="flex shrink-0 flex-col gap-1.5 border-b px-2 py-1.5"
        style={{ borderColor: `${brand.border}55`, background: `${brand.bg}08` }}
      >
        <div className="flex items-center justify-between gap-2 px-0.5">
          <ProtocolBadge protocol={stats.protocol} size="sm" />
          <div className="flex min-w-0 items-center gap-2 text-[10px] text-muted">
            <span className="truncate">
              Pool <span className="font-medium text-ink">{poolLabel}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              {stats.inCount}↓/{stats.outCount}↑
            </span>
            <span className="shrink-0 tabular-nums text-ink">
              {formatUsd(stats.inUsd)}/{formatUsd(stats.outUsd)}
            </span>
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                flashSide === "in"
                  ? "bg-[#e8f6ee] text-in"
                  : flashSide === "out"
                    ? "bg-[#fff1e6] text-out"
                    : "bg-[#f4efe4] text-gold-deep"
              }`}
            >
              {flashSide === "in"
                ? "↓ IN"
                : flashSide === "out"
                  ? "↑ OUT"
                  : "Live"}
            </span>
          </div>
        </div>

        <FlowTickChart events={events} prices={prices} />

        <div className="rounded-md border border-line/70 bg-bg-2/60 px-1.5 py-0.5">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 text-left"
            onClick={() => setShowSource((v) => !v)}
            aria-expanded={showSource}
          >
            <span className="truncate text-[10px] text-muted">
              <span className="font-semibold text-gold-deep">Source</span>
              <span className="mx-1 text-line">·</span>
              {source.network}
            </span>
            <span className="shrink-0 text-[10px] text-muted">
              {showSource ? "Hide" : "Verify"}
            </span>
          </button>
          {showSource ? (
            <div className="mt-1 space-y-1 border-t border-line/60 pt-1 pb-0.5">
              <p className="text-[10px] leading-snug text-ink">{source.method}</p>
              <div className="flex flex-wrap gap-1">
                {source.links.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded border border-line bg-panel px-1 py-0.5 text-[9px] font-medium text-ink underline-offset-2 hover:border-gold hover:underline"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-1">
        <div className="min-h-0 overflow-hidden border-r border-line">
          <SideColumn
            side="in"
            events={ins}
            minUsd={minUsd}
            highlightIds={highlightIds}
            prices={prices}
            linkMap={linkMap}
            jumpId={jumpId}
            onJumpPeers={onJumpPeers}
            actions={actions}
          />
        </div>
        <div className="min-h-0 overflow-hidden">
          <SideColumn
            side="out"
            events={outs}
            minUsd={minUsd}
            highlightIds={highlightIds}
            prices={prices}
            linkMap={linkMap}
            jumpId={jumpId}
            onJumpPeers={onJumpPeers}
            actions={actions}
          />
        </div>
      </div>
    </section>
  );
}

type SortMode = "time" | "value";

export function ProtocolGates({
  stats,
  events,
  minUsd,
  highlightIds,
  addressFilter,
  flash,
  prices,
  actions,
}: Props) {
  const [largeOnly, setLargeOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("time");
  const rootRef = useRef<HTMLElement>(null);
  const cycleRef = useRef<Map<string, number>>(new Map());
  const [jump, setJump] = useState<{ id: string; n: number } | null>(null);
  const jumpId = jump?.id ?? null;

  useEffect(() => {
    if (!jump || !rootRef.current) return;
    const el = rootRef.current.querySelector(
      `[data-event-id="${CSS.escape(jump.id)}"]`,
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const timer = window.setTimeout(() => setJump(null), 2200);
    return () => window.clearTimeout(timer);
  }, [jump]);

  const onJumpPeers = (peerIds: string[]) => {
    if (!peerIds.length) return;
    // Shared cycle across clicks of the same peer set (IN↔OUT / cross-pool).
    const key = peerIds.slice().sort().join("|");
    const idx = cycleRef.current.get(key) ?? 0;
    const next = peerIds[idx % peerIds.length]!;
    cycleRef.current.set(key, idx + 1);
    setJump({ id: next, n: Date.now() });
  };

  const statsByProtocol = useMemo(() => {
    const map = new Map(stats.map((s) => [s.protocol, s]));
    return ORDER.map(
      (protocol) =>
        map.get(protocol) ?? {
          protocol,
          inCount: 0,
          outCount: 0,
          inUsd: 0,
          outUsd: 0,
          poolTvlUsd: null,
          poolTvlLabel: null,
          lastInEvent: null,
          lastOutEvent: null,
        },
    );
  }, [stats]);

  const byProtocol = useMemo(() => {
    const map: Record<ProtocolId, GateEventDTO[]> = {
      tornado: [],
      railgun: [],
      zcash: [],
    };
    for (const event of events) {
      if (addressFilter && !eventTouchesAddress(event, addressFilter)) continue;
      map[event.protocol].push(event);
    }
    for (const protocol of ORDER) {
      map[protocol].sort((a, b) => {
        if (sortMode === "value") {
          const ua = estimateNotionalUsd(a, prices) ?? 0;
          const ub = estimateNotionalUsd(b, prices) ?? 0;
          if (ub !== ua) return ub - ua;
        }
        return (
          new Date(b.blockTime).getTime() - new Date(a.blockTime).getTime()
        );
      });
    }
    return map;
  }, [events, addressFilter, sortMode, prices]);

  const linkMap = useMemo(
    () =>
      buildEventHighlights(events, prices, {
        largeUsd: minUsd,
      }),
    [events, prices, minUsd],
  );

  const linkCount = linkMap.size;

  return (
    <section
      ref={rootRef}
      className="flex min-h-0 flex-1 flex-col gap-2"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
          <span className="font-semibold text-ink">Links · large only</span>
          <span className="rounded border border-[#3b4d9a]/30 bg-[#eef1ff] px-1 py-0.5 text-[#1e2a5a]">
            cross-pool same addr
          </span>
          <span className="rounded border border-[#1f7a4c]/30 bg-[#e7f6ee] px-1 py-0.5 text-in">
            same-pool equal amt · click to jump
          </span>
          <span className="tabular-nums">{linkCount} flagged</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-muted">Sort</span>
          <button
            type="button"
            className={`rounded border px-2 py-0.5 font-medium ${
              sortMode === "time"
                ? "border-gold bg-[#fff8e1] text-gold-deep"
                : "border-line bg-panel text-muted hover:border-gold"
            }`}
            onClick={() => setSortMode("time")}
          >
            Time
          </button>
          <button
            type="button"
            className={`rounded border px-2 py-0.5 font-medium ${
              sortMode === "value"
                ? "border-gold bg-[#fff8e1] text-gold-deep"
                : "border-line bg-panel text-muted hover:border-gold"
            }`}
            onClick={() => setSortMode("value")}
          >
            Value
          </button>
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted">
          <input
            type="checkbox"
            checked={largeOnly}
            onChange={(e) => setLargeOnly(e.target.checked)}
          />
          Large only ≥ {minLabel(minUsd)}
        </label>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-3 lg:grid-rows-1">
        {statsByProtocol.map((s) => (
          <ProtocolColumn
            key={s.protocol}
            stats={s}
            events={byProtocol[s.protocol]}
            minUsd={minUsd}
            largeOnly={largeOnly}
            highlightIds={highlightIds}
            flash={flash[s.protocol] ?? null}
            prices={prices}
            linkMap={linkMap}
            jumpId={jumpId}
            onJumpPeers={onJumpPeers}
            actions={actions}
          />
        ))}
      </div>
    </section>
  );
}
