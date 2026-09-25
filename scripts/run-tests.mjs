/**
 * Test koşucusu (§7.14): eski tek `&&` zinciri ilk hatada durup kalan
 * paketleri hiç koşturmuyordu. Burada her paket sırayla koşar, sonunda
 * özet tablo basılır; bir tane bile başarısız varsa exit 1.
 *
 * Liste tek kaynak: yeni test paketi eklerken TESTS'e satır ekle.
 * Kök script'ler workspace bayrağı almaz ({ root: true }).
 * Kullanım: npm test  (veya node scripts/run-tests.mjs)
 */
import { spawn } from "node:child_process";

const TIMEOUT_MS = 240_000;

const TESTS = [
  { name: "test:activity", ws: "client" },
  { name: "test:i18n", ws: "client" },
  { name: "test:sdk", ws: "client" },
  { name: "test:hardening", ws: "server" },
  { name: "test:sec", ws: "server" },
  { name: "test:circle-lightning-edge", ws: "server" },
  { name: "test:circle-alias", ws: "server" },
  { name: "test:bet-team-edge", ws: "server" },
  { name: "test:dod", ws: "server" },
  { name: "test:origin-gate", ws: "server" },
  { name: "test:guest", ws: "server" },
  { name: "test:reliability", ws: "server" },
  { name: "test:reports", ws: "server" },
  { name: "test:daily", ws: "server" },
  { name: "test:anticheat", ws: "server" },
  { name: "test:validate-questions", root: true },
  { name: "test:packs", ws: "server" },
  { name: "test:xp", ws: "server" },
  { name: "test:podium-lobby", ws: "server" },
  { name: "test:admin-reports", ws: "server" },
  { name: "test:elim", ws: "server" },
  { name: "test:blur", ws: "server" },
  { name: "test:word", ws: "server" },
  { name: "test:cards", ws: "server" },
  { name: "test:rematch", ws: "server" },
  { name: "test:predict", ws: "server" },
  { name: "test:mastery", ws: "server" },
  { name: "test:theme", ws: "server" },
  { name: "test:moments", ws: "server" },
  { name: "test:calib", ws: "server" },
  { name: "test:settings", ws: "server" },
  { name: "test:weekly", ws: "server" },
  { name: "test:teamvote", ws: "server" },
  { name: "test:writer", ws: "server" },
  { name: "test:duel", ws: "server" },
  { name: "test:zil", ws: "server" },
  { name: "test:numeric", ws: "server" },
  { name: "test:blitz", ws: "server" },
  { name: "test:timeline", root: true },
  { name: "test:board", ws: "server" },
  { name: "test:catbalance", ws: "server" },
  { name: "test:diffbonus", ws: "server" },
  { name: "test:botskill", ws: "server" },
  { name: "test:botcards", ws: "server" },
];

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const results = [];

for (const t of TESTS) {
  const args = ["run", t.name];
  if (!t.root) args.push("-w", t.ws);
  const started = Date.now();
  const status = await new Promise((resolve) => {
    const child = spawn(npmCmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, FORCE_COLOR: "0" },
    });
    let tail = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ code: 124, timedOut: true });
    }, TIMEOUT_MS);
    child.stdout.on("data", (d) => {
      tail = (tail + d).slice(-4000);
      process.stdout.write(d);
    });
    child.stderr.on("data", (d) => {
      tail = (tail + d).slice(-4000);
      process.stderr.write(d);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code: code ?? (signal ? 128 : 1), timedOut: false, tail });
    });
  });
  results.push({
    name: t.name,
    ws: t.root ? "root" : t.ws,
    ...status,
    secs: ((Date.now() - started) / 1000).toFixed(1),
  });
}

const passed = results.filter((r) => r.code === 0);
const failed = results.filter((r) => r.code !== 0);
console.log("\n════ test özeti ════");
for (const r of results) {
  console.log(
    `  ${r.code === 0 ? "✓" : "✗"} ${r.name.padEnd(30)} ${(r.ws ?? "").padEnd(7)} ${r.secs}s${r.timedOut ? " (zaman aşımı)" : ""}`,
  );
}
console.log(`════ ${passed.length} geçti, ${failed.length} kaldı ════`);
if (failed.length) {
  for (const r of failed) {
    console.log(`\n── ${r.name} son çıktı ──\n${(r.tail ?? "").trim()}\n`);
  }
  process.exit(1);
}
