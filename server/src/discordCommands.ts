import WebSocket from "ws";
import { DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID } from "./config";
import { log } from "./logger";

// Minimal Discord Gateway istemcisi: yalnızca /triviara slash komutunu
// cevaplamak için var. Discovery doğrulaması çalışan en az bir slash komutu
// istiyor; Activity zaten Discord etkileşimi yaşadığı için bu komut kanal
// içinden masaya nasıl katılınacağını söyleyen kısa bir yanıt veriyor.
//
// Interactions Endpoint URL'si yerine gateway kullanılıyor (bot token'ı zaten
// instance doğrulaması için mevcut; ayrı HTTP ucu açmak gerekmiyor).
// Privileged intent gerekmez — komutlar intents=0 ile gelir.
// Kapatmak: DISCORD_GATEWAY=0.

const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";
const API = "https://discord.com/api/v10";
const COMMAND_NAME = "triviara";

const REPLY =
  "🍻 **Triviara** — bir ses kanalına gir → etkinlikler (roket) → Triviara.\n" +
  "🍻 **Triviara** — join a voice channel → Activities → Triviara.";

let stopped = false;
let ws: WebSocket | null = null;
let sessionId: string | null = null;
let seq: number | null = null;
let heartbeat: NodeJS.Timeout | null = null;
let backoff = 1000;

function closeHeartbeat() {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
}

async function answerInteraction(id: string, token: string) {
  try {
    const res = await fetch(`${API}/interactions/${id}/${token}/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: 4, data: { content: REPLY, flags: 64 } }),
    });
    if (!res.ok) log.warn({ status: res.status }, "slash komut yanıtı reddedildi");
  } catch (err) {
    log.warn({ err }, "slash komut yanıtı gönderilemedi");
  }
}

function connect() {
  if (stopped) return;
  ws = new WebSocket(GATEWAY_URL);

  ws.on("message", (raw) => {
    let msg: { op: number; t?: string; s?: number; d?: any };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.s != null) seq = msg.s;

    switch (msg.op) {
      case 10: {
        // HELLO → heartbeat başlat, sonra IDENTIFY veya RESUME
        const interval = Number(msg.d?.heartbeat_interval) || 41250;
        closeHeartbeat();
        heartbeat = setInterval(() => ws?.send(JSON.stringify({ op: 1, d: seq })), interval);
        if (sessionId) {
          ws?.send(JSON.stringify({ op: 6, d: { token: DISCORD_BOT_TOKEN, session_id: sessionId, seq } }));
        } else {
          ws?.send(
            JSON.stringify({
              op: 2,
              d: {
                token: DISCORD_BOT_TOKEN,
                intents: 0,
                properties: { os: "linux", browser: "triviara", device: "triviara" },
              },
            }),
          );
        }
        break;
      }
      case 0:
        if (msg.t === "READY") {
          sessionId = msg.d?.session_id ?? sessionId;
          backoff = 1000;
          log.info("discord gateway: READY");
        } else if (msg.t === "RESUMED") {
          backoff = 1000;
          log.info("discord gateway: RESUMED");
        } else if (
          msg.t === "INTERACTION_CREATE" &&
          msg.d?.type === 2 &&
          msg.d?.data?.name === COMMAND_NAME
        ) {
          void answerInteraction(msg.d.id, msg.d.token);
        }
        break;
      case 7: // RECONNECT — sunucu istiyor; resume deneyerek yeniden bağlan
        ws?.close(4000);
        break;
      case 9: // INVALID_SESSION — resume mümkün değilse kimliği sıfırla
        if (!msg.d) sessionId = null;
        ws?.close(4000);
        break;
    }
  });

  ws.on("close", () => {
    closeHeartbeat();
    ws = null;
    if (stopped) return;
    const wait = backoff;
    backoff = Math.min(backoff * 2, 30000);
    log.warn({ wait }, "discord gateway kapandı, yeniden bağlanılıyor");
    setTimeout(connect, wait);
  });

  ws.on("error", (err) => {
    log.warn({ err }, "discord gateway hatası");
    ws?.close();
  });
}

export function startDiscordCommands() {
  if (!DISCORD_BOT_TOKEN || !DISCORD_CLIENT_ID || process.env.DISCORD_GATEWAY === "0") return;
  connect();
}

export function stopDiscordCommands() {
  stopped = true;
  closeHeartbeat();
  ws?.close();
}
