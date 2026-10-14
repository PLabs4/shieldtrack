import { getPoolTvls } from "../src/lib/indexer/pool-tvl";

async function main() {
  console.log(JSON.stringify(await getPoolTvls(), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
