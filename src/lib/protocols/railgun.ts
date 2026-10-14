import {
  type Address,
  type Hex,
  type Log,
  decodeEventLog,
  parseAbiItem,
  formatUnits,
} from "viem";
import type { ParsedGateEvent } from "@/lib/types";

/** RailgunSmartWallet proxy — same address on Ethereum & Arbitrum. */
export const RAILGUN_ETH_ADDRESS =
  "0xFA7093CDD9EE6932B4eb2c9e1cde7CE00B1FA4b9" as Address;

export const RAILGUN_DEPLOYMENTS = [
  {
    address: RAILGUN_ETH_ADDRESS,
    chainId: 1,
    chainLabel: "Ethereum",
    cursorKey: "railgun-eth",
  },
] as const;

/** Current Shield on Ethereum (fees + 3-word ciphertext bundle). */
export const RAILGUN_SHIELD = parseAbiItem(
  "event Shield(uint256 treeNumber, uint256 startPosition, (bytes32 npk, (uint8 tokenType, address tokenAddress, uint256 tokenSubID) token, uint120 value)[] commitments, (bytes32[3] encryptedBundle, bytes32 shieldKey)[] shieldCiphertext, uint256[] fees)",
);

/** Alternate Shield (4-word ciphertext bundle). */
export const RAILGUN_SHIELD_V4_BUNDLE = parseAbiItem(
  "event Shield(uint256 treeNumber, uint256 startPosition, (bytes32 npk, (uint8 tokenType, address tokenAddress, uint256 tokenSubID) token, uint120 value)[] commitments, (bytes32[4] encryptedBundle, bytes32 shieldKey)[] shieldCiphertext, uint256[] fees)",
);

/** Legacy Shield (3-word ciphertext, no fees array). */
export const RAILGUN_SHIELD_LEGACY = parseAbiItem(
  "event Shield(uint256 treeNumber, uint256 startPosition, (bytes32 npk, (uint8 tokenType, address tokenAddress, uint256 tokenSubID) token, uint120 value)[] commitments, (bytes32[3] encryptedBundle, bytes32 shieldKey)[] shieldCiphertext)",
);

export const RAILGUN_UNSHIELD = parseAbiItem(
  "event Unshield(address to, (uint8 tokenType, address tokenAddress, uint256 tokenSubID) token, uint256 amount, uint256 fee)",
);

export const RAILGUN_EVENTS = [
  RAILGUN_SHIELD,
  RAILGUN_SHIELD_V4_BUNDLE,
  RAILGUN_SHIELD_LEGACY,
  RAILGUN_UNSHIELD,
] as const;

const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  "0x0000000000000000000000000000000000000000": { symbol: "ETH", decimals: 18 },
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": {
    symbol: "USDC",
    decimals: 6,
  },
  "0xdac17f958d2ee523a2206206994597c13d831ec7": {
    symbol: "USDT",
    decimals: 6,
  },
  "0x6b175474e89094c44da98b954eedeac495271d0f": {
    symbol: "DAI",
    decimals: 18,
  },
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": {
    symbol: "WBTC",
    decimals: 8,
  },
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": {
    symbol: "WETH",
    decimals: 18,
  },
};

function resolveToken(tokenAddress: Address): {
  symbol: string;
  decimals: number;
  address: Address;
} {
  const key = tokenAddress.toLowerCase();
  const known = KNOWN_TOKENS[key];
  if (known) {
    return { ...known, address: tokenAddress };
  }
  return {
    symbol: `${tokenAddress.slice(0, 6)}…`,
    decimals: 18,
    address: tokenAddress,
  };
}

type Commitment = {
  npk: Hex;
  token: {
    tokenType: number;
    tokenAddress: Address;
    tokenSubID: bigint;
  };
  value: bigint;
};

function parseShieldArgs(
  args: Record<string, unknown>,
  log: Log,
  txFrom: Address | null,
  blockTime: Date,
  chainId: number,
  chainLabel: string,
): ParsedGateEvent[] {
  const commitments = args.commitments as readonly Commitment[] | undefined;
  if (!commitments?.length || log.transactionHash == null || log.logIndex == null) {
    return [];
  }

  const fees = (args.fees as readonly bigint[] | undefined) ?? [];
  const treeNumber = args.treeNumber as bigint;
  const startPosition = args.startPosition as bigint;

  return commitments.map((commitment, idx) => {
    const token = resolveToken(commitment.token.tokenAddress);
    const amountFormatted = Number(
      formatUnits(commitment.value, token.decimals),
    );
    return {
      protocol: "railgun" as const,
      direction: "in" as const,
      chainId,
      chainLabel,
      assetSymbol: token.symbol,
      assetAddress: token.address,
      amountRaw: commitment.value.toString(),
      amountFormatted,
      fromAddress: txFrom,
      toAddress: null,
      counterparty: txFrom,
      txHash: log.transactionHash as string,
      logIndex: (log.logIndex as number) * 1000 + idx,
      blockNumber: log.blockNumber ?? null,
      blockTime,
      poolLabel: "Railgun Smart Wallet",
      relayer: null,
      feeRaw: fees[idx]?.toString() ?? null,
      meta: {
        treeNumber: treeNumber.toString(),
        startPosition: startPosition.toString(),
        commitmentIndex: idx,
      },
    };
  });
}

export function parseRailgunLog(
  log: Log,
  txFrom: Address | null,
  blockTime: Date,
  chainId: number,
  chainLabel: string,
): ParsedGateEvent[] {
  if (log.transactionHash == null || log.logIndex == null) return [];

  for (const abiItem of RAILGUN_EVENTS) {
    try {
      const decoded = decodeEventLog({
        abi: [abiItem],
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });

      if (decoded.eventName === "Unshield") {
        const args = decoded.args as unknown as {
          to: Address;
          token: {
            tokenType: number;
            tokenAddress: Address;
            tokenSubID: bigint;
          };
          amount: bigint;
          fee: bigint;
        };
        const token = resolveToken(args.token.tokenAddress);
        const amountFormatted = Number(
          formatUnits(args.amount, token.decimals),
        );
        return [
          {
            protocol: "railgun",
            direction: "out",
            chainId,
            chainLabel,
            assetSymbol: token.symbol,
            assetAddress: token.address,
            amountRaw: args.amount.toString(),
            amountFormatted,
            fromAddress: null,
            toAddress: args.to,
            counterparty: args.to,
            txHash: log.transactionHash,
            logIndex: log.logIndex,
            blockNumber: log.blockNumber ?? null,
            blockTime,
            poolLabel: "Railgun Smart Wallet",
            relayer: null,
            feeRaw: args.fee.toString(),
          },
        ];
      }

      if (decoded.eventName === "Shield") {
        return parseShieldArgs(
          decoded.args as unknown as Record<string, unknown>,
          log,
          txFrom,
          blockTime,
          chainId,
          chainLabel,
        );
      }
    } catch {
      // try next ABI variant
    }
  }

  return [];
}
