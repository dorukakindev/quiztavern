/**
 * Yönetici rapor paneli testi — GET /admin/reports.
 *  1) QT_ADMIN_TOKEN ayarsız → 503
 *  2) Yanlış/eksik Bearer → 401
 *  3) Doğru Bearer → JSON liste
 *  4) Doğru Bearer + Accept: text/html → HTML tablo, notlar kaçışlı
 *  5) /api/admin/reports takma adı da çalışır (Discord proxy)
 * Çalıştırma: npx tsx scripts/admin-reports-test.ts
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findFreePort } from "./test-port";

let passed = 0;
let failed = 0;
function assert(cond: boolean, label: string) {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed += 1; console.error(`  ✗ ${label}`); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function startServer(env: Record<string, string>) {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const tsxCli = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
  const server = spawn(process.execPath, [tsxCli, "src/index.ts"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return { server, baseUrl };
    } catch { /* henüz hazır değil */ }
    await sleep(250);
    if (i === 39) throw new Error("Sunucu 10 sn içinde açılmadı.");
  }
  throw new Error("unreachable");
}

const tmp = mkdtempSync(join(tmpdir(), "qt-admin-"));
const dbPath = join(tmp, "reports.db");

// 1) Token ayarsız → 503
{
  const { server, baseUrl } = await startServer({ REPORTS_DB_PATH: dbPath, QT_ADMIN_TOKEN: "" });
  try {
    const res = await fetch(`${baseUrl}/admin/reports`);
    assert(res.status === 503, "token ayarsız → 503");
  } finally {
    server.kill();
  }
}

// 2-5) Token ayarlı akış
{
  const { server, baseUrl } = await startServer({ REPORTS_DB_PATH: dbPath, QT_ADMIN_TOKEN: "gizli-token-123" });
  try {
    // Panel verisi için depoya bir satır ekleyelim (HTML kaçışını da sınar).
    const { createReportsStore } = await import("../src/reports");
    const store = createReportsStore(dbPath);
    store.report({
      roomId: "ana-lobi", userId: "u1", userName: "<b>Devin</b>",
      questionId: "tarih-001", questionText: "İstanbul <fetih> sorusu?",
      category: "Tarih", note: "şıklar <img> karışık",
    });
    store.close();

    const noAuth = await fetch(`${baseUrl}/admin/reports`);
    assert(noAuth.status === 401, "Bearer yok → 401");

    const wrongAuth = await fetch(`${baseUrl}/admin/reports`, { headers: { authorization: "Bearer yanlis" } });
    assert(wrongAuth.status === 401, "yanlış Bearer → 401");

    const jsonRes = await fetch(`${baseUrl}/admin/reports`, {
      headers: { authorization: "Bearer gizli-token-123", accept: "application/json" },
    });
    assert(jsonRes.status === 200, "doğru Bearer → 200 (JSON)");
    const body = await jsonRes.json() as { reports: Array<{ questionId: string; note: string }> };
    assert(Array.isArray(body.reports) && body.reports.length === 1, "JSON: 1 rapor döndü");
    assert(body.reports[0].questionId === "tarih-001", "JSON: rapor içeriği doğru");

    const htmlRes = await fetch(`${baseUrl}/api/admin/reports`, {
      headers: { authorization: "Bearer gizli-token-123", accept: "text/html" },
    });
    const html = await htmlRes.text();
    assert(htmlRes.status === 200 && html.includes("<table"), "/api takma adı → HTML tablo");
    assert(html.includes("&#60;img&#62;") || !html.includes("<img>"), "HTML: not içindeki HTML kaçışlı (XSS yok)");
    assert(html.includes("Soru bildirimleri"), "HTML: başlık var");
  } finally {
    server.kill();
  }
}

rmSync(tmp, { recursive: true, force: true });
console.log(`\n[admin-reports] sonuç: ${passed} geçti, ${failed} kaldı`);
process.exit(failed ? 1 : 0);
