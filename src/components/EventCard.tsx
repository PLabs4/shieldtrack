"use client";

import type { GateEventDTO } from "@/lib/types";
import {
  estimateNotionalUsd,
  formatAmount,
  formatClockTime,
  formatFee,
  formatUsd,
  formatUtcStamp,
} from "@/lib/format";
import { ProtocolBadge, ProtocolBar } from "@/components/ProtocolBadge";
import { EventLinks } from "@/components/EventLinks";
import { RelativeTime } from "@/components/RelativeTime";

export type EventActions = {
  onFilterAddress?: (address: string) => void;
  selectedId?: string | null;
};

type Props = {
  event: GateEventDTO;
  highlight?: boolean;
  showRelativeTime?: boolean;
  actions?: EventActions;
};

export function EventCard({
  event,
  highlight,
  showRelativeTime = true,
  actions,
}: Props) {
  const selected = actions?.selectedId === event.id;
  const fee = formatFee(event);
  const isIn = event.direction === "in";
  const usd = estimateNotionalUsd(event);

  return (
    <article
      className={`relative px-3 py-2.5 pl-4 ${
        highlight ? "feed-row-enter" : ""
      } ${selected ? "bg-[#fff8e1]" : ""}`}
    >
      <ProtocolBar protocol={event.protocol} />
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <ProtocolBadge protocol={event.protocol} size="sm" />
        <span
          className={`rounded px-1 py-0.5 text-[9px] font-semibold uppercase ${
            isIn ? "bg-[#e7f6ee] text-in" : "bg-[#ffeedf] text-out"
          }`}
        >
          {isIn ? "IN" : "OUT"}
        </span>
        {event.poolLabel ? (
          <span
            className="max-w-[9rem] truncate rounded bg-[#f4efe4] px-1 py-0.5 text-[9px] font-medium text-gold-deep"
            title={event.poolLabel}
          >
            {event.poolLabel}
          </span>
        ) : null}
        {event.tier !== "normal" ? (
          <span className="rounded bg-gold px-1 text-[9px] font-semibold text-white uppercase">
            {event.tier}
          </span>
        ) : null}
        <span className="text-[9px] text-muted">{event.chainLabel}</span>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0 truncate font-display text-sm text-ink">
          {formatAmount(event.amountFormatted)} {event.assetSymbol}
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted">
          {showRelativeTime ? (
            <div>
              <RelativeTime iso={event.blockTime} />
            </div>
          ) : null}
          <div className="tabular-nums" title={formatUtcStamp(event.blockTime)}>
            {formatClockTime(event.blockTime)}Z
          </div>
        </div>
      </div>

      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
        <span className="font-medium text-gold-deep">{formatUsd(usd)}</span>
        {fee ? <span title="Protocol / relayer fee">fee {fee}</span> : null}
        {event.relayer ? (
          <span className="truncate" title={event.relayer}>
            relayer
          </span>
        ) : null}
      </div>

      <EventLinks
        event={event}
        onFilterAddress={actions?.onFilterAddress}
      />
    </article>
  );
}
