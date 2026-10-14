/**
 * Single-box production boot (Web + Indexer + SQLite).
 * For Railway / Render / Fly / any Node host that runs one start command.
 */
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

function log(msg: string) {
  console.log(`[start-prod] ${msg}`);
}

if (!process.env.DATABASE_URL) {
  const dataDir = path.join(process.cwd(), "data");
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  // Absolute file: URL so Prisma resolves outside prisma/
  process.env.DATABASE_URL = `file:${path.join(dataDir, "prod.db")}`;
  log(`DATABASE_URL → ${process.env.DATABASE_URL}`);
}

log("prisma db push");
execSync("npx prisma db push --skip-generate", {
  stdio: "inherit",
  env: process.env,
});

const kids: ChildProcess[] = [];

function start(label: string, command: string, args: string[]) {
  log(`${label}: ${command} ${args.join(" ")}`);
  const child = spawn(command, args, {
    stdio: "inherit",
    env: process.env,
  });
  kids.push(child);
  child.on("exit", (code, signal) => {
    console.error(`[start-prod] ${label} exited code=${code} signal=${signal}`);
    // If the web server dies, tear everything down.
    if (label === "web") shutdown(code ?? 1);
  });
  return child;
}

function shutdown(code = 0) {
  for (const kid of kids) {
    try {
      kid.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

start("indexer", "npx", ["tsx", "scripts/indexer.ts"]);
start("web", "npx", [
  "next",
  "start",
  "-H",
  "0.0.0.0",
  "-p",
  process.env.PORT || "3000",
]);
