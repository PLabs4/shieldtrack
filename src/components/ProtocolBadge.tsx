import type { ProtocolId } from "@/lib/types";
import { PROTOCOL_BRAND } from "@/lib/protocols/brand";

export function ProtocolBadge({
  protocol,
  size = "md",
}: {
  protocol: ProtocolId;
  size?: "sm" | "md";
}) {
  const brand = PROTOCOL_BRAND[protocol];
  const pad = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-semibold tracking-wide ${pad}`}
      style={{
        background: brand.bg,
        color: brand.text,
        border: `1px solid ${brand.border}`,
      }}
      title={brand.label}
    >
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-[4px] text-[9px] font-bold"
        style={{
          background: "rgba(255,255,255,0.16)",
          color: brand.text,
        }}
        aria-hidden="true"
      >
        {brand.short === "ZEC" ? "Z" : brand.short}
      </span>
      {brand.label}
    </span>
  );
}

export function ProtocolBar({ protocol }: { protocol: ProtocolId }) {
  const brand = PROTOCOL_BRAND[protocol];
  return (
    <span
      className="absolute top-0 bottom-0 left-0 w-1 rounded-l-sm"
      style={{ background: brand.bar }}
      aria-hidden="true"
    />
  );
}
