import { config } from "@/lib/config";
import type { ParsedGateEvent } from "@/lib/types";

type CipherScanFlow = {
  id?: number;
  txid: string;
  blockHeight?: number;
  blockTime?: number;
  flowType?: string;
  amountZec?: number;
  pool?: string;
  addresses?: string[];
};

type CipherScanListResponse = {
  success?: boolean;
  flows?: CipherScanFlow[];
};

function directionFromFlow(flowType: string | undefined): "in" | "out" | null {
  const t = (flowType ?? "").toLowerCase();
  // Skip fully-shielded internals (no public amount / transparent edge).
  if (t === "fully_shielded" || t.includes("fully_shielded")) return null;
  if (t.includes("deshield") || t.includes("unshield")) return "out";
  if (t === "shield" || t.includes("shielding") || t.startsWith("shield")) {
    return "in";
  }
  return null;
}

function normalizeFlow(flow: CipherScanFlow): ParsedGateEvent | null {
  const direction = directionFromFlow(flow.flowType);
  if (!direction || !flow.txid) return null;
  if (flow.amountZec == null || !Number.isFinite(flow.amountZec) || flow.amountZec <= 0) {
    return null;
  }

  const addr = flow.addresses?.[0] ?? null;
  const blockTimeSec = flow.blockTime ?? Math.floor(Date.now() / 1000);

  return {
    protocol: "zcash",
    direction,
    chainId: 133,
    chainLabel: "Zcash",
    assetSymbol: "ZEC",
    assetAddress: null,
    amountRaw: Math.round(flow.amountZec * 1e8).toString(),
    amountFormatted: flow.amountZec,
    fromAddress: direction === "in" ? addr : "shielded",
    toAddress: direction === "out" ? addr : "shielded",
    counterparty: addr,
    txHash: flow.txid,
    logIndex: flow.id ?? 0,
    blockNumber:
      flow.blockHeight != null ? BigInt(flow.blockHeight) : null,
    blockTime: new Date(
      blockTimeSec > 1e12 ? blockTimeSec : blockTimeSec * 1000,
    ),
    poolLabel: flow.pool ? `Zcash ${flow.pool}` : "Shielded pool",
    relayer: null,
    feeRaw: null,
    meta: {
      flowType: flow.flowType ?? null,
      source: "cipherscan",
    },
  };
}

/**
 * Pull recent shielding / deshielding flows from CipherScan mainnet API.
 * Docs: https://cipherscan.app/docs — GET /api/shielded/list
 */
export async function fetchZcashGateEvents(
  limit = 50,
): Promise<ParsedGateEvent[]> {
  const base = config.zcashApiBase.replace(/\/$/, "");
  const url = `${base}/shielded/list?limit=${limit}`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    throw new Error(`Zcash API ${res.status} for ${url}`);
  }

  const payload = (await res.json()) as CipherScanListResponse & {
    redirect?: string;
  };
  // Old cipherscan.app host returns a JSON redirect stub instead of flows.
  if (!payload.flows && typeof payload.redirect === "string") {
    throw new Error(
      `Zcash API returned redirect stub → ${payload.redirect}. Set ZCASH_API_BASE=https://api.mainnet.cipherscan.app/api`,
    );
  }
  const flows = payload.flows ?? [];
  return flows
    .map(normalizeFlow)
    .filter((x): x is ParsedGateEvent => x != null);
}
