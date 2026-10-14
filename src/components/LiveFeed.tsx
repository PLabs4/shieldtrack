"use client";

import { useMemo, useState } from "react";
import type { GateEventDTO, ProtocolId } from "@/lib/types";
import { eventTouchesAddress } from "@/lib/investigate";
import { EventCard, type EventActions } from "@/components/EventCard";
import { ScrollPanel } from "@/components/ScrollPanel";

type Props = {
  events: GateEventDTO[];
  highlightIds: Set<string>;
  addressFilter?: string | null;
  actions?: EventActions;
};

const SELECT_CLASS =
  "rounded-md border border-line bg-bg-2 px-2 py-1 text-[11px] text-ink outline-none focus:border-gold";

function FeedColumn({
  title,
  side,
  events,
  highlightIds,
  actions,
}: {
  title: string;
  side: "in" | "out";
  events: GateEventDTO[];
  highlightIds: Set<string>;
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
            <p className="px-3 py-6 text-xs text-muted">No {side} yet</p>
          ) : (
            events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                highlight={highlightIds.has(event.id)}
                actions={actions}
              />
            ))
          )}
        </div>
      </ScrollPanel>
    </div>
  );
}

export function LiveFeed({
  events,
  highlightIds,
  addressFilter,
  actions,
}: Props) {
  const [protocol, setProtocol] = useState<"all" | ProtocolId>("all");

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (protocol !== "all" && e.protocol !== protocol) return false;
      if (addressFilter && !eventTouchesAddress(e, addressFilter)) return false;
      return true;
    });
  }, [events, protocol, addressFilter]);

  const { ins, outs } = useMemo(() => {
    const ins = filtered.filter((e) => e.direction === "in");
    const outs = filtered.filter((e) => e.direction === "out");
    return { ins, outs };
  }, [filtered]);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-panel">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div>
          <h2 className="font-display text-base text-ink">Live feed</h2>
          <p className="text-[10px] text-muted">Left IN · Right OUT</p>
        </div>
        <div className="flex items-center gap-1.5">
          <select
            className={SELECT_CLASS}
            value={protocol}
            onChange={(e) => setProtocol(e.target.value as typeof protocol)}
            aria-label="Filter project"
          >
            <option value="all">All projects</option>
            <option value="tornado">Tornado Cash</option>
            <option value="railgun">Railgun</option>
            <option value="zcash">Zcash</option>
          </select>
          <span className="rounded-full bg-[#f4efe4] px-2 py-0.5 text-[10px] font-medium text-gold-deep">
            Live
          </span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 md:grid-cols-2">
        <div className="flex min-h-0 flex-col border-b border-line md:border-r md:border-b-0">
          <FeedColumn
            title="↓ Shield IN"
            side="in"
            events={ins}
            highlightIds={highlightIds}
            actions={actions}
          />
        </div>
        <div className="flex min-h-0 flex-col">
          <FeedColumn
            title="↑ Unshield OUT"
            side="out"
            events={outs}
            highlightIds={highlightIds}
            actions={actions}
          />
        </div>
      </div>
    </section>
  );
}
