import type { ProtocolId } from "@/lib/types";

export const PROTOCOL_BRAND: Record<
  ProtocolId,
  {
    label: string;
    short: string;
    /** Tailwind-friendly solid colors for badges */
    bg: string;
    text: string;
    border: string;
    bar: string;
  }
> = {
  tornado: {
    label: "Tornado Cash",
    short: "TC",
    bg: "#0f3d3e",
    text: "#d8f3f0",
    border: "#1f6f6e",
    bar: "#1f6f6e",
  },
  railgun: {
    label: "Railgun",
    short: "RG",
    bg: "#1e2a5a",
    text: "#dce4ff",
    border: "#3b4d9a",
    bar: "#3b4d9a",
  },
  zcash: {
    label: "Zcash",
    short: "ZEC",
    bg: "#f4b728",
    text: "#1a1408",
    border: "#d49a12",
    bar: "#f4b728",
  },
};
