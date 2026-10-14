export type ProtocolId = "tornado" | "railgun" | "zcash";
export type Direction = "in" | "out";
export type AmountTier = "normal" | "large" | "ultra";

export type GateEventDTO = {
  id: string;
  protocol: ProtocolId;
  direction: Direction;
  chainId: number;
  chainLabel: string;
  assetSymbol: string;
  assetAddress: string | null;
  amountRaw: string;
  amountFormatted: string;
  amountUsd: string | null;
  tier: AmountTier;
  fromAddress: string | null;
  toAddress: string | null;
  counterparty: string | null;
  txHash: string;
  logIndex: number;
  blockNumber: string | null;
  blockTime: string;
  poolLabel: string | null;
  relayer: string | null;
  feeRaw: string | null;
};

export type ProtocolStats = {
  protocol: ProtocolId;
  inCount: number;
  outCount: number;
  inUsd: number;
  outUsd: number;
  poolTvlUsd: number | null;
  poolTvlLabel: string | null;
  lastInEvent: GateEventDTO | null;
  lastOutEvent: GateEventDTO | null;
};

export type AssetPriceQuote = {
  symbol: string;
  usd: number | null;
  /** Percent change over ~24h (e.g. -1.25 = −1.25%). */
  change24h: number | null;
  updatedAt: string | null;
};

export type DashboardSnapshot = {
  startedAt: string;
  stats: ProtocolStats[];
  live: GateEventDTO[];
  history: GateEventDTO[];
  historyMinUsd: number;
  prices: AssetPriceQuote[];
  ultra: GateEventDTO | null;
  indexer: {
    healthy: boolean;
    lastTickAt: string | null;
  };
};

export type ParsedGateEvent = {
  protocol: ProtocolId;
  direction: Direction;
  chainId: number;
  chainLabel: string;
  assetSymbol: string;
  assetAddress: string | null;
  amountRaw: string;
  amountFormatted: number;
  fromAddress: string | null;
  toAddress: string | null;
  counterparty: string | null;
  txHash: string;
  logIndex: number;
  blockNumber: bigint | null;
  blockTime: Date;
  poolLabel: string | null;
  relayer: string | null;
  feeRaw: string | null;
  meta?: Record<string, unknown>;
};
