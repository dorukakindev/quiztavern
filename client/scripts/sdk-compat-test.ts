/**
 * Discord Embedded App SDK uyumluluk testi — SDK'nın gerçek mock sınıfıyla
 * (DiscordSDKMock + emitEvent + _updateCommandMocks) sdkBridge'in davranışı
 * doğrulanır. Tarayıcı/Discord gerektirmez.
 *
 * Kapsananlar:
 *  - LAYOUT yerleşim eşlemesi: bilinen kodlar focused/pip/grid'e çevrilir,
 *    bilinmeyen kod focused'a düşer, unsubscribe sonrası dinleyici kalmaz.
 *  - THERMAL_STATE_UPDATE: SERIOUS+ → lowPower true, düzelince false.
 *  - inviteWithFallback: guild→openInviteDialog; red→shareLink; DM→shareLink.
 *  - captureClientLog: hata Discord client log'una düşer; sdk yoksa sessiz.
 *
 * Çalıştırma: npx tsx scripts/sdk-compat-test.ts
 */
import { DiscordSDKMock } from "@discord/embedded-app-sdk";
import {
  captureClientLog,
  inviteWithFallback,
  subscribeLayoutModeCompat,
  subscribeSpeaking,
  subscribeThermalState,
  updatePresence,
} from "../src/activity/sdkBridge";

let passed = 0;
let failed = 0;
function assert(cond: boolean, label: string) {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed += 1; console.error(`  ✗ ${label}`); }
}

function makeSdk(guildId: string | null = "guild-1") {
  return new DiscordSDKMock("client-1", guildId, "channel-1", "location-1");
}

console.log("SDK uyumluluk — yerleşim / thermal / invite / log\n");

// ── 1) Yerleşim: bilinen LAYOUT kodları eşlenir ──────────────────────────
{
  const sdk = makeSdk();
  const seen: string[] = [];
  const unsub = subscribeLayoutModeCompat(sdk as never, (m) => seen.push(m));
  sdk.emitEvent("ACTIVITY_LAYOUT_MODE_UPDATE", { layout_mode: 2 });
  sdk.emitEvent("ACTIVITY_LAYOUT_MODE_UPDATE", { layout_mode: 0 });
  sdk.emitEvent("ACTIVITY_LAYOUT_MODE_UPDATE", { layout_mode: 1 });
  assert(seen.join(",") === "grid,focused,pip", `LAYOUT kodları eşlenir (${seen.join(",")})`);
  unsub();
}

// ── 2) Bilinmeyen layout kodu → focused (kompakta düşme) ──────────────────
{
  const sdk = makeSdk();
  const seen: string[] = [];
  subscribeLayoutModeCompat(sdk as never, (m) => seen.push(m));
  sdk.emitEvent("ACTIVITY_LAYOUT_MODE_UPDATE", { layout_mode: 99 });
  assert(seen.join(",") === "focused", `bilinmeyen kod focused'a düşer (${seen.join(",")})`);
}

// ── 3) Cleanup sonrası event'ler işlenmez ────────────────────────────────
{
  const sdk = makeSdk();
  const seen: string[] = [];
  const unsub = subscribeLayoutModeCompat(sdk as never, (m) => seen.push(m));
  unsub();
  sdk.emitEvent("ACTIVITY_LAYOUT_MODE_UPDATE", { layout_mode: 1 });
  assert(seen.length === 0, "unsubscribe sonrası dinleyici kalmaz");
}

// ── 4) Thermal: SERIOUS+ → lowPower, NOMINAL → geri aç ───────────────────
{
  const sdk = makeSdk();
  const states: boolean[] = [];
  subscribeThermalState(sdk as never, (low) => states.push(low));
  sdk.emitEvent("THERMAL_STATE_UPDATE", { thermal_state: 2 });
  sdk.emitEvent("THERMAL_STATE_UPDATE", { thermal_state: 3 });
  sdk.emitEvent("THERMAL_STATE_UPDATE", { thermal_state: 0 });
  assert(states.join(",") === "true,true,false", `thermal eşiği SERIOUS'ta tutar (${states.join(",")})`);
}

// ── 5) Invite: guild'de openInviteDialog önce gelir ───────────────────────
{
  const sdk = makeSdk("guild-1");
  const calls: string[] = [];
  sdk._updateCommandMocks({
    openInviteDialog: async () => { calls.push("dialog"); return {}; },
    shareLink: async () => { calls.push("share"); return { success: true }; },
  });
  const ok = await inviteWithFallback(sdk as never, "gel");
  assert(ok && calls.join(",") === "dialog", `guild'de native diyalog yeter (${calls.join(",")})`);
}

// ── 6) Invite: dialog reddederse shareLink'e düşer ────────────────────────
{
  const sdk = makeSdk("guild-1");
  const calls: string[] = [];
  sdk._updateCommandMocks({
    openInviteDialog: async () => { calls.push("dialog"); throw new Error("no perm"); },
    shareLink: async () => { calls.push("share"); return { success: true }; },
  });
  const ok = await inviteWithFallback(sdk as never, "gel");
  assert(ok && calls.join(",") === "dialog,share", `red sonrası shareLink fallback (${calls.join(",")})`);
}

// ── 7) Invite: shareLink de olumsuzsa false (oda-kodu ipucu devreye girer) ─
{
  const sdk = makeSdk("guild-1");
  sdk._updateCommandMocks({
    openInviteDialog: async () => { throw new Error("no perm"); },
    shareLink: async () => ({ success: false }),
  });
  const ok = await inviteWithFallback(sdk as never, "gel");
  assert(ok === false, "iki yol da kapanınca false");
}

// ── 8) Invite: DM (guildId null) → doğrudan shareLink ─────────────────────
{
  const sdk = makeSdk(null);
  const calls: string[] = [];
  sdk._updateCommandMocks({
    openInviteDialog: async () => { calls.push("dialog"); return {}; },
    shareLink: async () => { calls.push("share"); return { success: true }; },
  });
  const ok = await inviteWithFallback(sdk as never, "gel");
  assert(ok && calls.join(",") === "share", `DM'de shareLink (${calls.join(",")})`);
}

// ── 9) Speaking: SPEAKING_START/STOP kümesi oyuncu id'lerini izler ────────
{
  const sdk = makeSdk();
  let current = new Set<string>();
  const unsub = subscribeSpeaking(sdk as never, (ids) => { current = ids });
  sdk.emitEvent("SPEAKING_START", { user_id: "u1", channel_id: "channel-1" });
  sdk.emitEvent("SPEAKING_START", { user_id: "u2", channel_id: "channel-1" });
  assert(current.has("u1") && current.has("u2"), `konuşanlar işaretlenir (${[...current]})`);
  sdk.emitEvent("SPEAKING_STOP", { user_id: "u1", channel_id: "channel-1" });
  assert(!current.has("u1") && current.has("u2"), "susunca kümeden düşer");
  unsub();
  sdk.emitEvent("SPEAKING_START", { user_id: "u3" });
  assert(!current.has("u3"), "unsubscribe sonrası güncellenmez");
}

// ── 10) Presence: setActivity'e details+state taşınır, red sessiz ────────
{
  const sdk = makeSdk();
  const calls: string[] = [];
  sdk._updateCommandMocks({
    setActivity: async (args: { activity: { details?: string; state?: string } }) => {
      calls.push(`${args.activity.details}/${args.activity.state}`); return { type: 0, name: "Triviara" };
    },
  });
  updatePresence(sdk as never, "Masada bekliyor");
  await new Promise((r) => setTimeout(r, 0));
  assert(calls[0] === "Triviara/Masada bekliyor", `presence taşındı (${calls[0]})`);
  sdk._updateCommandMocks({ setActivity: async () => { throw new Error("INVALID_COMMAND") } });
  updatePresence(sdk as never, "yine de sessiz");
  await new Promise((r) => setTimeout(r, 0));
  assert(true, "INVALID_COMMAND akışı bozmaz");
}

// ── 11) captureClientLog: hata Discord log'una düşer / sdk'suz sessiz ─────
{
  const sdk = makeSdk();
  const logs: string[] = [];
  sdk._updateCommandMocks({
    captureLog: async (args: { level: string; message: string }) => { logs.push(`${args.level}:${args.message}`); return {}; },
  });
  captureClientLog(sdk as never, "boom");
  await new Promise((r) => setTimeout(r, 0));
  assert(logs.length === 1 && logs[0] === "error:boom", `captureLog'a ulaştı (${logs.join(",")})`);
  captureClientLog(null, "sessiz");
  assert(true, "sdk yokken sessiz geçer");
}

console.log(`\n${passed} geçti, ${failed} kaldı`);
process.exit(failed ? 1 : 0);
