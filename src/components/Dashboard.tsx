"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  DashboardSnapshot,
  Direction,
  GateEventDTO,
  ProtocolId,
} from "@/lib/types";
import {
  estimateNotionalUsd,
  shortenAddress,
  withLiveUsd,
} from "@/lib/format";
import { AlertTicker } from "@/components/AlertTicker";
import { PriceStrip } from "@/components/PriceStrip";
import { ProtocolBadge } from "@/components/ProtocolBadge";
import { ProtocolGates } from "@/components/ProtocolGates";
import { normalizeAddress } from "@/lib/investigate";
import type { EventActions } from "@/components/EventCard";

type FlashMap = Partial<
  Record<ProtocolId, { direction: Direction; at: number }>
>;

const ORDER: ProtocolId[] = ["tornado", "railgun", "zcash"];

export function Dashboard({ initial }: { initial: DashboardSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [live, setLive] = useState<GateEventDTO[]>(initial.live);
  const [history, setHistory] = useState<GateEventDTO[]>(initial.history);
  const historyMinUsd = initial.historyMinUsd ?? 100_000;
  const [flash, setFlash] = useState<FlashMap>({});
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const [connected, setConnected] = useState(false);
  const [addressFilter, setAddressFilter] = useState<string | null>(null);
  const [addressEvents, setAddressEvents] = useState<GateEventDTO[]>([]);

  useEffect(() => {
    const es = new EventSource("/api/events/live");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data) as
          | { type: "snapshot"; events: GateEventDTO[] }
          | { type: "event"; event: GateEventDTO }
          | { type: "ping" | "hello" | "error" };

        if (data.type === "snapshot") {
          setLive(data.events);
          return;
        }

        if (data.type === "event") {
          const event = data.event;
          setLive((prev) =>
            [event, ...prev.filter((e) => e.id !== event.id)].slice(0, 250),
          );
          const usd = estimateNotionalUsd(event);
          if (usd != null && usd >= historyMinUsd) {
            setHistory((prev) =>
              [event, ...prev.filter((e) => e.id !== event.id)].slice(0, 200),
            );
          }
          setFlash((prev) => ({
            ...prev,
            [event.protocol]: { direction: event.direction, at: Date.now() },
          }));
          setHighlightIds((prev) => {
            const next = new Set(prev);
            next.add(event.id);
            return next;
          });
          window.setTimeout(() => {
            setHighlightIds((prev) => {
              const next = new Set(prev);
              next.delete(event.id);
              return next;
            });
          }, 1800);

          setSnapshot((prev) => {
            const stats = prev.stats.map((s) => {
              if (s.protocol !== event.protocol) return s;
              const usd = Number(event.amountUsd ?? 0);
              return {
                ...s,
                inCount: s.inCount + (event.direction === "in" ? 1 : 0),
                outCount: s.outCount + (event.direction === "out" ? 1 : 0),
                inUsd: s.inUsd + (event.direction === "in" ? usd : 0),
                outUsd: s.outUsd + (event.direction === "out" ? usd : 0),
                lastInEvent:
                  event.direction === "in" ? event : s.lastInEvent,
                lastOutEvent:
                  event.direction === "out" ? event : s.lastOutEvent,
                poolTvlUsd: s.poolTvlUsd,
                poolTvlLabel: s.poolTvlLabel,
              };
            });
            return { ...prev, stats };
          });
        }
      } catch {
        // ignore malformed frames
      }
    };

    return () => es.close();
  }, [historyMinUsd]);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch("/api/dashboard", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as DashboardSnapshot;
        setSnapshot((prev) => ({
          ...prev,
          indexer: data.indexer,
          startedAt: data.startedAt,
          stats: data.stats,
          prices: data.prices ?? prev.prices,
        }));
        setLive(data.live);
        setHistory(data.history);
      } catch {
        // keep UI alive on transient API errors
      }
    }, 20_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!addressFilter) {
      setAddressEvents([]);
      return;
    }
    let cancelled = false;
    const q = new URLSearchParams({ address: addressFilter, limit: "120" });
    fetch(`/api/events?${q}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return [];
        const data = (await res.json()) as
          | { events?: GateEventDTO[] }
          | GateEventDTO[];
        return Array.isArray(data) ? data : (data.events ?? []);
      })
      .then((events) => {
        if (!cancelled) setAddressEvents(events);
      })
      .catch(() => {
        if (!cancelled) setAddressEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [addressFilter]);

  const statsByProtocol = useMemo(() => {
    const map = new Map(snapshot.stats.map((s) => [s.protocol, s]));
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
  }, [snapshot.stats]);

  const eventActions: EventActions = useMemo(
    () => ({
      onFilterAddress: (address) => {
        const n = normalizeAddress(address);
        if (n) setAddressFilter(n);
      },
    }),
    [],
  );

  const priceMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const q of snapshot.prices ?? []) {
      if (q.usd != null && Number.isFinite(q.usd) && q.usd > 0) {
        map[q.symbol.toUpperCase()] = q.usd;
      }
    }
    return map;
  }, [snapshot.prices]);

  const mergedEvents = useMemo(() => {
    const byId = new Map<string, GateEventDTO>();
    for (const e of history) byId.set(e.id, e);
    for (const e of live) byId.set(e.id, e);
    for (const e of addressEvents) byId.set(e.id, e);
    return Array.from(byId.values())
      .map((e) => withLiveUsd(e, priceMap))
      .sort(
        (a, b) =>
          new Date(b.blockTime).getTime() - new Date(a.blockTime).getTime(),
      );
  }, [live, history, addressEvents, priceMap]);

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden px-3 py-3 md:px-4">
      <header className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="font-display text-2xl tracking-tight text-ink md:text-3xl">
            Shield<span className="text-gold">Track</span>
          </h1>
          <div className="hidden items-center gap-1.5 sm:flex">
            <ProtocolBadge protocol="tornado" size="sm" />
            <ProtocolBadge protocol="railgun" size="sm" />
            <ProtocolBadge protocol="zcash" size="sm" />
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-ink">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                connected && snapshot.indexer.healthy ? "bg-in" : "bg-[#c45c26]"
              }`}
            />
            {connected ? "Live" : "Reconnecting"}
          </div>
          <div className="hidden text-muted md:block">
            {snapshot.indexer.lastTickAt
              ? `tick ${snapshot.indexer.lastTickAt.slice(11, 19)}`
              : "warming up"}
          </div>
        </div>
      </header>

      <AlertTicker
        events={mergedEvents}
        minUsd={historyMinUsd}
        prices={priceMap}
      />
      <PriceStrip prices={snapshot.prices ?? []} />

      {addressFilter ? (
        <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-line bg-panel px-3 py-1.5 text-[11px]">
          <span className="font-semibold text-gold-deep">Address filter</span>
          <span className="font-mono text-ink" title={addressFilter}>
            {shortenAddress(addressFilter, 6)}
          </span>
          <button
            type="button"
            className="rounded border border-line bg-bg-2 px-2 py-0.5 font-medium hover:border-gold"
            onClick={() => setAddressFilter(null)}
          >
            Clear
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ProtocolGates
          stats={statsByProtocol}
          events={mergedEvents}
          minUsd={historyMinUsd}
          highlightIds={highlightIds}
          addressFilter={addressFilter}
          flash={flash}
          prices={priceMap}
          actions={eventActions}
        />
      </div>
    </div>
  );
}
