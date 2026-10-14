import {
  estimateNotionalUsd,
  explorerAddressUrl,
  explorerTxUrl,
} from "@/lib/format";
import type { GateEventDTO } from "@/lib/types";

export type TimeWindowMin = 15 | 60 | 360 | 1440;
export type UsdTolerancePct = 3 | 5 | 10 | 25;

export type MatchReason =
  | "same_address"
  | "usd_near"
  | "amount_near"
  | "same_asset"
  | "cross_protocol"
  | "time_near"
  | "sequence"
  | "asset_convert"
  | "to_zec"
  | "from_zec";

export type CandidateMatch = {
  event: GateEventDTO;
  reasons: MatchReason[];
  deltaMs: number;
  usdRatio: number | null;
  score: number;
  expectedAmount?: number | null;
  expectedSymbol?: string | null;
};

export type InvestigateMode = "cross_gate" | "near_intent";

export type CandidateStrength = "strong" | "medium" | "weak";

/** Small notionals create noisy ZEC matches — keep but demote. */
export const INVESTIGATE_MIN_USD_SIGNAL = 500;

export function candidateStrength(match: CandidateMatch): CandidateStrength {
  const hasAddr = match.reasons.includes("same_address");
  const hasUsd = match.reasons.includes("usd_near");
  const hasAmt = match.reasons.includes("amount_near");
  const candUsd = Number(match.event.amountUsd ?? 0);
  const dust =
    !hasAddr &&
    Number.isFinite(candUsd) &&
    candUsd > 0 &&
    candUsd < INVESTIGATE_MIN_USD_SIGNAL;

  if (hasAddr && (hasUsd || hasAmt)) return "strong";
  // Tiny notional without address overlap → never promote above weak.
  if (dust) return "weak";
  if (hasAddr || (hasUsd && match.score >= 40)) return "medium";
  if (match.score >= 55 && hasUsd) return "medium";
  return "weak";
}

export function strengthLabel(s: CandidateStrength): string {
  if (s === "strong") return "strong clues";
  if (s === "medium") return "medium clues";
  return "weak clues";
}

export type ConversionRail = "near_intent";

export type ConversionChannel = {
  kind: "to_zec" | "from_zec";
  /** On-chain hop only (no CEX). */
  rail: ConversionRail;
  title: string;
  summary: string;
  focusUsd: number | null;
  expectedZec: number | null;
  zecPrice: number | null;
  /** Near Intent 1Click dry-quote when available. */
  nearIntent?: {
    ok: boolean;
    amountOutZec: number | null;
    amountOutUsd: number | null;
    timeEstimateSec: number | null;
    error?: string;
  } | null;
  gapSteps: string[];
  hopLinks: { label: string; url: string }[];
  candidates: CandidateMatch[];
};

export function normalizeAddress(value: string | null | undefined): string | null {
  if (!value || value === "shielded") return null;
  const v = value.trim();
  if (!v) return null;
  return v.startsWith("0x") ? v.toLowerCase() : v;
}

export function eventAddresses(event: GateEventDTO): string[] {
  const out: string[] = [];
  for (const a of [
    event.counterparty,
    event.fromAddress,
    event.toAddress,
    event.relayer,
  ]) {
    const n = normalizeAddress(a);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

export function eventTouchesAddress(
  event: GateEventDTO,
  address: string,
): boolean {
  const target = normalizeAddress(address);
  if (!target) return false;
  return eventAddresses(event).includes(target);
}

function amountNumber(event: GateEventDTO): number | null {
  const n = Number(event.amountFormatted);
  return Number.isFinite(n) ? n : null;
}

function sameAssetFamily(a: string, b: string): boolean {
  const x = a.toUpperCase();
  const y = b.toUpperCase();
  if (x === y) return true;
  const eth = new Set(["ETH", "WETH"]);
  if (eth.has(x) && eth.has(y)) return true;
  const btc = new Set(["BTC", "WBTC"]);
  if (btc.has(x) && btc.has(y)) return true;
  return false;
}

function isZec(symbol: string): boolean {
  return symbol.toUpperCase() === "ZEC";
}

function notional(
  event: GateEventDTO,
  prices?: Record<string, number>,
): number | null {
  return estimateNotionalUsd(event, prices);
}

type MatchOpts = {
  windowMin: TimeWindowMin;
  tolPct: UsdTolerancePct;
  limit?: number;
  prices?: Record<string, number>;
};

/** Build nearby candidates around a focus gate event. Does not assert linkage. */
export function findNearbyCandidates(
  focus: GateEventDTO,
  pool: GateEventDTO[],
  opts: MatchOpts,
): CandidateMatch[] {
  const windowMs = opts.windowMin * 60_000;
  const tol = opts.tolPct / 100;
  const prices = opts.prices;
  const focusTs = new Date(focus.blockTime).getTime();
  const focusUsd = notional(focus, prices);
  const focusAmt = amountNumber(focus);
  const focusAddrs = new Set(eventAddresses(focus));

  const scored: CandidateMatch[] = [];

  for (const event of pool) {
    if (event.id === focus.id) continue;
    const ts = new Date(event.blockTime).getTime();
    const deltaMs = ts - focusTs;
    if (Math.abs(deltaMs) > windowMs) continue;

    const reasons: MatchReason[] = [];
    let score = 0;

    const addrs = eventAddresses(event);
    const sameAddr = addrs.some((a) => focusAddrs.has(a));
    if (sameAddr) {
      reasons.push("same_address");
      score += 40;
    }

    if (event.protocol !== focus.protocol) {
      reasons.push("cross_protocol");
      score += 12;
    }

    const sameAsset = sameAssetFamily(event.assetSymbol, focus.assetSymbol);
    if (sameAsset) {
      reasons.push("same_asset");
      score += 10;
    } else {
      reasons.push("asset_convert");
      score += 6;
    }

    const candUsd = notional(event, prices);
    let usdRatio: number | null = null;
    if (focusUsd != null && focusUsd > 0 && candUsd != null && candUsd > 0) {
      usdRatio = candUsd / focusUsd;
      const drift = Math.abs(usdRatio - 1);
      if (drift <= tol) {
        reasons.push("usd_near");
        score += 28 - drift * 40;
      }
    }

    const candAmt = amountNumber(event);
    if (focusAmt != null && candAmt != null && focusAmt > 0 && sameAsset) {
      const ratio = candAmt / focusAmt;
      if (Math.abs(ratio - 1) <= tol) {
        reasons.push("amount_near");
        score += 22;
      }
    }

    if (focus.direction === "out" && event.direction === "in" && deltaMs >= 0) {
      reasons.push("sequence");
      score += 8;
    } else if (
      focus.direction === "in" &&
      event.direction === "out" &&
      deltaMs <= 0
    ) {
      reasons.push("sequence");
      score += 8;
    }

    // Conversion tags: only shield IN counts as →ZEC; deshield/out is not a hop target.
    if (
      isZec(event.assetSymbol) &&
      !isZec(focus.assetSymbol) &&
      event.direction === "in"
    ) {
      reasons.push("to_zec");
      score += 14;
    } else if (!isZec(event.assetSymbol) && isZec(focus.assetSymbol)) {
      reasons.push("from_zec");
      score += 14;
    }

    const closeness = 1 - Math.abs(deltaMs) / windowMs;
    if (closeness >= 0) {
      reasons.push("time_near");
      score += closeness * 15;
    }

    const substantive = reasons.some((r) =>
      [
        "same_address",
        "usd_near",
        "amount_near",
        "to_zec",
        "from_zec",
      ].includes(r),
    );
    if (!substantive) continue;

    if (
      !sameAddr &&
      !reasons.includes("usd_near") &&
      !reasons.includes("amount_near")
    ) {
      // Allow weak ZEC conversion hints only with cross-protocol + sequence.
      const zecHint =
        (reasons.includes("to_zec") || reasons.includes("from_zec")) &&
        reasons.includes("sequence") &&
        reasons.includes("cross_protocol");
      if (!zecHint) continue;
    }

    // Demote dust / tiny notionals (high false-positive rate on ZEC path).
    const focusN = focusUsd ?? 0;
    const candN = candUsd ?? 0;
    if (!sameAddr && focusN > 0 && focusN < INVESTIGATE_MIN_USD_SIGNAL) {
      score *= 0.45;
    }
    if (!sameAddr && candN > 0 && candN < INVESTIGATE_MIN_USD_SIGNAL) {
      score *= 0.55;
    }

    scored.push({ event, reasons, deltaMs, usdRatio, score });
  }

  scored.sort(
    (a, b) => b.score - a.score || Math.abs(a.deltaMs) - Math.abs(b.deltaMs),
  );
  return scored.slice(0, opts.limit ?? 40);
}

type ConversionOpts = MatchOpts & {
  nearIntentQuote?: ConversionChannel["nearIntent"];
};

/**
 * On-chain conversion channels for →ZEC / from ZEC.
 * Hop rail: Near Intent only (no CEX). Deposit addresses are per-swap — not auto-linked.
 */
export function findConversionChannels(
  focus: GateEventDTO,
  pool: GateEventDTO[],
  opts: ConversionOpts,
): ConversionChannel[] {
  const prices = opts.prices ?? {};
  const zecPrice = prices.ZEC ?? null;
  const focusUsd = notional(focus, prices);
  const channels: ConversionChannel[] = [];
  const hopLinks = buildNearIntentHopLinks(focus);
  const nearIntent = opts.nearIntentQuote ?? null;

  const expectedFromQuote = nearIntent?.ok ? nearIntent.amountOutZec : null;
  const expectedFromPrice =
    focusUsd != null && zecPrice != null && zecPrice > 0
      ? focusUsd / zecPrice
      : null;
  const expectedZec = expectedFromQuote ?? expectedFromPrice;

  // Path A: non-ZEC gate OUT → Near Intent → ZEC transparent → shield IN
  if (
    focus.direction === "out" &&
    !isZec(focus.assetSymbol) &&
    (focus.protocol === "tornado" || focus.protocol === "railgun")
  ) {
    const candidates = findNearbyCandidates(focus, pool, opts)
      .filter(
        (m) =>
          m.event.protocol === "zcash" &&
          m.event.direction === "in" &&
          m.deltaMs >= 0 &&
          (m.reasons.includes("usd_near") ||
            m.reasons.includes("same_address") ||
            m.reasons.includes("to_zec")),
      )
      .map((m) => ({
        ...m,
        expectedAmount: expectedZec,
        expectedSymbol: "ZEC",
        score: m.score + 20,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    channels.push({
      kind: "to_zec",
      rail: "near_intent",
      title: "Near Intent · → ZEC",
      summary:
        "On-chain hop via Near Intent 1Click (ETH/stables → transparent ZEC). Then a separate Zcash shield. Deposit addresses are one-shot — check the exit wallet’s transfers.",
      focusUsd,
      expectedZec,
      zecPrice,
      nearIntent,
      gapSteps: [
        `1. ${focus.protocol} OUT · ${focus.assetSymbol}`,
        "2. Near Intent 1Click deposit on origin chain → transparent ZEC out",
        "3. Zcash shield IN candidates (below)",
      ],
      hopLinks,
      candidates,
    });
  }

  // Path B: ZEC shield IN ← prior non-ZEC OUT via Near Intent
  if (focus.direction === "in" && isZec(focus.assetSymbol)) {
    const candidates = findNearbyCandidates(focus, pool, opts)
      .filter(
        (m) =>
          m.event.protocol !== "zcash" &&
          m.event.direction === "out" &&
          m.deltaMs <= 0 &&
          (m.reasons.includes("usd_near") ||
            m.reasons.includes("same_address") ||
            m.reasons.includes("from_zec")),
      )
      .map((m) => ({ ...m, score: m.score + 20 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    channels.push({
      kind: "from_zec",
      rail: "near_intent",
      title: "Near Intent · into this ZEC shield",
      summary:
        "Prior TC/Railgun OUT may have funded a Near Intent swap into transparent ZEC, then this shield. Endpoints only — hop not proven.",
      focusUsd,
      expectedZec: amountNumber(focus),
      zecPrice,
      nearIntent,
      gapSteps: [
        "1. TC / Railgun OUT candidates (below)",
        "2. Near Intent 1Click → transparent ZEC",
        "3. This ZEC shield IN (focus)",
      ],
      hopLinks,
      candidates,
    });
  }

  // Path C: ZEC deshield → Near Intent → other gate IN
  if (focus.direction === "out" && isZec(focus.assetSymbol)) {
    const candidates = findNearbyCandidates(focus, pool, opts)
      .filter(
        (m) =>
          m.event.protocol !== "zcash" &&
          m.event.direction === "in" &&
          m.deltaMs >= 0 &&
          (m.reasons.includes("usd_near") ||
            m.reasons.includes("same_address") ||
            m.reasons.includes("from_zec")),
      )
      .map((m) => ({ ...m, score: m.score + 16 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    channels.push({
      kind: "from_zec",
      rail: "near_intent",
      title: "Near Intent · ZEC deshield → other gate",
      summary:
        "Transparent ZEC out may route through Near Intent into ETH/stables before another privacy-gate IN.",
      focusUsd,
      expectedZec: amountNumber(focus),
      zecPrice,
      nearIntent,
      gapSteps: [
        "1. This ZEC deshield OUT (focus)",
        "2. Near Intent 1Click (ZEC → ETH/stables)",
        "3. TC / Railgun shield IN candidates",
      ],
      hopLinks,
      candidates,
    });
  }

  return channels;
}

function buildNearIntentHopLinks(
  focus: GateEventDTO,
): { label: string; url: string }[] {
  const links: { label: string; url: string }[] = [];
  const addr =
    normalizeAddress(focus.counterparty) ??
    normalizeAddress(focus.fromAddress) ??
    normalizeAddress(focus.toAddress);
  const addrUrl = explorerAddressUrl(focus.chainId, addr);
  const txUrl = explorerTxUrl(focus.chainId, focus.txHash);

  links.push({
    label: "Near Intents",
    url: "https://intents.near.org/",
  });
  links.push({
    label: "1Click docs",
    url: "https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/making-a-request",
  });
  if (txUrl) links.push({ label: "Focus tx", url: txUrl });
  if (addrUrl && addr) {
    links.push({ label: "Counterparty", url: addrUrl });
    if (focus.chainId === 1 && addr.startsWith("0x")) {
      links.push({
        label: "Check deposits (tokentxns)",
        url: `https://etherscan.io/address/${addr}#tokentxns`,
      });
    }
  }
  if (focus.protocol === "zcash" || focus.assetSymbol.toUpperCase() === "ZEC") {
    links.push({ label: "CipherScan", url: "https://cipherscan.app/" });
  }
  return links;
}

export function reasonLabel(reason: MatchReason): string {
  switch (reason) {
    case "same_address":
      return "same address";
    case "usd_near":
      return "USD near";
    case "amount_near":
      return "amount near";
    case "same_asset":
      return "same asset";
    case "cross_protocol":
      return "other gate";
    case "time_near":
      return "in window";
    case "sequence":
      return "OUT→IN order";
    case "asset_convert":
      return "asset change";
    case "to_zec":
      return "→ ZEC";
    case "from_zec":
      return "from ZEC";
    default:
      return reason;
  }
}

export function formatDelta(deltaMs: number): string {
  const sign = deltaMs >= 0 ? "+" : "−";
  const abs = Math.abs(deltaMs);
  const sec = Math.floor(abs / 1000);
  if (sec < 60) return `${sign}${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${sign}${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${sign}${hr}h`;
  return `${sign}${Math.floor(hr / 24)}d`;
}

/**
 * Direction-aware trail peers for Flow UI.
 * OUT ← prior IN (funding). IN ← prior OUT; destinations are the opposite later side.
 */
export function findTrailPeers(
  focus: GateEventDTO,
  pool: GateEventDTO[],
  opts: MatchOpts,
): { sources: CandidateMatch[]; destinations: CandidateMatch[] } {
  const windowMs = opts.windowMin * 60_000;
  const prices = opts.prices;
  const focusTs = new Date(focus.blockTime).getTime();
  const focusUsd = notional(focus, prices);
  const focusAmt = amountNumber(focus);
  const focusAddrs = new Set(eventAddresses(focus));
  const wantSourceDir: "in" | "out" =
    focus.direction === "out" ? "in" : "out";
  const wantDestDir: "in" | "out" =
    focus.direction === "out" ? "in" : "out";

  const scorePeer = (
    event: GateEventDTO,
    role: "source" | "dest",
  ): CandidateMatch | null => {
    if (event.id === focus.id) return null;
    const ts = new Date(event.blockTime).getTime();
    const deltaMs = ts - focusTs;
    if (Math.abs(deltaMs) > windowMs) return null;
    if (role === "source" && !(deltaMs <= 0 && event.direction === wantSourceDir)) {
      return null;
    }
    if (role === "dest" && !(deltaMs > 0 && event.direction === wantDestDir)) {
      return null;
    }

    const reasons: MatchReason[] = [];
    let score = 8;
    const addrs = eventAddresses(event);
    const sameAddr = addrs.some((a) => focusAddrs.has(a));
    if (sameAddr) {
      reasons.push("same_address");
      score += 45;
    }
    if (event.protocol === focus.protocol) {
      score += 10;
    } else {
      reasons.push("cross_protocol");
      score += 6;
    }
    if (focus.poolLabel && event.poolLabel && focus.poolLabel === event.poolLabel) {
      score += 18;
      reasons.push("amount_near");
    }
    const sameAsset = sameAssetFamily(event.assetSymbol, focus.assetSymbol);
    if (sameAsset) {
      reasons.push("same_asset");
      score += 12;
    } else {
      reasons.push("asset_convert");
    }

    const candUsd = notional(event, prices);
    let usdRatio: number | null = null;
    if (focusUsd != null && focusUsd > 0 && candUsd != null && candUsd > 0) {
      usdRatio = candUsd / focusUsd;
      const drift = Math.abs(usdRatio - 1);
      // Trail sources: keep near notionals; still show same-pool / same-asset farther ones.
      if (drift <= opts.tolPct / 100) {
        reasons.push("usd_near");
        score += 30 - drift * 40;
      } else if (drift <= 0.35) {
        score += 8;
      }
    }

    const candAmt = amountNumber(event);
    if (focusAmt != null && candAmt != null && focusAmt > 0 && sameAsset) {
      const ratio = candAmt / focusAmt;
      if (Math.abs(ratio - 1) <= opts.tolPct / 100) {
        if (!reasons.includes("amount_near")) reasons.push("amount_near");
        score += 28;
      } else if (focus.protocol === "tornado") {
        // Fixed-denomination pools: 100 ETH OUT should not rank 0.1/1 ETH IN first.
        score *= 0.55;
      }
    }

    reasons.push("sequence");
    reasons.push("time_near");
    score += (1 - Math.abs(deltaMs) / windowMs) * 16;

    if (
      !sameAddr &&
      !reasons.includes("usd_near") &&
      !reasons.includes("amount_near") &&
      !sameAsset
    ) {
      return null;
    }

    return { event, reasons, deltaMs, usdRatio, score };
  };

  const sources: CandidateMatch[] = [];
  const destinations: CandidateMatch[] = [];
  for (const event of pool) {
    const src = scorePeer(event, "source");
    if (src) sources.push(src);
    const dest = scorePeer(event, "dest");
    if (dest) destinations.push(dest);
  }

  sources.sort(
    (a, b) => b.score - a.score || Math.abs(a.deltaMs) - Math.abs(b.deltaMs),
  );
  destinations.sort(
    (a, b) => b.score - a.score || Math.abs(a.deltaMs) - Math.abs(b.deltaMs),
  );

  return {
    sources: sources.slice(0, opts.limit ?? 30),
    destinations: destinations.slice(0, opts.limit ?? 30),
  };
}

/** Pick candidate list for the active investigate assumption. */
export function candidatesForMode(
  mode: InvestigateMode,
  nearby: CandidateMatch[],
  channels: ConversionChannel[],
  opts?: { hideWeak?: boolean },
): CandidateMatch[] {
  const hideWeak = opts?.hideWeak ?? true;
  const raw =
    mode === "near_intent"
      ? (channels[0]?.candidates ?? []).map((m) => ({
          ...m,
          // Prefer conversion-tagged rows in this mode.
          score: m.score + (m.reasons.includes("to_zec") || m.reasons.includes("from_zec") ? 5 : 0),
        }))
      : nearby.filter(
          (m) =>
            m.reasons.includes("same_address") ||
            m.reasons.includes("same_asset") ||
            m.reasons.includes("usd_near") ||
            m.reasons.includes("amount_near"),
        );

  const sorted = [...raw].sort(
    (a, b) => b.score - a.score || Math.abs(a.deltaMs) - Math.abs(b.deltaMs),
  );

  if (!hideWeak) return sorted;
  const strongOrMed = sorted.filter((m) => candidateStrength(m) !== "weak");
  // Always keep at least a few rows so the panel isn't empty.
  return strongOrMed.length >= 3 ? strongOrMed : sorted.slice(0, 12);
}
