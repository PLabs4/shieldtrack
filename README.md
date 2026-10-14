# ShieldTrack

Real-time public-side monitoring for privacy pool gates:

- **Tornado Cash** — deposit / withdraw (Ethereum pools)
- **Railgun** — shield / unshield (`RailgunSmartWallet`)
- **Zcash** — transparent ↔ shielded boundary flows

This is not a TVL dashboard. It watches **addresses, amounts, and times** at the public edge of each privacy system, with LARGE / ULTRA alerts.

## Stack

- Next.js App Router + TypeScript
- PostgreSQL + Prisma
- `viem` log indexer for Tornado / Railgun
- Public Zcash explorer API for shield / unshield
- SSE live stream to the black-gold dashboard

## Quick start

```bash
cp .env.example .env
# set ETH_RPC_URL to a reliable Ethereum RPC for production

npm install --ignore-scripts
npx prisma generate
npx prisma db push

# run API/UI + indexer (two terminals)
npm run dev
npm run indexer
```

Open [http://localhost:3000](http://localhost:3000).

Local default DB is **SQLite** (`file:./dev.db`). For production Postgres: start `docker compose up -d`, switch `provider` in `prisma/schema.prisma` to `postgresql`, set `DATABASE_URL`, then `npx prisma db push`.

## Configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite path or Postgres connection |
| `ETH_RPC_URL` | Ethereum RPC used by Tornado + Railgun indexers |
| `INDEXER_LOOKBACK_BLOCKS` | First-run backfill depth |
| `LARGE_USD` / `ULTRA_USD` | Alert thresholds |
| `ZCASH_API_BASE` | CipherScan API root (`https://api.mainnet.cipherscan.app/api`) |

## Product notes

- Deposit / shield addresses come from the public transaction sender or transparent inputs.
- Withdraw / unshield recipients are taken from contract events or transparent outputs.
- Zcash shielded addresses are never claimed; the opposite side is labeled `shielded`.
- Tornado deposit↔withdraw linkage is intentionally not inferred.
