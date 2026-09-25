/**
 * Özel masa (private room) regresyon testi — mock kimliğiyle:
 *   - privateRoom beyanı olan oyuncu `web-<kod>` odasına düşer
 *   - Beyan yoksa/geçersizse instance odasında kalır
 *   - Aynı koda giren web misafiri ile aynı odayı paylaşır (kod ad alanı ortak)
 * Çalıştırma: npx tsx scripts/private-room-test.ts
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

function connect(
  baseUrl: string,
  auth: Record<string, unknown>,
): Promise<{ roomId?: string; youId?: string; socket?: Socket }> {
  return new Promise((resolve) => {
    const socket = io(baseUrl, { path: "/socket.io", transports: ["polling"], auth, reconnection: false });
    const timer = setTimeout(() => {
      socket.disconnect();
      resolve({});
    }, 5000);
    socket.on("state", (state: { roomId?: string; youId?: string }) => {
      clearTimeout(timer);
      resolve({ ...state, socket });
    });
    socket.on("connect_error", () => {
      clearTimeout(timer);
      socket.disconnect();
      resolve({});
    });
  });
}

const serverRoot = fileURLToPath(new URL("..", import.meta.url));
const tsxCli = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));

async function main() {
  const port = await findFreePort();
  const server = spawn(process.execPath, [tsxCli, "src/index.ts"], {
    cwd: serverRoot,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      NODE_ENV: "development",
      SESSION_SECRET: "privroom-test-secret",
      ALLOW_MOCK_AUTH: "1",
      ALLOW_GUEST_AUTH: "1",
      XP_DB_PATH: fileURLToPath(new URL("../data/privroom-test-xp.db", import.meta.url)),
      DAILY_DB_PATH: fileURLToPath(new URL("../data/privroom-test-daily.db", import.meta.url)),
      REPORTS_DB_PATH: fileURLToPath(new URL("../data/privroom-test-reports.db", import.meta.url)),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 160; i++) {
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) break;
    } catch {
      /* bekle */
    }
    await sleep(250);
    if (server.exitCode !== null) throw new Error(`Sunucu ${server.exitCode} ile çıktı.`);
    if (i === 159) throw new Error("Sunucu açılmadı.");
  }

  const sockets: Socket[] = [];
  try {
    console.log("\nÖzel masa (privateRoom):");

    const dev = { devId: "player-aaaa-0001", devName: "Ahmet", instanceId: "channel-1" };
    const priv = await connect(baseUrl, { ...dev, privateRoom: "kanka-42" });
    assert(priv.socket !== undefined, "privateRoom'lu bağlantı kabul edildi");
    assert(priv.roomId === "web-kanka-42", `kod web- odasına eşlendi (oda=${priv.roomId})`);
    if (priv.socket) sockets.push(priv.socket);

    // Beyan yoksa instance odası (mock'ta handshake.auth.roomId'ye düşer).
    const plain = await connect(baseUrl, { ...dev, devId: "player-bbbb-0002", devName: "Berna", roomId: "channel-1" });
    assert(plain.roomId === "channel-1", `privateRoom'suz oyuncu instance odasında (oda=${plain.roomId})`);
    if (plain.socket) sockets.push(plain.socket);

    // Geçersiz kod (büyük harf/uzunluk temizlenir; pattern dışı karakterler reddedilir).
    const bad = await connect(baseUrl, {
      ...dev,
      devId: "player-cccc-0003",
      devName: "Can",
      roomId: "channel-1",
      privateRoom: "!!x!!",
    });
    assert(bad.roomId === "channel-1", `geçersiz kod instance'a düşer (oda=${bad.roomId})`);
    if (bad.socket) sockets.push(bad.socket);

    // privateRoom'daki oyuncuya misafirin katılımı yeni state yayını olarak gelir
    // — dinleyiciyi misafir bağlanmadan ÖNCE kur, yoksa yayını kaçırırız.
    const stateNow = new Promise<{ players?: { id: string }[] } | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 3000);
      priv.socket?.once("state", (st) => {
        clearTimeout(timer);
        resolve(st);
      });
    });
    const guest = await connect(baseUrl, { guestName: "Gezgin", guestId: "webguest-p1", roomId: "kanka-42" });
    assert(guest.roomId === "web-kanka-42", `misafir aynı kodlu odaya girdi (oda=${guest.roomId})`);
    if (guest.socket) sockets.push(guest.socket);
    const ids = ((await stateNow)?.players ?? []).map((p) => p.id);
    assert(
      ids.some((id) => id.startsWith("guest:")) && ids.some((id) => id.startsWith("dev:")),
      "Discord oyuncusu + misafir aynı web- odada (katılım yayını)",
    );
  } finally {
    for (const s of sockets) s.disconnect();
    if (server.exitCode === null) server.kill();
  }

  console.log(failed ? `\nprivate-room-test: ${passed} geçti, ${failed} kaldı` : `\nprivate-room-test: ${passed} OK`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
