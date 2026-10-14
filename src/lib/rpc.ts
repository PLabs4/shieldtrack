import { createPublicClient, fallback, http } from "viem";
import { mainnet } from "viem/chains";
import { config } from "@/lib/config";

const FALLBACK_ETH_RPCS = [
  "https://ethereum.publicnode.com",
  "https://1rpc.io/eth",
  "https://cloudflare-eth.com",
  // Avoid rpc.ankr.com — getLogs often requires a paid/auth key.
];

export function createEthClient() {
  const urls = [
    config.ethRpcUrl,
    ...FALLBACK_ETH_RPCS.filter((u) => u !== config.ethRpcUrl),
  ];

  return createPublicClient({
    chain: mainnet,
    transport: fallback(
      urls.map((url) => http(url, { timeout: 30_000, retryCount: 2 })),
      { rank: false },
    ),
  });
}
