import type { AmountTier } from "@/lib/types";
import { config } from "@/lib/config";

export function classifyTier(amountUsd: number | null): AmountTier {
  if (amountUsd == null || !Number.isFinite(amountUsd)) return "normal";
  if (amountUsd >= config.ultraUsd) return "ultra";
  if (amountUsd >= config.largeUsd) return "large";
  return "normal";
}
