import { NextRequest, NextResponse } from "next/server";
import { listEvents } from "@/lib/queries";
import type { ProtocolId } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const protocol = sp.get("protocol") as ProtocolId | null;
  const direction = sp.get("direction") as "in" | "out" | null;
  const tier = sp.get("tier") as "normal" | "large" | "ultra" | null;
  const limit = Number(sp.get("limit") ?? "100");
  const minUsdRaw = sp.get("minUsd");
  const minUsd = minUsdRaw != null ? Number(minUsdRaw) : undefined;
  const address = sp.get("address") ?? undefined;

  const events = await listEvents({
    protocol: protocol ?? undefined,
    direction: direction ?? undefined,
    tier: tier ?? undefined,
    minUsd: minUsd != null && Number.isFinite(minUsd) ? minUsd : undefined,
    address,
    limit: Number.isFinite(limit) ? Math.min(limit, 500) : 100,
  });

  return NextResponse.json({ events });
}
