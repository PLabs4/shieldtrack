"use client";

import { useMemo, useState } from "react";
import type { GateEventDTO, ProtocolId } from "@/lib/types";
import { estimateNotionalUsd } from "@/lib/format";
import { eventTouchesAddress } from "@/lib/investigate";
import { EventCard, type EventActions } from "@/components/EventCard";
import { ScrollPanel } from "@/components/ScrollPanel";

type Props = {
  events: GateEventDTO[];
  minUsd: number;
  addressFilter?: string | null;
  actions?: EventActions;
};

function HistoryColumn({
  title,
  side,
  events,
  actions,
}: {
  title: string;
  side: "in" | "out";
  events: GateEventDTO[];
  actions?: EventActions;
}) {
  const isIn = side === "in";

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div
        className={`flex shrink-0 items-center justify-between border-b px-3 py-2 ${
          isIn ? "border-[#cfe8d8] bg-[#f4fbf7]" : "border-[#f0d7c2] bg-[#fff7f0]"
        }`}
      >
        <h3 className={`text-sm font-semibold ${isIn ? "text-in" : "text-out"}`}>
          {title}
        </h3>
        <span className={`text-[11px] font-medium ${isIn ? "text-in" : "text-out"}`}>
          {events.length}
        </span>
      </div>

      <ScrollPanel>
        <div className="divide-y divide-line pr-8">
          {events.length === 0 ? (
            <p className="px-3 py-6 text-xs text-muted">No large {side} yet</p>
          ) : (
            events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                showRelativeTime={false}
                actions={actions}
              />
            ))
          )}
        </div>
      </ScrollPanel>
    </div>
  );
}

export function HistoryTable({
  events,
  minUsd,
  addressFilter,
  actions,
}: Props) {
  const [protocol, setProtocol] = useState<"all" | ProtocolId>("all");

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (protocol !== "all" && e.protocol !== protocol) return false;
      if (addressFilter) return eventTouchesAddress(e, addressFilter);
      const usd = estimateNotionalUsd(e);
      return usd != null && usd >= minUsd;
    });
  }, [events, protocol, minUsd, addressFilter]);

  const ins = useMemo(
    () => filtered.filter((e) => e.direction === "in"),
    [filtered],
  );
  const outs = useMemo(
    () => filtered.filter((e) => e.direction === "out"),
    [filtered],
  );

  const selectClass =
    "rounded-md border border-line bg-bg-2 px-2 py-1 text-[11px] text-ink outline-none focus:border-gold";

  const minLabel =
    minUsd >= 1_000_000
      ? `$${(minUsd / 1_000_000).toFixed(minUsd % 1_000_000 === 0 ? 0 : 1)}M`
      : `$${Math.round(minUsd / 1000)}K`;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-panel">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div>
          <h2 className="font-display text-base text-ink">Large moves</h2>
          <p className="text-[10px] text-muted">
            ≥ {minLabel} · Left IN · Right OUT
          </p>
        </div>
        <select
          className={selectClass}
          value={protocol}
          onChange={(e) => setProtocol(e.target.value as typeof protocol)}
          aria-label="Filter project"
        >
          <option value="all">All projects</option>
          <option value="tornado">Tornado Cash</option>
          <option value="railgun">Railgun</option>
          <option value="zcash">Zcash</option>
        </select>
      </header>

      <div className="grid min-h-0 flex-1 md:grid-cols-2">
        <div className="flex min-h-0 flex-col border-b border-line md:border-r md:border-b-0">
          <HistoryColumn title="↓ Large IN" side="in" events={ins} actions={actions} />
        </div>
        <div className="flex min-h-0 flex-col">
          <HistoryColumn title="↑ Large OUT" side="out" events={outs} actions={actions} />
        </div>
      </div>
    </section>
  );
}
