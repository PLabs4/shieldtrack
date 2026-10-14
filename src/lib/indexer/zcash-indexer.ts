import { fetchZcashGateEvents } from "@/lib/protocols/zcash";
import { persistGateEvents, setCursor } from "@/lib/indexer/store";

export async function indexZcash(): Promise<number> {
  const events = await fetchZcashGateEvents(80);
  const inserted = await persistGateEvents(events);

  // Cursor for Zcash is wall-clock based; store latest seen unix seconds.
  const latest = events.reduce((max, e) => {
    const t = Math.floor(e.blockTime.getTime() / 1000);
    return t > max ? t : max;
  }, 0);

  if (latest > 0) {
    await setCursor({
      id: "zcash:133:shielded",
      protocol: "zcash",
      chainId: 133,
      cursorKey: "shielded",
      blockNumber: BigInt(latest),
    });
  }

  return inserted;
}
