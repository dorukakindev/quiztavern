/**
 * Aşama 2 DoD testi — mock auth kapalıyken (üretim duruşu) sahte kimliklerin
 * fail-closed reddedildiğini doğrular. Sunucu ALLOW_MOCK_AUTH kapalı ve
 * geçersiz Discord kimlikleriyle başlar: hiçbir bağlantı odaya ulaşmamalıdır.
 * Çalıştırma: npx tsx scripts/security-test.ts
 */
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { io } from "socket.io-client";
import { findFreePort } from "./test-port";

let baseUrl = "";
const TEST_SECRET = "dod-test-session-secret";

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

/** auth.ts ile aynı imza şeması — testte geçerli/bayat oturum üretmek için. */
function signSession(user: { id: string; name: string; avatarUrl: null }, exp: number, secret = TEST_SECRET) {
  const data = Buffer.from(JSON.stringify({ user, exp })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

/** Bağlantıyı dener; sunucunun verdiği kararı (kabul/ret + hata mesajı) döndürür. */
function attempt(auth: Record<string, unknown>): Promise<{ ok: boolean; error?: string; code?: string }> {
  return new Promise((resolve) => {
    const socket = io(baseUrl, { path: "/socket.io", transports: ["websocket"], auth, reconnection: false });
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
  console.log("[sec] sunucu üretim duruşuyla başlatılıyor (mock kapalı, geçersiz Discord kimlikleri)…");
  // Üretim boot'u zorunlu config ister (config.ts fail-closed) — hepsine
  // geçersiz ama tanımlı değerler verilir. Geçersiz bot token instance
  // doğrulamasını yine fail-closed düşürür; DISCORD_CLIENT_ID/SECRET ve
  // https PUBLIC_BASE_URL yalnız boot denetimini geçmek içindir.
  // Açıkça atanır (silmek yetmez): server/.env dosyasındaki yerel geliştirme
  // değerleri, ortamda tanımlı olmayan değişkenlerin yerine geçebilir.
  const env = {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    SESSION_SECRET: TEST_SECRET,
    ALLOW_MOCK_AUTH: "0",
    DISCORD_BOT_TOKEN: "gecersiz-test-tokeni",
    DISCORD_CLIENT_ID: "test-client-id",
    DISCORD_CLIENT_SECRET: "test-client-secret",
    PUBLIC_BASE_URL: "https://quiztavern.test",
  };
  const serverRoot = fileURLToPath(new URL("..", import.meta.url));
  const tsxCli = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
  const server = spawn(process.execPath, [tsxCli, "src/index.ts"], {
    cwd: serverRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const killServer = () => {
    if (server.exitCode === null) server.kill();
  };

  // Sunucu hiç açılmazsa gerçek sebep stdout/stderr'dadır — son satırları
  // hataya ekle (CI'da aksi halde "açılmadı" tek ipucu kalır).
  let serverLog = "";
  server.stdout.on("data", (chunk) => {
    serverLog = (serverLog + chunk).slice(-4000);
  });
  server.stderr.on("data", (chunk) => {
    serverLog = (serverLog + chunk).slice(-4000);
  });

  try {
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(`${baseUrl}/health`)).ok) break;
      } catch {
        /* bekle */
      }
      if (server.exitCode !== null) {
        throw new Error(`Sunucu açılmadan çıktı (kod=${server.exitCode}):\n${serverLog.trim() || "(çıktı yok)"}`);
      }
      await sleep(250);
      if (i === 79) throw new Error(`Sunucu 20 sn içinde açılmadı.\n${serverLog.trim()}`);
    }
    const healthResponse = await fetch(`${baseUrl}/health`);
    const health = (await healthResponse.json()) as { ok: boolean; devMode?: boolean };
    assert(health.ok === true && health.devMode === undefined, "health yalnızca genel başarı bilgisini döndürüyor");
    assert(
      healthResponse.headers.get("x-content-type-options") === "nosniff",
      "API nosniff güvenlik başlığı gönderiyor",
    );
    assert(healthResponse.headers.get("referrer-policy") === "no-referrer", "API referrer bilgisini sızdırmıyor");
    assert(healthResponse.headers.get("x-powered-by") === null, "Express sürüm başlığı gizli");
    const authStatuses: number[] = [];
    for (let i = 0; i < 31; i += 1) {
      authStatuses.push((await fetch(`${baseUrl}/auth/discord`, { redirect: "manual" })).status);
    }
    assert(
      authStatuses.slice(0, 30).every((status) => status !== 429),
      "auth limiti ilk 30 isteği handler'a geçiriyor",
    );
    assert(authStatuses[30] === 429, "auth limiti 31. isteği 429 ile reddediyor");
    console.log("");

    console.log("Reddedilmesi gerekenler (fail-closed):");
    const user = { id: "999888777", name: "Sahte", avatarUrl: null } as const;

    const mock = await attempt({ roomId: "x", devId: "player-fake-0001", devName: "Sahte" });
    assert(!mock.ok && (mock.error ?? "").includes("oturumu gerekli"), `mock kimlik reddedildi (${mock.error})`);

    const forged = await attempt({ sessionToken: "c2FodGU.c2FodGVpbXph", instanceId: "inst-1" });
    assert(
      !forged.ok && (forged.error ?? "").includes("oturumu gerekli"),
      `sahte imzalı token reddedildi (${forged.error})`,
    );

    const wrongSecret = await attempt({
      sessionToken: signSession(user, Date.now() + 3600_000, "baska-secret"),
      instanceId: "inst-1",
    });
    assert(
      !wrongSecret.ok && (wrongSecret.error ?? "").includes("oturumu gerekli"),
      `yanlış secret ile imzalı token reddedildi (${wrongSecret.error})`,
    );

    const expired = await attempt({ sessionToken: signSession(user, Date.now() - 1000), instanceId: "inst-1" });
    assert(
      !expired.ok && (expired.error ?? "").includes("oturumu gerekli"),
      `süresi geçmiş token reddedildi (${expired.error})`,
    );
    assert(expired.code === "AUTH_REQUIRED", "süresi geçmiş token makine-okunur AUTH_REQUIRED kodu döndürdü");

    const noInstance = await attempt({ sessionToken: signSession(user, Date.now() + 3600_000) });
    assert(
      !noInstance.ok && (noInstance.error ?? "").includes("instance"),
      `geçerli oturum ama instanceId'siz bağlantı reddedildi (${noInstance.error})`,
    );

    const invalidInstance = await attempt({
      sessionToken: signSession({ ...user, id: "user-invalid-instance" }, Date.now() + 3600_000),
      instanceId: "invalid/instance",
    });
    assert(
      !invalidInstance.ok && invalidInstance.code === "INSTANCE_REQUIRED",
      "geçersiz instanceId biçimi Discord çağrısından önce reddedildi",
    );

    const badBotToken = await attempt({ sessionToken: signSession(user, Date.now() + 3600_000), instanceId: "inst-1" });
    assert(
      !badBotToken.ok && (badBotToken.error ?? "").includes("doğrulanamadı"),
      `geçersiz bot token ile instance doğrulaması fail-closed reddetti (${badBotToken.error})`,
    );

    const roomHijack = await attempt({
      sessionToken: signSession(user, Date.now() + 3600_000),
      instanceId: "inst-1",
      roomId: "baskasinin-odasi",
    });
    assert(!roomHijack.ok, `roomId beyanı instance doğrulamasını aşamadı (${roomHijack.error})`);

    const rateUser = { id: "rate-user", name: "Rate", avatarUrl: null } as const;
    const rateToken = signSession(rateUser, Date.now() + 3600_000);
    const rateAttempts = [];
    for (let i = 0; i < 13; i += 1) rateAttempts.push(await attempt({ sessionToken: rateToken }));
    assert(
      rateAttempts.slice(0, 12).every((result) => result.code === "INSTANCE_REQUIRED"),
      "kullanıcının ilk 12 handshake denemesi normal doğrulamaya ulaştı",
    );
    assert(
      rateAttempts[12].code === "RATE_LIMITED",
      "aynı kullanıcının 13. handshake denemesi Discord çağrısından önce sınırlandı",
    );
  } finally {
    killServer();
  }

  console.log(`\n[sec] sonuç: ${passed} geçti, ${failed} kaldı`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n[sec] HATA: ${err.message}`);
  process.exit(1);
});
