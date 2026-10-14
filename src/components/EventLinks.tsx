"use client";

import type { GateEventDTO } from "@/lib/types";
import {
  counterpartyRole,
  explorerAddressUrl,
  explorerTxUrl,
  shortenAddress,
} from "@/lib/format";
import { normalizeAddress } from "@/lib/investigate";

type Props = {
  event: GateEventDTO;
  onFilterAddress?: (address: string) => void;
};

export function EventLinks({ event, onFilterAddress }: Props) {
  const role = counterpartyRole(event);
  const addrUrl = explorerAddressUrl(event.chainId, event.counterparty);
  const txUrl = explorerTxUrl(event.chainId, event.txHash);
  const address = normalizeAddress(event.counterparty);

  return (
    <div className="mt-1.5 space-y-1 text-[11px]">
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className="shrink-0 rounded bg-[#f4efe4] px-1.5 py-0.5 font-semibold text-gold-deep">
          {role.label}
        </span>
        {role.kind === "shielded" ? (
          <span className="text-muted">private side (not public)</span>
        ) : addrUrl ? (
          <a
            className="min-w-0 truncate font-mono font-medium text-ink underline decoration-line underline-offset-2 hover:text-gold-deep"
            href={addrUrl}
            target="_blank"
            rel="noreferrer"
            title={event.counterparty ?? undefined}
            onClick={(e) => e.stopPropagation()}
          >
            {shortenAddress(event.counterparty, 4)}
          </a>
        ) : (
          <span
            className="font-mono text-muted"
            title={event.counterparty ?? undefined}
          >
            {shortenAddress(event.counterparty, 4)}
          </span>
        )}
        {address && onFilterAddress ? (
          <button
            type="button"
            className="rounded border border-line bg-bg-2 px-1.5 py-0.5 text-[10px] font-medium text-ink hover:border-gold"
            onClick={(e) => {
              e.stopPropagation();
              onFilterAddress(address);
            }}
          >
            Filter addr
          </button>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className="shrink-0 rounded bg-[#eef1f6] px-1.5 py-0.5 font-semibold text-[#3b4d6b]">
          Tx hash
        </span>
        {txUrl ? (
          <a
            className="min-w-0 truncate font-mono font-medium text-ink underline decoration-line underline-offset-2 hover:text-gold-deep"
            href={txUrl}
            target="_blank"
            rel="noreferrer"
            title={event.txHash}
            onClick={(e) => e.stopPropagation()}
          >
            {shortenAddress(event.txHash, 4)}
          </a>
        ) : (
          <span className="font-mono text-muted">
            {shortenAddress(event.txHash, 4)}
          </span>
        )}
      </div>
    </div>
  );
}
