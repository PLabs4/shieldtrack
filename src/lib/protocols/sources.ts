import type { ProtocolId } from "@/lib/types";
import { RAILGUN_ETH_ADDRESS } from "@/lib/protocols/railgun";

export type ProtocolSource = {
  protocol: ProtocolId;
  /** Short label shown in the column header. */
  title: string;
  /** One-line how we observe public gate flow. */
  method: string;
  /** Primary chain / network. */
  network: string;
  /** Human-checkable endpoints (explorers / docs / APIs). */
  links: { label: string; url: string }[];
};

const RAILGUN = RAILGUN_ETH_ADDRESS;

export const PROTOCOL_SOURCES: Record<ProtocolId, ProtocolSource> = {
  tornado: {
    protocol: "tornado",
    title: "Source",
    method: "Ethereum Deposit / Withdrawal event logs (classic fixed pools)",
    network: "Ethereum mainnet · via ETH RPC",
    links: [
      {
        label: "0.1 ETH pool",
        url: "https://etherscan.io/address/0x12D66f87A04A9E220743712cE6d9bB1B5616B8Fc#events",
      },
      {
        label: "1 ETH pool",
        url: "https://etherscan.io/address/0x47CE0C6eD5B0Ce3d3A51fdb1C52DC66a7c3c2936#events",
      },
      {
        label: "10 ETH pool",
        url: "https://etherscan.io/address/0x910Cbd523D772E0e29aD712376D1B9C4a1f1f8e5#events",
      },
      {
        label: "100 ETH pool",
        url: "https://etherscan.io/address/0xA160cdAB225685dA1d56aa342Ad8841c3b53f291#events",
      },
      {
        label: "Token pools",
        url: "https://etherscan.io/accounts/label/tornado-cash",
      },
    ],
  },
  railgun: {
    protocol: "railgun",
    title: "Source",
    method: "RailgunSmartWallet Shield / Unshield event logs",
    network: "Ethereum mainnet · via ETH RPC",
    links: [
      {
        label: "Railgun contract",
        url: `https://etherscan.io/address/${RAILGUN}#events`,
      },
      {
        label: "Docs",
        url: "https://docs.railgun.org/",
      },
    ],
  },
  zcash: {
    protocol: "zcash",
    title: "Source",
    method: "CipherScan shielded/list (public shield / deshield flows)",
    network: "Zcash mainnet · CipherScan API",
    links: [
      {
        label: "CipherScan",
        url: "https://cipherscan.app/",
      },
      {
        label: "API docs",
        url: "https://cipherscan.app/docs",
      },
      {
        label: "shielded/list",
        url: "https://api.mainnet.cipherscan.app/api/shielded/list?limit=20",
      },
    ],
  },
};
