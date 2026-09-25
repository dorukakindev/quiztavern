/**
 * Origin geçidi regresyon testi — gerçek Discord'da gözlemlenen hata:
 * iframe içi socket.io GET handshake'ine tarayıcı Origin başlığı koymaz
 * (same-origin istek) ve üretim kontrolü `origin === undefined`'ı reddedip
 * istemciyi sonsuz iskelette bırakıyordu. Bu test üretim modunda
 * (NODE_ENV=production) dört geçidi doğrular:
 *   - Origin'siz bağlantı origin geçidini AŞAR (sonraki katmanlara gider)
 *   - *.discordsays.com origin geçer
 *   - Yabancı origin hâlâ ORIGIN_DENIED alır
 *   - Origin'sizlik kimlik doğrulamayı atlamaz (AUTH_REQUIRED/INSTANCE_*)
 * Çalıştırma: npx tsx scripts/origin-gate-test.ts
 */
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { io } from "socket.io-client";
import { findFreePort } from "./test-port";

let baseUrl = "";
const TEST_SECRET = "origin-gate-session-secret";

let passed = 0;
let failed = 0;
function assert(cond: boolean, label: string) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function signSession(user: { id: string; name: string; avatarUrl: null }, exp: number) {
  const data = Buffer.from(JSON.stringify({ user, exp })).toString("base64url");
  const sig = crypto.createHmac("sha256", TEST_SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

/** Bağlantı dener; Origin istenirse extraHeaders ile handshake'e eklenir. */
function attempt(
  auth: Record<string, unknown>,
  origin?: string,
): Promise<{ ok: boolean; code?: string; error?: string }> {
  return new Promise((resolve) => {
    const socket = io(baseUrl, {
      path: "/socket.io",
      transports: ["polling"],
      auth,
      reconnection: false,
      extraHeaders: origin ? { Origin: origin } : undefined,
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      resolve({ ok: false, error: "zaman aşımı" });
    }, 5000);
    socket.on("connect", () => {
      clearTimeout(timer);
      socket.disconnect();
      resolve({ ok: true });
    });
    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      socket.disconnect();
      resolve({ ok: false, error: err.message, code: (err as Error & { data?: { code?: string } }).data?.code });
    });
  });
}

async function main() {
  const port = await findFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  console.log("[origin] sunucu üretim duruşuyla başlatılıyor (NODE_ENV=production)…");
  const env = {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    NODE_ENV: "production",
    SESSION_SECRET: TEST_SECRET,
    ALLOW_MOCK_AUTH: "0",
    DISCORD_CLIENT_ID: "1551970908233531442",
    DISCORD_CLIENT_SECRET: "test-client-secret",
    DISCORD_BOT_TOKEN: "test-bot-token",
    PUBLIC_BASE_URL: "https://qt-test.example",
    ALLOWED_ORIGINS: "",
  };
  const serverRoot = fileURLToPath(new URL("..", import.meta.url));
  const tsxCli = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
  const server = spawn(process.execPath, [tsxCli, "src/index.ts"], {
    cwd: serverRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout.on("data", (chunk) => {
    serverLog += chunk;
  });
  server.stderr.on("data", (chunk) => {
    serverLog += chunk;
  });
  const killServer = () => {
    if (server.exitCode === null) server.kill();
  };

  try {
    for (let i = 0; i < 160; i++) {
      try {
        if ((await fetch(`${baseUrl}/health`)).ok) break;
      } catch {
        /* bekle */
      }
      await sleep(250);
      if (i === 159) throw new Error("Sunucu 40 sn içinde açılmadı.");
    }

    // Kullanıcı limiteri 12/dk: her senaryo ayrı kullanıcı kimliği kullanır.
    let seq = 0;
    const nextUser = () => ({ id: `gate-user-${++seq}`, name: "Gate", avatarUrl: null });

    console.log("\nOrigin geçidi:");
    // Origin yok + geçerli oturum + geçerli-BİÇİMLİ instance: origin geçidini
    // aşıp INSTANCE_DENIED'a varmalı (bot token sahte → fail-closed ret).
    const noOrigin = await attempt({
      sessionToken: signSession(nextUser(), Date.now() + 3600_000),
      instanceId: "inst-a1",
    });
    assert(
      !noOrigin.ok && noOrigin.code === "INSTANCE_DENIED",
      `Origin'siz geçerli istek origin geçidini aştı (kod=${noOrigin.code})`,
    );

    // İzinli discordsays origin → aynı kapıya ulaşmalı.
    const goodOrigin = await attempt(
      { sessionToken: signSession(nextUser(), Date.now() + 3600_000), instanceId: "inst-a2" },
      "https://1551970908233531442.discordsays.com",
    );
    assert(
      !goodOrigin.ok && goodOrigin.code === "INSTANCE_DENIED",
      `*.discordsays.com origin geçti (kod=${goodOrigin.code})`,
    );

    // Yabancı origin → ORIGIN_DENIED.
    const evil = await attempt(
      { sessionToken: signSession(nextUser(), Date.now() + 3600_000), instanceId: "inst-a3" },
      "https://evil.example",
    );
    assert(!evil.ok && evil.code === "ORIGIN_DENIED", `yabancı origin ORIGIN_DENIED aldı (kod=${evil.code})`);
    // pino stdout'u pipe üzerinden ana sürece asenkron düşer — chunk henüz
    // gelmeden assert koşmak CI'da flake üretir; kısa süre poll'la bekle.
    for (let i = 0; i < 40 && !serverLog.includes("ORIGIN_DENIED"); i++) await sleep(50);
    assert(serverLog.includes("ORIGIN_DENIED"), "sunucu loguna reddetme kodu yazıldı");

    console.log("\nKimlik katmanları Origin'sizken de korunuyor:");
    // Origin yok + token yok → AUTH_REQUIRED (origin düzeltmesi auth'u atlamaz).
    const noAuth = await attempt({});
    assert(
      !noAuth.ok && noAuth.code === "AUTH_REQUIRED",
      `Origin'siz + token'sız → AUTH_REQUIRED (kod=${noAuth.code})`,
    );

    // Origin yok + geçerli token + bozuk instance biçimi → INSTANCE_REQUIRED.
    const badShape = await attempt({
      sessionToken: signSession(nextUser(), Date.now() + 3600_000),
      instanceId: "invalid/instance",
    });
    assert(
      !badShape.ok && badShape.code === "INSTANCE_REQUIRED",
      `bozuk instance biçimi → INSTANCE_REQUIRED (kod=${badShape.code})`,
    );

    // Origin yok + geçerli token + doğrulanamayan instance → INSTANCE_DENIED.
    const denied = await attempt({
      sessionToken: signSession(nextUser(), Date.now() + 3600_000),
      instanceId: "inst-a4",
    });
    assert(
      !denied.ok && denied.code === "INSTANCE_DENIED",
      `doğrulanamayan instance → INSTANCE_DENIED (kod=${denied.code})`,
    );
  } finally {
    killServer();
  }

  console.log(`\n[origin] sonuç: ${passed} geçti, ${failed} kaldı`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n[origin] HATA: ${err.message}`);
  process.exit(1);
});
