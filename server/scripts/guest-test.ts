/**
 * Web misafiri (guest) regresyon testi — üretim duruşunda (NODE_ENV=production,
 * ALLOW_MOCK_AUTH=0) Discord'suz tarayıcı oyuncusunun sözleşmesi:
 *   - guestName + guestId ile bağlantı kabul edilir, kimlik `guest:` önekli
 *   - Oda her koşulda `web-` öneki alır (Discord instance odasına girilmez)
 *   - guestName'siz / auth'suz bağlantı AUTH_REQUIRED alır
 *   - Misafir QUESTION_REPORT gönderemez (report.failed toast)
 *   - ALLOW_GUEST_AUTH=0 ile misafir kapısı kapanır
 * Çalıştırma: npx tsx scripts/guest-test.ts
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { io, type Socket } from "socket.io-client";
import { findFreePort } from "./test-port";

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

interface ConnectResult {
  ok: boolean;
  code?: string;
  state?: { roomId?: string; youId?: string };
  socket?: Socket;
}

/** Bağlanır; kabulde ilk state'i, reddette hata kodunu döndürür. */
function connect(baseUrl: string, auth: Record<string, unknown>): Promise<ConnectResult> {
  return new Promise((resolve) => {
    const socket = io(baseUrl, {
      path: "/socket.io",
      transports: ["polling"],
      auth,
      reconnection: false,
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      resolve({ ok: false, code: "TIMEOUT" });
    }, 5000);
    socket.on("state", (state: { roomId?: string; youId?: string }) => {
      clearTimeout(timer);
      resolve({ ok: true, state, socket });
    });
    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      socket.disconnect();
      resolve({
        ok: false,
        code: (err as Error & { data?: { code?: string } }).data?.code ?? "UNKNOWN",
      });
    });
  });
}

function toastOnce(socket: Socket, emit: () => void): Promise<{ key?: string }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({}), 3000);
    socket.once("toast", (payload: { key?: string }) => {
      clearTimeout(timer);
      resolve(payload);
    });
    emit();
  });
}

const serverRoot = fileURLToPath(new URL("..", import.meta.url));
const tsxCli = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));

async function startServer(port: number, extraEnv: Record<string, string>) {
  const server = spawn(process.execPath, [tsxCli, "src/index.ts"], {
    cwd: serverRoot,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      NODE_ENV: "production",
      SESSION_SECRET: "guest-test-secret",
      ALLOW_MOCK_AUTH: "0",
      DISCORD_CLIENT_ID: "1551970908233531442",
      DISCORD_CLIENT_SECRET: "test-client-secret",
      DISCORD_BOT_TOKEN: "test-bot-token",
      PUBLIC_BASE_URL: "https://qt-test.example",
      ALLOWED_ORIGINS: "",
      XP_DB_PATH: fileURLToPath(new URL("../data/guest-test-xp.db", import.meta.url)),
      DAILY_DB_PATH: fileURLToPath(new URL("../data/guest-test-daily.db", import.meta.url)),
      REPORTS_DB_PATH: fileURLToPath(new URL("../data/guest-test-reports.db", import.meta.url)),
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 160; i++) {
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) return { server, baseUrl };
    } catch {
      /* bekle */
    }
    await sleep(250);
    if (server.exitCode !== null) throw new Error(`Sunucu ${server.exitCode} ile çıktı.`);
  }
  server.kill();
  throw new Error("Sunucu 40 sn içinde açılmadı.");
}

async function main() {
  const port = await findFreePort();
  const { server, baseUrl } = await startServer(port, {});
  const killServer = () => {
    if (server.exitCode === null) server.kill();
  };

  try {
    console.log("\nMisafir kapısı (ALLOW_GUEST_AUTH varsayılan açık):");

    const guest = await connect(baseUrl, {
      guestName: "Gezgin",
      guestId: "webguest-abc123",
      roomId: "kanka-masasi",
    });
    assert(
      guest.ok && guest.state?.roomId === "web-kanka-masasi",
      `misafir web- önekli odaya girdi (oda=${guest.state?.roomId})`,
    );
    assert(!!guest.state?.youId?.startsWith("guest:"), `misafir kimliği guest: önekli (id=${guest.state?.youId})`);

    // Discord instance'ı gibi görünen oda adı beyanı da `web-` öneki alır.
    const hijack = await connect(baseUrl, {
      guestName: "Sinsi",
      guestId: "webguest-def456",
      roomId: "140808112233445566",
    });
    assert(
      hijack.ok && hijack.state?.roomId?.startsWith("web-"),
      `Discord-benzeri roomId da web- öneklendi (oda=${hijack.state?.roomId})`,
    );
    hijack.socket?.disconnect();

    // roomId beyan edilmezse ana lobiye düşer (web- önekiyle).
    const lobby = await connect(baseUrl, { guestName: "Tek", guestId: "webguest-ghi789" });
    assert(
      lobby.ok && lobby.state?.roomId === "web-ana-lobi",
      `roomId'siz misafir web-ana-lobi'de (oda=${lobby.state?.roomId})`,
    );
    lobby.socket?.disconnect();

    const noName = await connect(baseUrl, { guestName: "   ", guestId: "webguest-jkl012" });
    assert(!noName.ok && noName.code === "AUTH_REQUIRED", `boş isim reddedildi (kod=${noName.code})`);

    const noAuth = await connect(baseUrl, { roomId: "rastgele" });
    assert(!noAuth.ok && noAuth.code === "AUTH_REQUIRED", `auth'suz reddedildi (kod=${noAuth.code})`);

    // Misafir soru bildiremez: eşik aşımı suistimali kapalı.
    if (guest.socket) {
      const report = await toastOnce(guest.socket, () => guest.socket!.emit("question-report", {}));
      assert(report.key === "report.failed", `misafirin soru bildirimi reddedildi (key=${report.key})`);
      guest.socket.disconnect();
    } else {
      assert(false, "misafir socket'i rapor testi için yok");
    }

    // Kapalı kapı: ALLOW_GUEST_AUTH=0 ile yeniden başlat.
    console.log("\nALLOW_GUEST_AUTH=0:");
    const port2 = await findFreePort();
    const second = await startServer(port2, { ALLOW_GUEST_AUTH: "0" });
    try {
      const blocked = await connect(second.baseUrl, {
        guestName: "Gezgin",
        guestId: "webguest-mno345",
        roomId: "deneme",
      });
      assert(
        !blocked.ok && blocked.code === "AUTH_REQUIRED",
        `kapı kapalıyken misafir reddedildi (kod=${blocked.code})`,
      );
    } finally {
      if (second.server.exitCode === null) second.server.kill();
    }
  } finally {
    killServer();
    await sleep(300);
  }

  console.log(`\n${passed} geçti, ${failed} kaldı.`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
