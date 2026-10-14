"use client";

import { useEffect, useState } from "react";

function formatRelative(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(diff / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

/** Client-only relative time — avoids SSR hydration mismatch from Date.now(). */
export function RelativeTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setLabel(formatRelative(iso, Date.now()));
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, [iso]);

  return (
    <time dateTime={iso} className="tabular-nums">
      {label ?? "…"}
    </time>
  );
}
