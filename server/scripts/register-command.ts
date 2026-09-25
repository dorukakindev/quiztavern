// /triviara global slash komutunu Discord'a kaydeder (veya günceller).
// Çalıştırma: DISCORD_CLIENT_ID=... DISCORD_BOT_TOKEN=... npm run register:command -w server
// Komutun yanıtı sunucunun gateway bağlantısı tarafından verilir
// (src/discordCommands.ts) — bu script yalnızca kaydı yapar.
import { DISCORD_CLIENT_ID, DISCORD_BOT_TOKEN } from "../src/config";

const API = "https://discord.com/api/v10";
const COMMAND = {
  name: "triviara",
  type: 1, // CHAT_INPUT
  description: "Triviara bilgi masasını başlat — nasıl katılınır",
  name_localizations: { tr: "triviara" },
  description_localizations: {
    tr: "Triviara bilgi masasını başlat — nasıl katılınır",
    "en-US": "Start a Triviara trivia table — how to join",
  },
};

if (!DISCORD_CLIENT_ID || !DISCORD_BOT_TOKEN) {
  console.error("DISCORD_CLIENT_ID ve DISCORD_BOT_TOKEN gerekli.");
  process.exit(1);
}

const headers = {
  Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
  "Content-Type": "application/json",
};

const list = await fetch(`${API}/applications/${DISCORD_CLIENT_ID}/commands`, { headers }).then((r) => {
  if (!r.ok) throw new Error(`komut listesi alınamadı: ${r.status}`);
  return r.json() as Promise<Array<{ id: string; name: string }>>;
});

const existing = list.find((c) => c.name === COMMAND.name);
const url = `${API}/applications/${DISCORD_CLIENT_ID}/commands${existing ? `/${existing.id}` : ""}`;
const res = await fetch(url, {
  method: existing ? "PATCH" : "POST",
  headers,
  body: JSON.stringify(COMMAND),
});
if (!res.ok) throw new Error(`komut kaydı başarısız: ${res.status} ${await res.text()}`);
const saved = (await res.json()) as { id: string; name: string };
console.log(`/${saved.name} kaydedildi (${existing ? "güncellendi" : "oluşturuldu"}, id ${saved.id})`);
process.exit(0);
