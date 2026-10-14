import {
  type Address,
  type Hex,
  type Log,
  decodeEventLog,
  parseAbiItem,
  formatEther,
  formatUnits,
} from "viem";
import type { ParsedGateEvent } from "@/lib/types";

export const TORNADO_DEPOSIT = parseAbiItem(
  "event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)",
);
export const TORNADO_WITHDRAWAL = parseAbiItem(
  "event Withdrawal(address to, bytes32 nullifierHash, address indexed relayer, uint256 fee)",
);

export type TornadoPool = {
  address: Address;
  chainId: number;
  chainLabel: string;
  symbol: string;
  tokenAddress: Address | null;
  decimals: number;
  denomination: bigint;
  label: string;
};

/** Classic Tornado Cash pools on Ethereum mainnet. */
export const TORNADO_ETH_POOLS: TornadoPool[] = [
  {
    address: "0x12D66f87A04A9E220743712cE6d9bB1B5616B8Fc",
    chainId: 1,
    chainLabel: "Ethereum",
    symbol: "ETH",
    tokenAddress: null,
    decimals: 18,
    denomination: 100000000000000000n, // 0.1
    label: "0.1 ETH",
  },
  {
    address: "0x47CE0C6eD5B0Ce3d3A51fdb1C52DC66a7c3c2936",
    chainId: 1,
    chainLabel: "Ethereum",
    symbol: "ETH",
    tokenAddress: null,
    decimals: 18,
    denomination: 1000000000000000000n, // 1
    label: "1 ETH",
  },
  {
    address: "0x910Cbd523D772E0e29aD712376D1B9C4a1f1f8e5",
    chainId: 1,
    chainLabel: "Ethereum",
    symbol: "ETH",
    tokenAddress: null,
    decimals: 18,
    denomination: 10000000000000000000n, // 10
    label: "10 ETH",
  },
  {
    address: "0xA160cdAB225685dA1d56aa342Ad8841c3b53f291",
    chainId: 1,
    chainLabel: "Ethereum",
    symbol: "ETH",
    tokenAddress: null,
    decimals: 18,
    denomination: 100000000000000000000n, // 100
    label: "100 ETH",
  },
  {
    address: "0xD4B88Df4D29F5CedD6857912842cff3b20C8Cfa3",
    chainId: 1,
    chainLabel: "Ethereum",
    symbol: "DAI",
    tokenAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    decimals: 18,
    denomination: 100000000000000000000n, // 100
    label: "100 DAI",
  },
  {
    address: "0xFD8610d20aA15b7B2E3Be39B396a1bC3516c7144",
    chainId: 1,
    chainLabel: "Ethereum",
    symbol: "DAI",
    tokenAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    decimals: 18,
    denomination: 1000000000000000000000n, // 1000
    label: "1,000 DAI",
  },
  {
    address: "0x07687e702b410Fa43f4cB4Af7FA097918ffD2730",
    chainId: 1,
    chainLabel: "Ethereum",
    symbol: "DAI",
    tokenAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    decimals: 18,
    denomination: 10000000000000000000000n, // 10000
    label: "10,000 DAI",
  },
  {
    address: "0x23773E65ed146A459FfF57636F13fBD028e9fC31",
    chainId: 1,
    chainLabel: "Ethereum",
    symbol: "DAI",
    tokenAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    decimals: 18,
    denomination: 100000000000000000000000n, // 100000
    label: "100,000 DAI",
  },
  {
    address: "0x4736dCf1b7A3d580672CcE6E7c65cd5cc9cFBa9D",
    chainId: 1,
    chainLabel: "Ethereum",
    symbol: "USDC",
    tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    decimals: 6,
    denomination: 100000000n, // 100
    label: "100 USDC",
  },
  {
    address: "0xd96f2B1c14Db8458374d9ACa76E26c3D18364307",
    chainId: 1,
    chainLabel: "Ethereum",
    symbol: "USDC",
    tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    decimals: 6,
    denomination: 1000000000n, // 1000
    label: "1,000 USDC",
  },
  {
    address: "0x169AD27A470D064DEDE56a2D3ff727986b15D52B",
    chainId: 1,
    chainLabel: "Ethereum",
    symbol: "USDT",
    tokenAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    decimals: 6,
    denomination: 100000000n, // 100
    label: "100 USDT",
  },
  {
    address: "0x0836222F2B2B24A3F36f98668Ed8F0B38D1a872f",
    chainId: 1,
    chainLabel: "Ethereum",
    symbol: "USDT",
    tokenAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    decimals: 6,
    denomination: 1000000000n, // 1000
    label: "1,000 USDT",
  },
];

const poolByAddress = new Map(
  TORNADO_ETH_POOLS.map((p) => [p.address.toLowerCase(), p]),
);

function formatDenom(pool: TornadoPool): number {
  return Number(formatUnits(pool.denomination, pool.decimals));
}

export function parseTornadoLog(
  log: Log,
  txFrom: Address | null,
  blockTime: Date,
): ParsedGateEvent | null {
  const pool = poolByAddress.get((log.address as string).toLowerCase());
  if (!pool || log.transactionHash == null || log.logIndex == null) return null;

  try {
    const decoded = decodeEventLog({
      abi: [TORNADO_DEPOSIT, TORNADO_WITHDRAWAL],
      data: log.data,
      topics: log.topics as [Hex, ...Hex[]],
    });

    const amount = formatDenom(pool);
    const amountRaw = pool.denomination.toString();

    if (decoded.eventName === "Deposit") {
      return {
        protocol: "tornado",
        direction: "in",
        chainId: pool.chainId,
        chainLabel: pool.chainLabel,
        assetSymbol: pool.symbol,
        assetAddress: pool.tokenAddress,
        amountRaw,
        amountFormatted: amount,
        fromAddress: txFrom,
        toAddress: null,
        counterparty: txFrom,
        txHash: log.transactionHash,
        logIndex: log.logIndex,
        blockNumber: log.blockNumber ?? null,
        blockTime,
        poolLabel: pool.label,
        relayer: null,
        feeRaw: null,
        meta: {
          commitment: (decoded.args as { commitment: Hex }).commitment,
          leafIndex: Number((decoded.args as { leafIndex: number }).leafIndex),
        },
      };
    }

    if (decoded.eventName === "Withdrawal") {
      const args = decoded.args as {
        to: Address;
        nullifierHash: Hex;
        relayer: Address;
        fee: bigint;
      };
      return {
        protocol: "tornado",
        direction: "out",
        chainId: pool.chainId,
        chainLabel: pool.chainLabel,
        assetSymbol: pool.symbol,
        assetAddress: pool.tokenAddress,
        amountRaw,
        amountFormatted: amount,
        fromAddress: null,
        toAddress: args.to,
        counterparty: args.to,
        txHash: log.transactionHash,
        logIndex: log.logIndex,
        blockNumber: log.blockNumber ?? null,
        blockTime,
        poolLabel: pool.label,
        relayer: args.relayer,
        feeRaw: args.fee.toString(),
        meta: {
          nullifierHash: args.nullifierHash,
          feeEth: formatEther(args.fee),
        },
      };
    }
  } catch {
    return null;
  }

  return null;
}
