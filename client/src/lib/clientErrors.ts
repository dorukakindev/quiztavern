/**
 * Yakalanmamış istemci hatalarını (window.onerror + unhandledrejection) en fazla
 * 5 sn'de bir kez, fire-and-forget POST olarak sunucuya bildirir. Sunucu bunları
 * pino log'una düşürür. Raporlama asla oyun akışını etkilemez.
 */

const inDiscordProxy = typeof window !== "undefined" && window.location.hostname.endsWith(".discordsays.com");

// realtime.ts ile aynı taban çözümü: Discord iframe'inde proxy origin'i,
// tarayıcıda VITE_GAME_SERVER_URL (dev'de vite proxy'si /client-errors'u
// kapsamadığından doğrudan sunucuya gider; hata verirse yok sayılır).
const base = inDiscordProxy ? window.location.origin : import.meta.env.VITE_GAME_SERVER_URL || window.location.origin;
const endpoint = `${base}${inDiscordProxy ? "/api/client-errors" : "/client-errors"}`;

const MIN_INTERVAL_MS = 5_000;
let lastSentAt = 0;

const report = (type: string, message: string, stack?: string) => {
  const now = Date.now();
  if (now - lastSentAt < MIN_INTERVAL_MS) return;
  lastSentAt = now;
  try {
    void fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, message, stack, url: window.location.href }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // fetch senkron hata verirse yut — raporlama oyundan önemli değil
  }
};

let installed = false;
export const installClientErrorReporting = () => {
  if (installed) return;
  installed = true;
  window.addEventListener("error", (event) => {
    report("error", event.message || "unknown", event.error instanceof Error ? event.error.stack : undefined);
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    report(
      "unhandledrejection",
      reason instanceof Error ? reason.message : String(reason),
      reason instanceof Error ? reason.stack : undefined,
    );
  });
};
