import { toEventSelector } from "viem";
import { createEthClient } from "../src/lib/rpc";
import {
  RAILGUN_ETH_ADDRESS,
  RAILGUN_EVENTS,
} from "../src/lib/protocols/railgun";

async function main() {
  const client = createEthClient();
  const latest = await client.getBlockNumber();
  const from = latest - 5000n;
  const logs = await client.getLogs({
    address: RAILGUN_ETH_ADDRESS,
    fromBlock: from,
    toBlock: latest,
  });
  const counts = new Map<string, number>();
  for (const l of logs) {
    const t = l.topics[0] ?? "none";
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  console.log(
    "expected",
    RAILGUN_EVENTS.map((e) => toEventSelector(e)),
  );
  console.log(
    "observed",
    [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
  );
  console.log("total logs", logs.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
