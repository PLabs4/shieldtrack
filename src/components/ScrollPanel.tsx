"use client";

import { useRef } from "react";

export function ScrollPanel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const scrollBy = (delta: number) => {
    ref.current?.scrollBy({ top: delta, behavior: "smooth" });
  };

  return (
    <div className={`relative min-h-0 flex-1 ${className}`}>
      <div
        ref={ref}
        className="h-full overflow-y-auto overscroll-contain [scrollbar-width:thin]"
      >
        {children}
      </div>
      <div className="pointer-events-none absolute top-2 right-2 flex flex-col gap-1">
        <button
          type="button"
          className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-line bg-panel/95 text-sm text-ink shadow-sm hover:border-gold"
          aria-label="Scroll up"
          onClick={() => scrollBy(-140)}
        >
          ↑
        </button>
        <button
          type="button"
          className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-line bg-panel/95 text-sm text-ink shadow-sm hover:border-gold"
          aria-label="Scroll down"
          onClick={() => scrollBy(140)}
        >
          ↓
        </button>
      </div>
    </div>
  );
}
