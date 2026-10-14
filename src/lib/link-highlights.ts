import { estimateNotionalUsd } from "@/lib/format";
import { normalizeAddress } from "@/lib/investigate";
import type { GateEventDTO, ProtocolId } from "@/lib/types";

export type LinkBadge = {
  kind: "address_bridge" | "pool_mirror";
  label: string;
  /** Peers to cycle when this badge is clicked. */
  peerIds: string[];
};

export type EventLinks = {
  badges: LinkBadge[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function ts(event: GateEventDTO): number {
  return new Date(event.blockTime).getTime();
}

/** Exact amount match — prefer raw units, else exact float equality on formatted. */
function sameAmount(a: GateEventDTO, b: GateEventDTO): boolean {
  if (a.amountRaw && b.amountRaw && a.amountRaw === b.amountRaw) return true;
  if (a.assetSymbol.toUpperCase() !== b.assetSymbol.toUpperCase()) return false;
  const x = Number(a.amountFormatted);
  const y = Number(b.amountFormatted);
  return Number.isFinite(x) && Number.isFinite(y) && x === y;
}

function isLarge(
  event: GateEventDTO,
  prices: Record<string, number> | undefined,
  largeUsd: number,
): boolean {
  const usd = estimateNotionalUsd(event, prices);
  return usd != null && usd >= largeUsd;
}

function fromAddr(event: GateEventDTO): string | null {
  if (event.direction !== "in") return null;
  return (
    normalizeAddress(event.counterparty) ??
    normalizeAddress(event.fromAddress)
  );
}

function toAddr(event: GateEventDTO): string | null {
  if (event.direction !== "out") return null;
  return (
    normalizeAddress(event.counterparty) ?? normalizeAddress(event.toAddress)
  );
}

function poolKey(event: GateEventDTO): string {
  if (event.poolLabel) {
    return `${event.protocol}:${event.poolLabel}`;
  }
  return `${event.protocol}:${event.assetSymbol.toUpperCase()}`;
}

function shortProto(p: ProtocolId): string {
  if (p === "tornado") return "TC";
  if (p === "railgun") return "RG";
  return "ZEC";
}

function setBadge(
  map: Map<string, EventLinks>,
  id: string,
  badge: LinkBadge,
) {
  const cur = map.get(id) ?? { badges: [] };
  const existing = cur.badges.find((b) => b.kind === badge.kind);
  if (existing) {
    for (const peer of badge.peerIds) {
      if (!existing.peerIds.includes(peer)) existing.peerIds.push(peer);
    }
    existing.label = badge.label;
  } else {
    cur.badges.push({ ...badge, peerIds: [...badge.peerIds] });
  }
  map.set(id, cur);
}

/**
 * Highlight (large only):
 * 1) Cross-pool address bridges: OUT.to == other-protocol IN.from
 * 2) Same-pool IN/OUT with exact equal amount within 24h (all matches kept for cycling)
 */
export function buildEventHighlights(
  events: GateEventDTO[],
  prices?: Record<string, number>,
  opts?: { largeUsd: number },
): Map<string, EventLinks> {
  const largeUsd = opts?.largeUsd ?? 100_000;
  const map = new Map<string, EventLinks>();
  const list = events.filter((e) => isLarge(e, prices, largeUsd));

  // --- Cross-pool: same address ---
  const outs = list.filter((e) => e.direction === "out");
  const ins = list.filter((e) => e.direction === "in");

  const byFrom = new Map<string, GateEventDTO[]>();
  for (const inn of ins) {
    const f = fromAddr(inn);
    if (!f) continue;
    const arr = byFrom.get(f) ?? [];
    arr.push(inn);
    byFrom.set(f, arr);
  }

  const addrPeers = new Map<string, string[]>();
  const addAddr = (a: string, b: string) => {
    const la = addrPeers.get(a) ?? [];
    if (!la.includes(b)) la.push(b);
    addrPeers.set(a, la);
  };

  for (const out of outs) {
    const t = toAddr(out);
    if (!t) continue;
    for (const inn of byFrom.get(t) ?? []) {
      if (inn.protocol === out.protocol) continue;
      addAddr(out.id, inn.id);
      addAddr(inn.id, out.id);
    }
  }

  for (const [id, peers] of addrPeers) {
    const sample = list.find((e) => e.id === peers[0]);
    const self = list.find((e) => e.id === id);
    if (!self || !sample) continue;
    if (self.direction === "out") {
      setBadge(map, id, {
        kind: "address_bridge",
        label:
          peers.length > 1
            ? `→ IN same addr · ${peers.length}`
            : `→ ${shortProto(sample.protocol)} IN (same addr)`,
        peerIds: peers,
      });
    } else {
      setBadge(map, id, {
        kind: "address_bridge",
        label:
          peers.length > 1
            ? `← OUT same addr · ${peers.length}`
            : `← ${shortProto(sample.protocol)} OUT (same addr)`,
        peerIds: peers,
      });
    }
  }

  // --- Same pool: exact amount, all matches within 24h ---
  const byPool = new Map<string, GateEventDTO[]>();
  for (const e of list) {
    const key = poolKey(e);
    const arr = byPool.get(key) ?? [];
    arr.push(e);
    byPool.set(key, arr);
  }

  const mirrorPeers = new Map<string, string[]>();
  const addMirror = (a: string, b: string) => {
    const la = mirrorPeers.get(a) ?? [];
    if (!la.includes(b)) la.push(b);
    mirrorPeers.set(a, la);
  };

  for (const [, poolEvents] of byPool) {
    const poolIns = poolEvents.filter((e) => e.direction === "in");
    const poolOuts = poolEvents.filter((e) => e.direction === "out");

    for (const out of poolOuts) {
      const outT = ts(out);
      const matches = poolIns
        .filter((inn) => {
          if (!sameAmount(out, inn)) return false;
          return Math.abs(outT - ts(inn)) <= DAY_MS;
        })
        .sort((a, b) => Math.abs(outT - ts(a)) - Math.abs(outT - ts(b)));

      for (const inn of matches) {
        addMirror(out.id, inn.id);
        addMirror(inn.id, out.id);
      }
    }
  }

  for (const [id, peers] of mirrorPeers) {
    const self = list.find((e) => e.id === id);
    if (!self) continue;
    const opposite = self.direction === "out" ? "IN" : "OUT";
    setBadge(map, id, {
      kind: "pool_mirror",
      label:
        peers.length > 1
          ? `= same-pool ${opposite} · ${peers.length}`
          : `= same-pool ${opposite}`,
      peerIds: peers,
    });
  }

  return map;
}
