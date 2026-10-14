import { runIndexerLoop, runIndexerTick } from "../src/lib/indexer/runner";

async function main() {
  const once = process.argv.includes("--once");
  if (once) {
    const result = await runIndexerTick();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.errors.length ? 1 : 0);
  }

  const ac = new AbortController();
  const stop = () => ac.abort();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  await runIndexerLoop(ac.signal);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
