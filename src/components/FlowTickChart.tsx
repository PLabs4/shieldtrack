"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { GateEventDTO } from "@/lib/types";
import { estimateNotionalUsd, formatUsd } from "@/lib/format";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** Chart always shows the last 1 hour. */
const WINDOW_SEC = 60 * 60;
const PAD = { t: 14, r: 72, b: 22, l: 8 };

type Tick = { id: string; t: number; v: number };
type Sample = { t: number; v: number };

type Props = {
  events: GateEventDTO[];
  prices?: Record<string, number>;
};

function shortUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 2)}M`;
  }
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return formatUsd(n);
}

function toTicks(
  events: GateEventDTO[],
  direction: "in" | "out",
  prices: Record<string, number> | undefined,
  from: number,
  to: number,
): Tick[] {
  const ticks: Tick[] = [];
  for (const e of events) {
    if (e.direction !== direction) continue;
    const t = new Date(e.blockTime).getTime();
    if (!Number.isFinite(t) || t < from || t > to) continue;
    const usd = estimateNotionalUsd(e, prices);
    if (usd == null || !Number.isFinite(usd) || usd <= 0) continue;
    ticks.push({ id: e.id, t, v: usd });
  }
  ticks.sort((a, b) => a.t - b.t);
  return ticks;
}

function maxUsd(
  events: GateEventDTO[],
  direction: "in" | "out",
  prices: Record<string, number> | undefined,
  from: number,
  to: number,
): number | null {
  let max: number | null = null;
  for (const e of events) {
    if (e.direction !== direction) continue;
    const t = new Date(e.blockTime).getTime();
    if (!Number.isFinite(t) || t < from || t > to) continue;
    const usd = estimateNotionalUsd(e, prices);
    if (usd == null || !Number.isFinite(usd) || usd <= 0) continue;
    if (max == null || usd > max) max = usd;
  }
  return max;
}

function domainY(vals: number[]): { min: number; max: number } {
  if (!vals.length) return { min: 0, max: 1 };
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (min === max) {
    const pad = Math.max(min * 0.35, 1);
    return { min: Math.max(0, min - pad), max: max + pad };
  }
  const pad = (max - min) * 0.16;
  return { min: Math.max(0, min - pad), max: max + pad };
}

/** 1Hz last-print tape: hold prior value every quiet second. */
function buildTape(ticks: Tick[], t0: number, nowSec: number): Sample[] {
  let i = 0;
  let last: number | null = null;
  while (i < ticks.length && ticks[i]!.t < t0) {
    last = ticks[i]!.v;
    i++;
  }
  const out: Sample[] = [];
  for (let sec = Math.floor(t0 / 1000); sec <= nowSec; sec++) {
    const t = sec * 1000;
    while (i < ticks.length && ticks[i]!.t <= t) {
      last = ticks[i]!.v;
      i++;
    }
    if (last == null) continue;
    out.push({ t, v: last });
  }
  return out;
}

/** Keep hold endpoints + value changes so the curve has real corners to bend. */
function keySamples(samples: Sample[]): Sample[] {
  if (samples.length <= 2) return samples.slice();
  const out: Sample[] = [samples[0]!];
  for (let i = 1; i < samples.length; i++) {
    const cur = samples[i]!;
    const prev = samples[i - 1]!;
    if (cur.v !== out[out.length - 1]!.v) {
      if (out[out.length - 1]!.t !== prev.t) out.push(prev);
      out.push(cur);
    }
  }
  const last = samples[samples.length - 1]!;
  if (out[out.length - 1]!.t !== last.t) out.push(last);
  return out;
}

/**
 * Smooth cubic path (Polymarket-style arcs) — no right-angle steps.
 * Control points stay on the segment's horizontal so Y doesn't overshoot.
 */
function curvePath(
  samples: Sample[],
  t0: number,
  nowMs: number,
  ymin: number,
  ymax: number,
  width: number,
  height: number,
): string | null {
  if (!samples.length || width <= 0) return null;
  const spanMs = Math.max(1000, nowMs - t0);
  const inner = width - PAD.l - PAD.r;
  const xOf = (t: number) => PAD.l + ((t - t0) / spanMs) * inner;
  const yOf = (v: number) => {
    const span = ymax - ymin || 1;
    return height - PAD.b - ((v - ymin) / span) * (height - PAD.b - PAD.t);
  };

  const keys = keySamples(samples);
  const pts = keys.map((s) => ({ x: xOf(s.t), y: yOf(s.v) }));
  // Live hold past the rail for sub-second scroll.
  const last = pts[pts.length - 1]!;
  // Extra hold past the rail for sub-second scroll (~1s of chart width).
  const pxPerSec = (width - PAD.l - PAD.r) / WINDOW_SEC;
  pts.push({ x: width - PAD.r + pxPerSec, y: last.y });

  if (pts.length === 1) {
    return `M${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)}`;
  }

  let d = `M${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const dx = (b.x - a.x) * 0.45;
    // Flat segment → almost linear; jump → soft S-curve.
    d += `C${(a.x + dx).toFixed(2)} ${a.y.toFixed(2)},${(b.x - dx).toFixed(2)} ${b.y.toFixed(2)},${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
  }
  return d;
}

export function FlowTickChart({ events, prices }: Props) {
  const gid = useId().replace(/:/g, "");
  const inGrad = `flow-in-${gid}`;
  const outGrad = `flow-out-${gid}`;
  const boxRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<SVGGElement>(null);
  const railRef = useRef<SVGLineElement>(null);
  const [mounted, setMounted] = useState(false);
  const [size, setSize] = useState({ w: 640, h: 260 });
  // Fixed seed for SSR/CSR match; real clock starts after mount.
  const [nowSec, setNowSec] = useState(0);
  const prevRef = useRef<{ in: string | null; out: string | null }>({
    in: null,
    out: null,
  });
  const primedRef = useRef(false);
  const [pulse, setPulse] = useState<{ in: boolean; out: boolean }>({
    in: false,
    out: false,
  });

  useEffect(() => {
    setMounted(true);
    setNowSec(Math.floor(Date.now() / 1000));
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setSize({
        w: Math.max(280, Math.round(cr.width)),
        h: Math.max(200, Math.round(cr.height)),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mounted]);

  // New data point every whole second.
  useEffect(() => {
    if (!mounted) return;
    const tick = () => setNowSec(Math.floor(Date.now() / 1000));
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [mounted]);

  // Smooth leftward crawl between seconds (DOM only — no React re-render).
  useEffect(() => {
    if (!mounted) return;
    let raf = 0;
    const loop = () => {
      const ms = Date.now();
      const frac = (ms % 1000) / 1000;
      const innerW = Math.max(1, size.w - PAD.l - PAD.r);
      const shift = (innerW / WINDOW_SEC) * frac;
      if (scrollRef.current) {
        scrollRef.current.setAttribute("transform", `translate(${-shift},0)`);
      }
      if (railRef.current) {
        const x = size.w - PAD.r;
        railRef.current.setAttribute("x1", String(x));
        railRef.current.setAttribute("x2", String(x));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mounted, size.w]);

  const model = useMemo(() => {
    if (!mounted || nowSec <= 0) {
      return null;
    }
    const nowMs = nowSec * 1000;
    const dayStart = nowMs - DAY_MS;
    const innerW = Math.max(1, size.w - PAD.l - PAD.r);
    const windowSec = WINDOW_SEC;
    const t0 = nowMs - HOUR_MS;

    const inTicks = toTicks(events, "in", prices, dayStart, nowMs + 1000);
    const outTicks = toTicks(events, "out", prices, dayStart, nowMs + 1000);
    const inTape = buildTape(inTicks, t0, nowSec);
    const outTape = buildTape(outTicks, t0, nowSec);
    const shared = domainY([
      ...inTape.map((s) => s.v),
      ...outTape.map((s) => s.v),
    ]);

    const yOf = (v: number) => {
      const span = shared.max - shared.min || 1;
      return (
        size.h - PAD.b - ((v - shared.min) / span) * (size.h - PAD.b - PAD.t)
      );
    };
    const xOf = (t: number) => {
      const spanMs = windowSec * 1000;
      return PAD.l + ((t - t0) / spanMs) * innerW;
    };

    const inPath = curvePath(
      inTape,
      t0,
      nowMs,
      shared.min,
      shared.max,
      size.w,
      size.h,
    );
    const outPath = curvePath(
      outTape,
      t0,
      nowMs,
      shared.min,
      shared.max,
      size.w,
      size.h,
    );

    const liveX = size.w - PAD.r;
    const inLast = inTape[inTape.length - 1];
    const outLast = outTape[outTape.length - 1];
    const inEnd = inLast
      ? { x: liveX, y: yOf(inLast.v), v: inLast.v }
      : null;
    const outEnd = outLast
      ? { x: liveX, y: yOf(outLast.v), v: outLast.v }
      : null;

    // Dots only on the last ~2 minutes (readable near the live edge).
    const dotFrom = nowMs - 120_000;
    const inDots = inTape
      .filter((s) => s.t >= dotFrom)
      .map((s) => ({ x: xOf(s.t), y: yOf(s.v), t: s.t }));
    const outDots = outTape
      .filter((s) => s.t >= dotFrom)
      .map((s) => ({ x: xOf(s.t), y: yOf(s.v), t: s.t }));

    // 5-minute grid across the 1h window.
    const grids: number[] = [];
    for (let sec = Math.ceil(t0 / 1000); sec <= nowSec; sec++) {
      if (sec % 300 === 0) grids.push(xOf(sec * 1000));
    }

    // Nudge overlapping end labels apart.
    let inLabelY = inEnd?.y ?? 0;
    let outLabelY = outEnd?.y ?? 0;
    if (inEnd && outEnd && Math.abs(inLabelY - outLabelY) < 18) {
      if (inLabelY <= outLabelY) {
        inLabelY -= 10;
        outLabelY += 10;
      } else {
        outLabelY -= 10;
        inLabelY += 10;
      }
    }

    return {
      shared,
      inPath,
      outPath,
      inEnd,
      outEnd,
      inLabelY,
      outLabelY,
      inDots,
      outDots,
      grids,
      maxIn24: maxUsd(events, "in", prices, dayStart, nowMs),
      maxOut24: maxUsd(events, "out", prices, dayStart, nowMs),
      lastInId: inTicks[inTicks.length - 1]?.id ?? null,
      lastOutId: outTicks[outTicks.length - 1]?.id ?? null,
      liveX,
      yOf,
      w: size.w,
      h: size.h,
      sampleCount: Math.max(inTape.length, outTape.length),
    };
  }, [events, prices, nowSec, size, mounted]);

  useEffect(() => {
    if (!model) return;
    const prev = prevRef.current;
    const next = {
      in: Boolean(model.lastInId && model.lastInId !== prev.in),
      out: Boolean(model.lastOutId && model.lastOutId !== prev.out),
    };
    prevRef.current = { in: model.lastInId, out: model.lastOutId };
    if (!primedRef.current) {
      primedRef.current = true;
      return;
    }
    if (!next.in && !next.out) return;
    setPulse(next);
    const t = window.setTimeout(() => setPulse({ in: false, out: false }), 900);
    return () => window.clearTimeout(t);
  }, [model?.lastInId, model?.lastOutId]);

  if (!model) {
    return (
      <div className="overflow-hidden rounded-lg border border-[#1c2620] bg-[#0f1412] text-[#e8efe9]">
        <div className="grid grid-cols-2 gap-2 px-3 pt-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6f7d72]">
              24h max IN
            </div>
            <div className="mt-0.5 font-display text-[28px] leading-none tracking-tight text-[#3dcf84]">
              —
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6f7d72]">
              24h max OUT
            </div>
            <div className="mt-0.5 font-display text-[28px] leading-none tracking-tight text-[#ff6b4a]">
              —
            </div>
          </div>
        </div>
        <div className="mt-1 h-[240px] w-full sm:h-[280px]" />
      </div>
    );
  }

  const empty = !model.inPath && !model.outPath;
  const guides = [
    model.shared.max,
    (model.shared.min + model.shared.max) / 2,
    model.shared.min,
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-[#1c2620] bg-[#0f1412] text-[#e8efe9]">
      <div className="grid grid-cols-2 gap-2 px-3 pt-3">
        <div className={pulse.in ? "tick-flash" : undefined}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6f7d72]">
            24h max IN
          </div>
          <div className="mt-0.5 font-display text-[28px] leading-none tracking-tight text-[#3dcf84]">
            {shortUsd(model.maxIn24)}
          </div>
        </div>
        <div className={pulse.out ? "tick-flash" : undefined}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6f7d72]">
            24h max OUT
          </div>
          <div className="mt-0.5 font-display text-[28px] leading-none tracking-tight text-[#ff6b4a]">
            {shortUsd(model.maxOut24)}
          </div>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between px-3 text-[10px] text-[#6f7d72]">
        <span className="font-semibold uppercase tracking-[0.12em]">
          live 1h · +1pt/s · {model.sampleCount} pts
        </span>
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-0.5 w-3 rounded bg-[#3dcf84]" />
            IN
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-0.5 w-3 rounded bg-[#ff6b4a]" />
            OUT
          </span>
        </span>
      </div>

      <div ref={boxRef} className="relative mt-1 h-[240px] w-full sm:h-[280px]">
        <svg
          width={model.w}
          height={model.h}
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label="Live IN and OUT 1-second tape"
        >
          <defs>
            <linearGradient id={inGrad} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3dcf84" stopOpacity="0.4" />
              <stop offset="55%" stopColor="#3dcf84" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#3dcf84" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={outGrad} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff6b4a" stopOpacity="0.32" />
              <stop offset="55%" stopColor="#ff6b4a" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#ff6b4a" stopOpacity="0" />
            </linearGradient>
            <clipPath id={`clip-${gid}`}>
              <rect
                x={PAD.l}
                y={0}
                width={Math.max(0, model.w - PAD.l - PAD.r)}
                height={model.h}
              />
            </clipPath>
          </defs>

          {guides.map((g, i) => {
            const y = model.yOf(g);
            return (
              <g key={`g-${i}`}>
                <line
                  x1={PAD.l}
                  x2={model.w - PAD.r}
                  y1={y}
                  y2={y}
                  stroke="#24302a"
                  strokeWidth="1"
                />
                <text
                  x={model.w - PAD.r + 6}
                  y={y + 3.5}
                  fill="#6f7d72"
                  fontSize="11"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {shortUsd(g)}
                </text>
              </g>
            );
          })}

          <g clipPath={`url(#clip-${gid})`}>
            <g ref={scrollRef}>
              {model.grids.map((x, i) => (
                <line
                  key={`grid-${i}`}
                  x1={x}
                  x2={x}
                  y1={PAD.t}
                  y2={model.h - PAD.b}
                  stroke="#1a2420"
                  strokeWidth="1"
                />
              ))}

              {empty ? (
                <text
                  x={(model.w - PAD.r + PAD.l) / 2}
                  y={model.h / 2}
                  textAnchor="middle"
                  fill="#6f7d72"
                  fontSize="14"
                >
                  Waiting for prints…
                </text>
              ) : null}

              {model.inPath ? (
                <path
                  d={`${model.inPath}V${(model.h - PAD.b).toFixed(2)}H${PAD.l}Z`}
                  fill={`url(#${inGrad})`}
                />
              ) : null}
              {model.outPath ? (
                <path
                  d={`${model.outPath}V${(model.h - PAD.b).toFixed(2)}H${PAD.l}Z`}
                  fill={`url(#${outGrad})`}
                />
              ) : null}

              {model.inPath ? (
                <path
                  d={model.inPath}
                  fill="none"
                  stroke="#3dcf84"
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
              {model.outPath ? (
                <path
                  d={model.outPath}
                  fill="none"
                  stroke="#ff6b4a"
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}

              {model.inDots.map((d) => (
                <circle
                  key={`in-${d.t}`}
                  cx={d.x}
                  cy={d.y}
                  r="2"
                  fill="#3dcf84"
                />
              ))}
              {model.outDots.map((d) => (
                <circle
                  key={`out-${d.t}`}
                  cx={d.x}
                  cy={d.y}
                  r="2"
                  fill="#ff6b4a"
                />
              ))}
            </g>
          </g>

          {/* Live edge — fixed at right; tape scrolls under it */}
          <line
            ref={railRef}
            x1={model.liveX}
            x2={model.liveX}
            y1={PAD.t}
            y2={model.h - PAD.b}
            stroke="#3dcf84"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            opacity="0.85"
          />

          {model.inEnd ? (
            <g className={pulse.in ? "tick-dot-pulse" : undefined}>
              <circle
                cx={model.liveX}
                cy={model.inEnd.y}
                r="14"
                fill="#3dcf84"
                opacity="0.2"
              />
              <circle cx={model.liveX} cy={model.inEnd.y} r="5.5" fill="#3dcf84" />
              <circle cx={model.liveX} cy={model.inEnd.y} r="2.2" fill="#0f1412" />
              <rect
                x={model.liveX + 8}
                y={model.inLabelY - 8}
                width={58}
                height="16"
                rx="3"
                fill="#143022"
                stroke="#3dcf84"
                strokeWidth="1"
              />
              <text
                x={model.liveX + 37}
                y={model.inLabelY + 3.5}
                textAnchor="middle"
                fill="#3dcf84"
                fontSize="11"
                fontWeight="600"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                {shortUsd(model.inEnd.v)}
              </text>
            </g>
          ) : null}
          {model.outEnd ? (
            <g className={pulse.out ? "tick-dot-pulse" : undefined}>
              <circle
                cx={model.liveX}
                cy={model.outEnd.y}
                r="14"
                fill="#ff6b4a"
                opacity="0.2"
              />
              <circle
                cx={model.liveX}
                cy={model.outEnd.y}
                r="5.5"
                fill="#ff6b4a"
              />
              <circle
                cx={model.liveX}
                cy={model.outEnd.y}
                r="2.2"
                fill="#0f1412"
              />
              <rect
                x={model.liveX + 8}
                y={model.outLabelY - 8}
                width={58}
                height="16"
                rx="3"
                fill="#2a1612"
                stroke="#ff6b4a"
                strokeWidth="1"
              />
              <text
                x={model.liveX + 37}
                y={model.outLabelY + 3.5}
                textAnchor="middle"
                fill="#ff6b4a"
                fontSize="11"
                fontWeight="600"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                {shortUsd(model.outEnd.v)}
              </text>
            </g>
          ) : null}
        </svg>

        <div className="pointer-events-none absolute inset-x-2 bottom-1 flex justify-between text-[10px] tabular-nums text-[#6f7d72]">
          <span>-1h</span>
          <span className="text-[#3dcf84]">▶ now</span>
        </div>
      </div>
    </div>
  );
}
