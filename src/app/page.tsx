import { Dashboard } from "@/components/Dashboard";
import { getDashboardSnapshot } from "@/lib/queries";
import type { DashboardSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

const emptySnapshot = (): DashboardSnapshot => ({
  startedAt: new Date().toISOString(),
  stats: [
    {
      protocol: "tornado",
      inCount: 0,
      outCount: 0,
      inUsd: 0,
      outUsd: 0,
      poolTvlUsd: null,
      poolTvlLabel: null,
      lastInEvent: null,
      lastOutEvent: null,
    },
    {
      protocol: "railgun",
      inCount: 0,
      outCount: 0,
      inUsd: 0,
      outUsd: 0,
      poolTvlUsd: null,
      poolTvlLabel: null,
      lastInEvent: null,
      lastOutEvent: null,
    },
    {
      protocol: "zcash",
      inCount: 0,
      outCount: 0,
      inUsd: 0,
      outUsd: 0,
      poolTvlUsd: null,
      poolTvlLabel: null,
      lastInEvent: null,
      lastOutEvent: null,
    },
  ],
  live: [],
  history: [],
  historyMinUsd: 100_000,
  prices: [],
  ultra: null,
  indexer: { healthy: false, lastTickAt: null },
});

export default async function HomePage() {
  let snapshot: DashboardSnapshot;
  try {
    snapshot = await getDashboardSnapshot();
  } catch {
    snapshot = emptySnapshot();
  }

  return <Dashboard initial={snapshot} />;
}
