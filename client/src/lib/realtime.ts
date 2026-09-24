import { useEffect, useMemo, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { EV, type BadgeKey, type Difficulty, type EmoteKey, type EmotePayload, type GameMode, type GameState, type ToastPayload } from '../../../shared/types'
import { browserRandomId, storageGet, storageSet } from './storage'

/** Ekranda gösterilen tepki; `uid` aynı oyuncunun arka arkaya attığı tepkileri ayırır. */
export type LiveEmote = EmotePayload & { uid: number }
let emoteSeq = 0

/**
 * Discord iframe'inin CSP'si dış adreslere isteği ENGELLER: oyun sunucusuna
 * doğrudan (trycloudflare/localhost) gidilemez. Discord içindeyken her şey
 * kendi proxy alanımızdan (xxx.discordsays.com) geçer ve sunucu, Portal'daki
 * ikinci URL eşlemesiyle `/api` önekine bağlanır.
 */
const inDiscordProxy = typeof window !== 'undefined' && window.location.hostname.endsWith('.discordsays.com')

export type ActivityRealtimeIdentity = {
  instanceId?: string
  sessionToken?: string | null
  user?: { id: string; name: string } | null
}

type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline'

export function isAuthRequiredError(error: unknown): boolean {
  return !!error
    && typeof error === 'object'
    && (error as { data?: { code?: unknown } }).data?.code === 'AUTH_REQUIRED'
}

/**
 * Yerel geliştirmede kimlik. Sekmeler localStorage'ı paylaştığı için varsayılan
 * halde iki sekme AYNI oyuncudur — ve "yeni bağlantı eskisini düşürür" kuralı
 * gereği ikinci sekme birinciyi atar. İki oyuncuyu tek tarayıcıda denemek için
 * `?as=Ayse` verin: her ad kendi kalıcı kimliğini alır.
 */
export const getDevIdentity = () => {
  const as = new URLSearchParams(window.location.search).get('as')?.trim().slice(0, 24)
  if (as) return { id: `as-${as.toLowerCase().replace(/[^a-z0-9]/g, '-')}-tab`, name: as }
  const key = 'qt-dev-player-id'
  let id = storageGet(key)
  if (!id) {
    id = browserRandomId()
    storageSet(key, id)
  }
  return { id, name: storageGet('qt-dev-name') || 'Sen' }
}

/** Oyun görsellerinden bağımsız, tek yerden yönetilen Socket.IO bağlantısı. */
export function useRealtimeGame(roomId = 'ana-lobi', identity?: ActivityRealtimeIdentity, onAuthRequired?: () => void) {
  const [state, setState] = useState<GameState | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  // Mesaj çevrilmemiş olarak taşınır: anahtarı sunucu verir, metnini arayüz
  // kendi dilinde üretir. Burada düz metin tutmak, dil değişince mesajı bayat bırakır.
  const [message, setMessage] = useState<ToastPayload | null>(null)
  // Bağlantının NEDEN düştüğü: kod + mesaj. iskelet ekranı bununla
  // "sunucuya ulaşılamadı" hata ekranına geçer; yoksa offline sonsuza dönerdi.
  const [connectionError, setConnectionError] = useState<{ code?: string; message?: string } | null>(null)
  const [emotes, setEmotes] = useState<LiveEmote[]>([])
  /** Bağlantının koptuğu an (yerel saat). Grace sayacı buradan işler. */
  const [droppedAt, setDroppedAt] = useState<number | null>(null)
  // leaveGame() SUNUCUYA disconnect(true) yaptırır (bkz. asağıdaki leaveGame yorumu)
  // — bu KASITLI kopma da genel onDisconnect'i tetikler ve "bağlantı koptu, koltuğun
  // korunuyor" ekranını yanlışlıkla açardı. Bayrak bu TEK olayı yutup normal
  // (istenmeyen) kopmalarda dokunmuyor.
  const intentionalLeave = useRef(false)
  const emoteTimers = useRef<Set<number>>(new Set())

  const socket = useMemo<Socket>(() => {
    const dev = getDevIdentity()
    // Discord iframe'inde CSP ve URL Mapping sözleşmesi gereği bağlantı mutlaka
    // Discord'un kendi proxy origin'inden kurulmalı. VITE_GAME_SERVER_URL yalnızca
    // Discord dışındaki doğrudan tarayıcı testleri içindir; burada kullanılırsa
    // dış tünele `/api/socket.io` gönderilir ve origin 404 döndürür.
    const base = inDiscordProxy
      ? window.location.origin
      : import.meta.env.VITE_GAME_SERVER_URL || window.location.origin
    return io(base, {
      autoConnect: false,
      // Polling ile el sıkış, sonra mümkünse WebSocket'e yükselt. WebSocket'i
      // ilk ve tek fiilî yol yapmak bazı iframe/proxy katmanlarında fallback'i
      // çalıştırmadan bağlantıyı tamamen düşürüyordu.
      transports: ['polling', 'websocket'],
      tryAllTransports: true,
      // Proxy, /api önekini soyup isteği sunucu tüneline iletir; sunucudaki
      // Socket.IO standart /socket.io yolunda kalır.
      path: inDiscordProxy ? '/api/socket.io' : '/socket.io',
      auth: {
        roomId,
        instanceId: identity?.instanceId,
        devId: identity?.user?.id || dev.id,
        devName: identity?.user?.name || dev.name,
        sessionToken: identity?.sessionToken || undefined,
      },
    })
  }, [roomId, identity?.instanceId, identity?.sessionToken, identity?.user?.id, identity?.user?.name])

  useEffect(() => {
    // Discord içinde kimlik doğrulanmadan bağlanma: sessionToken'sız bağlantı
    // sunucu tarafından zaten reddedilir; erken deneme yalnızca sahte
    // "bağlantı koptu" gürültüsü üretir. Token gelince socket yeniden kurulur.
    if (inDiscordProxy && !identity?.sessionToken) return
    const onConnect = () => { setStatus('connected'); setDroppedAt(null); setConnectionError(null) }
    // Kopma anını bir kez damgala: socket.io tekrar denedikçe sayaç sıfırlanmamalı.
    const onDisconnect = () => {
      if (intentionalLeave.current) { intentionalLeave.current = false; return }
      setStatus('reconnecting'); setDroppedAt((at) => at ?? Date.now())
    }
    const onError = (error: unknown) => {
      if (inDiscordProxy && isAuthRequiredError(error)) {
        setStatus('connecting')
        onAuthRequired?.()
        return
      }
      setStatus('offline')
      setDroppedAt((at) => at ?? Date.now())
      const data = (error as { data?: { code?: unknown } } | null)?.data
      setConnectionError({
        code: typeof data?.code === 'string' ? data.code : undefined,
        message: error instanceof Error ? error.message : undefined,
      })
      setMessage({ key: 'err.connection' })
    }
    const onState = (next: GameState) => setState(next)
    const onToast = (toast: ToastPayload) => setMessage(toast?.key ? toast : null)
    const onAuthRequiredEvent = () => onAuthRequired?.()
    const onEmote = (emote: EmotePayload) => {
      if (!emote?.emote) return
      const live: LiveEmote = { ...emote, uid: ++emoteSeq }
      setEmotes((current) => [...current, live])
      // Kendi kendini toplar: animasyon bittikten sonra listede tutmanın anlamı yok.
      const timer = window.setTimeout(() => {
        emoteTimers.current.delete(timer)
        setEmotes((current) => current.filter((item) => item.uid !== live.uid))
      }, 2200)
      emoteTimers.current.add(timer)
    }
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onError)
    socket.on(EV.STATE, onState)
    socket.on(EV.TOAST, onToast)
    socket.on(EV.AUTH_REQUIRED, onAuthRequiredEvent)
    socket.on(EV.EMOTE, onEmote)
    socket.connect()
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onError)
      socket.off(EV.STATE, onState)
      socket.off(EV.TOAST, onToast)
      socket.off(EV.AUTH_REQUIRED, onAuthRequiredEvent)
      socket.off(EV.EMOTE, onEmote)
      socket.disconnect()
      for (const timer of emoteTimers.current) window.clearTimeout(timer)
      emoteTimers.current.clear()
    }
  }, [socket, identity?.sessionToken, onAuthRequired])

  // Toast'lar kendi kendine kapanır: eskiden yalnız tıklamayla gidiyordu, o yüzden
  // lobide "herkes hazır olmalı" gibi bir mesaj maç başlayınca ekranda asılı
  // kalıyordu. Bağlantı hatasında da güvenli — asıl durumu ReconnectOverlay taşır.
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), 4500)
    return () => window.clearTimeout(timer)
  }, [message])

  return {
    state,
    status,
    message,
    connectionError,
    emotes,
    droppedAt,
    dismissMessage: () => setMessage(null),
    sendEmote: (emote: EmoteKey) => socket.emit(EV.EMOTE, { emote }),
    reconnectNow: () => { if (!socket.connected) { setStatus('connecting'); setConnectionError(null); socket.connect() } },
    start: (mode: GameMode = 'quiz') => socket.emit(EV.START, { mode }),
    startDaily: () => socket.emit(EV.START, { daily: true }),
    answer: (choice: number) => { if (socket.connected) socket.emit(EV.ANSWER, choice) },
    answerCircle: (answer: string) => { if (socket.connected) socket.emit(EV.CIRCLE_ANSWER, answer) },
    answerWord: (answer: string) => { if (socket.connected) socket.emit(EV.WORD_ANSWER, answer) },
    wordLetter: () => { if (socket.connected) socket.emit(EV.WORD_LETTER) },
    placeBet: (amount: number) => { if (socket.connected) socket.emit(EV.BET, amount) },
    playAgain: () => socket.emit(EV.PLAY_AGAIN),
    addBot: () => socket.emit(EV.ADD_BOT),
    ready: (value: boolean) => socket.emit(EV.READY, value),
    setCategories: (categories: string[]) => socket.emit(EV.SET_CATEGORIES, categories),
    setQuestionCount: (count: number) => socket.emit(EV.SET_QUESTION_COUNT, { count }),
    setDifficulty: (difficulty: Difficulty | null) => socket.emit(EV.SET_DIFFICULTY, { difficulty }),
    setPack: (packId: string | null) => socket.emit(EV.SET_PACK, { packId }),
    setMode: (mode: GameMode) => socket.emit(EV.SET_MODE, { mode }),
    setTeam: (targetId: string, team: number) => socket.emit(EV.SET_TEAM, { targetId, team }),
    // Host araçları. Yetki ve ban süresi SUNUCUDA (rooms.ts kick/transferHost);
    // burası yalnızca hedefi bildirir. Reddedilirse sunucu toast döndürür.
    kick: (targetId: string) => socket.emit(EV.KICK, { targetId }),
    transferHost: (targetId: string) => socket.emit(EV.TRANSFER_HOST, { targetId }),
    // İzleyici modu: koltuğu bırak (izle) / boş koltuğa otur (oyna). Karar sunucuda.
    spectate: () => socket.emit(EV.SPECTATE),
    takeSeat: () => socket.emit(EV.TAKE_SEAT),
    reportQuestion: (note?: string) => { if (socket.connected) socket.emit(EV.QUESTION_REPORT, { note }) },
    // Unvan tak/kaldır (null = kaldır) — kazanılmış rozetlerden biri olmalı.
    setTitle: (title: BadgeKey | null) => socket.emit(EV.SET_TITLE, { title }),
    /**
     * Kapatmayı SUNUCU yapar (LEAVE_GAME handler'ı removePlayer'dan sonra
     * socket.disconnect(true) çağırıyor). Burada emit'in hemen ardından
     * disconnect() çağırmak yarış yaratıyordu: olay sunucuya varmadan bağlantı
     * kopunca sunucu bunu "ayrıldı" değil "bağlantısı gitti" sayıp 30 sn grace
     * başlatıyor, oyuncu odada kalıyor ve geri bağlanınca koşan maça dönüyordu.
     *
     * thenRejoin: masada başka insan yoksa sunucu odayı siler; kopmayı BEKLEYİP
     * yeniden bağlanmak taze bir lobi verir ("ana sayfaya dön" beklentisi).
     */
    leaveGame: (thenRejoin = false) => {
      intentionalLeave.current = true
      if (thenRejoin) socket.once('disconnect', () => { window.setTimeout(() => socket.connect(), 60) });
      socket.emit(EV.LEAVE_GAME);
    },
    /** Podyumdan lobiye dön: odada kalır, sahiplik değişmez (sunucu: Room.returnToLobby). */
    returnToLobby: () => socket.emit(EV.RETURN_TO_LOBBY),
    rejoinGame: () => socket.connect(),
  }
}
