import { useCallback, useEffect, useRef, useState } from 'react'
import { Common, DiscordSDK, RPCCloseCodes } from '@discord/embedded-app-sdk'
import { captureClientLog, inviteWithFallback, subscribeLayoutModeCompat, subscribeSpeaking, subscribeThermalState, updatePresence } from './sdkBridge'

export type ActivityIdentity = {
  instanceId: string
  channelId: string | null
  /** Sunucu (guild) kimliği; DM'de null. Davet diyaloğu yalnız guild'de çalışır. */
  guildId: string | null
  sessionToken?: string
  user: { id: string; name: string; avatarUrl: string | null } | null
  /** Discord istemcisinin dili (userSettingsGetLocale); yoksa undefined. */
  locale?: string
  isDiscord: boolean
}

/**
 * Discord, Activity'yi üç yerleşimde gösterebilir. PIP küçük yüzen bir
 * penceredir: masa oraya sığmaz, arayüz kompakt karta düşer.
 */
export type LayoutMode = 'focused' | 'pip' | 'grid'

const fallbackIdentity: ActivityIdentity = {
  instanceId: 'dev-ana-lobi',
  channelId: null,
  guildId: null,
  user: null,
  isDiscord: false,
}

/**
 * Discord SDK hataları `Error` değil, `{ code, message }` biçiminde düz nesne
 * olarak fırlar — `instanceof Error` kontrolü bunları yutup "bir şey olmadı"
 * mesajına düşürür. Ne olduğunu görebilmek için elle açıyoruz.
 */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const rpc = error as { code?: unknown; message?: unknown }
    if (rpc.message) return `${String(rpc.message)}${rpc.code !== undefined ? ` (kod ${String(rpc.code)})` : ''}`
    try { return JSON.stringify(error).slice(0, 200) } catch { /* döngüsel nesne */ }
  }
  return String(error)
}

interface ActivitySession {
  sdk: DiscordSDK
  identity: ActivityIdentity
}

/**
 * Discord bağlantısı sayfa başına TEKTİR ve burada saklanır.
 *
 * Neden: `authorize()` bir kez uçarken ikinci kez çağrılırsa Discord
 * "Already authing (4002)" ile reddeder. React StrictMode geliştirmede
 * efektleri bilerek iki kez çalıştırır; efekt içindeki `cancelled` bayrağı
 * yalnızca state yazmayı durdurur, ikinci `authorize()` çağrısını DEĞİL.
 * Sözü modül seviyesinde tutup ikinci çağrıya aynı sözü döndürüyoruz —
 * hem StrictMode'da hem de efektin herhangi bir sebeple yeniden koştuğu
 * durumda tek bir yetkilendirme yapılır.
 */
let sessionPromise: Promise<ActivitySession> | null = null

function connectOnce(clientId: string): Promise<ActivitySession> {
  // Hata durumunda sözü temizle ki kullanıcı yeniden deneyebilsin;
  // başarılıysa sonsuza dek aynı oturum paylaşılır.
  sessionPromise ??= openActivitySession(clientId).catch((error) => {
    sessionPromise = null
    throw error
  })
  return sessionPromise
}

type AuthStep = 'ready' | 'authorize' | 'token' | 'authenticate'
const SDK_READY_TIMEOUT_MS = 12_000
const TOKEN_FETCH_TIMEOUT_MS = 15_000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value) },
      (error) => { window.clearTimeout(timer); reject(error) },
    )
  })
}

/**
 * Adımı HATANIN üstünde taşırız, yan değişkende değil: bağlantı sözü paylaşıldığı
 * için ikinci çağıranın kendi adım değişkeni ilk çağrının ilerleyişini göremez
 * ve hata hep "[ready]" etiketiyle görünürdü.
 */
class AuthStepError extends Error {
  constructor(readonly step: AuthStep, readonly reason: unknown) {
    super(describeError(reason))
    this.name = 'AuthStepError'
  }
}

/** Adımı işaretleyerek çalıştırır; patlarsa hangi adımda olduğunu hataya yapıştırır. */
async function at<T>(step: AuthStep, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    throw new AuthStepError(step, error)
  }
}

function closeSdk(sdk: DiscordSDK, message: string) {
  try { sdk.close(RPCCloseCodes.CLOSE_ABNORMAL, message) } catch { /* zaten kapanmış */ }
}

async function openActivitySession(clientId: string): Promise<ActivitySession> {
  const sdk = new DiscordSDK(clientId)
  try {
    return await initializeActivitySession(sdk, clientId)
  } catch (error) {
    // ready() geçildiyse SDK hâlâ açık: hatayı Discord istemcisinin log'larına
    // da bırak (iframe konsolunu gerçek Discord'da göremeyiz).
    captureClientLog(sdk, `[activity] init failed: ${describeError(error)}`)
    // Constructor pencereye message listener ekler; timeout/hata sonrası bırakılırsa
    // her Retry yeni bir listener biriktirir.
    closeSdk(sdk, 'QuizTavern activity initialization failed')
    throw error
  }
}

async function initializeActivitySession(sdk: DiscordSDK, clientId: string): Promise<ActivitySession> {
  await at('ready', () => withTimeout(sdk.ready(), SDK_READY_TIMEOUT_MS, 'Discord SDK ready'))

  // identify: kullanıcı + locale. rpc.activities.write: Rich Presence
  // (setActivity). rpc.voice.read: ses kanalında kim konuşuyor (SPEAKING_*).
  // prompt göndermiyoruz: 'none' yalnız önceden yetki vermiş kullanıcıda
  // sessiz geçer; ilk girişte sheet gerekir ve çağrı hata fırlatır. prompt'u
  // boş bırakınca istemci gerektiğinde sheet gösterir, verilmişse sessiz geçer.
  const authorization = await at('authorize', () => sdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    scope: ['identify', 'rpc.activities.write', 'rpc.voice.read'],
  }))

  // Discord iframe'inde CSP dış adresleri engeller: sunucuya yalnızca kendi
  // proxy alanımızdaki /api önekiyle (Portal'daki ikinci URL eşlemesi)
  // ulaşılır. Doğrudan tünel adresi 'blocked:csp' ile ölür.
  const tokenEndpoint = window.location.hostname.endsWith('.discordsays.com')
    ? '/api/auth/activity/token'
    : `${import.meta.env.VITE_GAME_SERVER_URL || window.location.origin}/auth/activity/token`
  const session = await at('token', async () => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), TOKEN_FETCH_TIMEOUT_MS)
    try {
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: authorization.code }),
        signal: controller.signal,
      })
      if (!response.ok) {
        // Sunucunun kendi hata gövdesini taşı: "401" demek yerine nedenini söyler.
        const detail = await response.text().catch(() => '')
        throw new Error(`${response.status}: ${detail.slice(0, 160) || 'sunucu yanit vermedi'}`)
      }
      return await response.json() as { access_token: string; session_token: string; user: ActivityIdentity['user'] }
    } finally {
      window.clearTimeout(timeout)
    }
  })

  await at('authenticate', () => sdk.commands.authenticate({ access_token: session.access_token }))

  // Masa yatay bir sahne: telefonda da yatayı tercih ederiz. Kilit her
  // platformda desteklenmez ve garanti değildir — responsive iskelet güvenli
  // taban olarak kalır, kilit yalnızca tercihtir. Başarısızlığı oyunu düşürmemeli.
  try {
    await sdk.commands.setOrientationLockState({
      lock_state: Common.OrientationLockStateTypeObject.LANDSCAPE,
      picture_in_picture_lock_state: Common.OrientationLockStateTypeObject.LANDSCAPE,
      grid_lock_state: Common.OrientationLockStateTypeObject.LANDSCAPE,
    })
  } catch {
    /* platform desteklemiyor — dikey düzen devreye girer */
  }

  // Discord dilini arayüz diline öneri olarak taşır; desteklemeyen
  // istemcilerde komut reddeder — sessizce undefined kalır.
  let locale: string | undefined
  try {
    locale = (await sdk.commands.userSettingsGetLocale()).locale
  } catch {
    /* eski istemci ya da kapsam yok */
  }

  return {
    sdk,
    identity: {
      instanceId: sdk.instanceId || `channel-${sdk.channelId || 'activity'}`,
      channelId: sdk.channelId,
      guildId: sdk.guildId,
      sessionToken: session.session_token,
      user: session.user,
      locale,
      isDiscord: true,
    },
  }
}

/** Yerel geliştirmede yerleşimi zorlamak için: ?layout=pip | grid | focused */
function layoutFromQuery(): LayoutMode | null {
  if (typeof window === 'undefined') return null
  const value = new URLSearchParams(window.location.search).get('layout')
  return value === 'pip' || value === 'grid' || value === 'focused' ? value : null
}

function sessionExpiresAt(token: string): number | null {
  try {
    const encoded = token.split('.')[0]
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=')
    const payload = JSON.parse(atob(base64)) as { exp?: unknown }
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

/** Discord iframe'i ve normal tarayici gelistirme modunu ayni API ile sunar. */
export function useDiscordActivity() {
  const localRoomId = typeof window === 'undefined' ? fallbackIdentity.instanceId : new URLSearchParams(window.location.search).get('room') || fallbackIdentity.instanceId
  const localIdentity = { ...fallbackIdentity, instanceId: localRoomId }
  const [identity, setIdentity] = useState<ActivityIdentity>(localIdentity)
  const [status, setStatus] = useState<'booting' | 'ready' | 'fallback' | 'error'>('booting')
  const [error, setError] = useState<string | null>(null)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => layoutFromQuery() ?? 'focused')
  // Discord THERMAL_STATE_UPDATE: cihaz ısınınca dekoratif shader kapatılır.
  const [lowPower, setLowPower] = useState(false)
  // Ses kanalında şu an konuşan Discord kullanıcı id'leri (SPEAKING_* event).
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(() => new Set())
  const [attempt, setAttempt] = useState(0)
  const sdkRef = useRef<DiscordSDK | null>(null)
  const retry = useCallback(() => {
    if (sdkRef.current) closeSdk(sdkRef.current, 'QuizTavern activity session refresh')
    sdkRef.current = null
    sessionPromise = null
    setIdentity((current) => ({ ...current, sessionToken: undefined, user: null }))
    setError(null)
    setStatus('booting')
    setAttempt((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!identity.isDiscord || !identity.sessionToken) return
    const expiresAt = sessionExpiresAt(identity.sessionToken)
    if (expiresAt === null) return
    // Kopmayı bekleme: yeni oturumu bir dakika önce al, aynı Discord kullanıcı
    // kimliğiyle kurulan yeni socket mevcut koltuğu devralır.
    const delay = Math.max(0, expiresAt - Date.now() - 60_000)
    const timer = window.setTimeout(retry, delay)
    return () => window.clearTimeout(timer)
  }, [identity.isDiscord, identity.sessionToken, retry])

  const invite = useCallback(async (message: string): Promise<boolean> => {
    const sdk = sdkRef.current
    if (!sdk) return false
    return inviteWithFallback(sdk, message)
  }, [])

  /** Discord durum çubuğunda görünen satır; SDK yoksa no-op. */
  const setPresence = useCallback((state: string): void => {
    if (sdkRef.current) updatePresence(sdkRef.current, state)
  }, [])

  useEffect(() => {
    let cancelled = false
    const clientId = ((import.meta as unknown) as { env?: Record<string, string | undefined> }).env?.VITE_DISCORD_CLIENT_ID
    if (!clientId || window.parent === window) {
      setIdentity(localIdentity)
      setStatus('fallback')
      return
    }

    let sdk: DiscordSDK | null = null
    let unsubs: (() => void)[] = []
    connectOnce(clientId)
      .then((session) => {
        if (cancelled) return
        sdk = session.sdk
        sdkRef.current = session.sdk
        unsubs = [
          subscribeLayoutModeCompat(session.sdk, setLayoutMode),
          subscribeThermalState(session.sdk, setLowPower),
          subscribeSpeaking(session.sdk, setSpeakingIds),
        ]
        setIdentity(session.identity)
        setStatus('ready')
      })
      .catch((nextError: unknown) => {
        if (cancelled) return
        const step = nextError instanceof AuthStepError ? nextError.step : '?'
        setIdentity(localIdentity)
        setStatus('error')
        setError(`[${step}] ${describeError(nextError)}`)
        // Ekrana tek satır sığar; SDK'nın ham nesnesi konsolda kalsın.
        console.error(`[activity] ${step} adiminda dustu:`, nextError instanceof AuthStepError ? nextError.reason : nextError)
      })

    return () => {
      cancelled = true
      unsubs.forEach((unsub) => { try { unsub() } catch { /* zaten kapalı */ } })
    }
  }, [attempt, localRoomId])

  // Query ile zorlanan yerleşim her zaman kazanır (yerel PIP denemesi için).
  const forced = layoutFromQuery()
  return { identity, status, error, layoutMode: forced ?? layoutMode, lowPower, speakingIds, invite, setPresence, retry }
}
