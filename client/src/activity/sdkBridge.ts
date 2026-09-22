import { Common, DiscordSDK, Events } from '@discord/embedded-app-sdk'
import type { LayoutMode } from './useDiscordActivity'

const LAYOUT_BY_CODE: Record<number, LayoutMode> = {
  [Common.LayoutModeTypeObject.FOCUSED]: 'focused',
  [Common.LayoutModeTypeObject.PIP]: 'pip',
  [Common.LayoutModeTypeObject.GRID]: 'grid',
}

/**
 * Yerleşim (focused/pip/grid) değişimlerine abone olur, cleanup döndürür.
 * Eski istemcilerin ACTIVITY_PIP_MODE_UPDATE olayına bilinçli olarak abone
 * olmayız: olay SDK enum'unda yok ve Discord proxy'si SUBSCRIBE komutunu
 * "Unrecognized event type" hatasıyla reddedip konsolu kirletir. Güncel
 * istemcilerin hepsi LAYOUT olayını yayınlar; ona güvenmek yeterli.
 */
export function subscribeLayoutModeCompat(sdk: DiscordSDK, apply: (mode: LayoutMode) => void): () => void {
  const onLayout = ({ layout_mode }: { layout_mode: number }) => {
    // Bilinmeyen kod geldiğinde tam ekran varsayarız: oyunu tanımadığımız bir
    // yerleşim yüzünden kompakt karta düşürmeyelim.
    apply(LAYOUT_BY_CODE[layout_mode] ?? 'focused')
  }
  // subscribe() reddedince unhandled rejection kalmasın.
  void sdk.subscribe(Events.ACTIVITY_LAYOUT_MODE_UPDATE, onLayout).catch(() => {})
  return () => {
    void sdk.unsubscribe(Events.ACTIVITY_LAYOUT_MODE_UPDATE, onLayout).catch(() => {})
  }
}

/**
 * Cihaz ısınınca dekoratif görselleri kısmak için: SERIOUS/CRITICAL gelince
 * apply(true), durum düzelince apply(false). Eski istemcide olay bilinmez.
 */
export function subscribeThermalState(sdk: DiscordSDK, apply: (lowPower: boolean) => void): () => void {
  const onThermal = ({ thermal_state }: { thermal_state: number }) => {
    apply(thermal_state >= 2)
  }
  void sdk.subscribe(Events.THERMAL_STATE_UPDATE, onThermal).catch(() => {})
  return () => {
    void sdk.unsubscribe(Events.THERMAL_STATE_UPDATE, onThermal).catch(() => {})
  }
}

/**
 * Ses kanalında kim konuşuyor: SPEAKING_START/STOP dinler, apply'a aktif
 * konuşan Discord kullanıcı id'lerinin kopyasını verir. rpc.voice.read
 * scope'u gerekir — yoksa subscribe reddeder, küme boş kalır.
 * Oyuncu id'leri gerçek Discord'da snowflake olduğundan doğrudan eşlenir.
 */
export function subscribeSpeaking(sdk: DiscordSDK, apply: (speakingIds: Set<string>) => void): () => void {
  const speaking = new Set<string>()
  const emit = () => apply(new Set(speaking))
  const args = { channel_id: sdk.channelId }
  const onStart = ({ user_id }: { user_id: string }) => { speaking.add(user_id); emit() }
  const onStop = ({ user_id }: { user_id: string }) => { speaking.delete(user_id); emit() }
  void sdk.subscribe(Events.SPEAKING_START, onStart, args).catch(() => {})
  void sdk.subscribe(Events.SPEAKING_STOP, onStop, args).catch(() => {})
  return () => {
    void sdk.unsubscribe(Events.SPEAKING_START, onStart, args).catch(() => {})
    void sdk.unsubscribe(Events.SPEAKING_STOP, onStop, args).catch(() => {})
  }
}

/**
 * Rich Presence: Discord durum çubuğunda "QuizTavern oynuyor — <state>".
 * rpc.activities.write scope'u gerekir; yoksa INVALID_COMMAND ile reddeder —
 * presence kozmetiktir, akışı asla bozmamalı.
 */
export function updatePresence(sdk: DiscordSDK, state: string): void {
  void sdk.commands.setActivity({
    activity: { type: 0, details: 'QuizTavern', state },
  }).catch(() => {})
}

/**
 * Boş koltuk → arkadaş çağır. Zincir: guild'deyse native davet diyaloğu,
 * değilse/başarısızsa shareLink (aktivite linkini paylaşma modalı — DM'de
 * de çalışır). İkisi de olmazsa false → çağıran oda-kodu ipucuna düşer.
 */
export async function inviteWithFallback(sdk: DiscordSDK, message: string): Promise<boolean> {
  if (sdk.guildId) {
    try { await sdk.commands.openInviteDialog(); return true } catch { /* izin yok — link paylaşımına düş */ }
  }
  try { return (await sdk.commands.shareLink({ message })).success } catch { return false }
}

/**
 * Maç sonucu paylaşımı (podyum "Kanala paylaş"): sonuç metnini shareLink'in
 * `message` alanıyla kanal paylaşım modalına taşır — aktivite linki kartı
 * Discord üretir. shareLink yoksa/reddedilirse native davet diyaloğuna düşer
 * (metin kaybolur ama davet yine açılır). İkisi de olmazsa false.
 */
export async function shareResult(sdk: DiscordSDK, message: string): Promise<boolean> {
  try { return (await sdk.commands.shareLink({ message })).success } catch { /* link paylaşımı yok — davet diyaloğuna düş */ }
  if (sdk.guildId) {
    try { await sdk.commands.openInviteDialog(); return true } catch { /* izin yok */ }
  }
  return false
}

/**
 * Auth hatasını Discord istemcisinin log'larına düşür: gerçek Discord'da
 * iframe konsolunu göremediğimiz için tek teşhis yolumuz bu. SDK hazır
 * değilse sessizce geçer.
 */
export function captureClientLog(sdk: DiscordSDK | null, message: string): void {
  if (!sdk) return
  try {
    void sdk.commands.captureLog({ level: 'error', message }).catch(() => {})
  } catch {
    /* komut yok / bağlantı kapalı */
  }
}
