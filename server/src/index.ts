import { createServer } from "node:http";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "socket.io";
import { BOT_NAMES, scheduleBotAnswers } from "./bots";
import {
  ALLOW_MOCK_AUTH,
  DISCORD_CLIENT_ID,
  DISCORD_OAUTH_REDIRECT_URI,
  HOST,
  IS_PRODUCTION,
  PORT,
  isAllowedProductionOrigin,
} from "./config";
import { exchangeCode, verifyInstanceMembership, verifySession, type SessionUser } from "./auth";
import { Room } from "./rooms";
import { BADGE_KEYS, CARD_TYPES, EMOTE_KEYS, EV, type BadgeKey, type CardType, type EmoteKey, type ToastKey, type ToastPayload } from "../../shared/types";
import { GameError, toToast } from "./errors";
import { clientAddressKey, createRateLimitMiddleware, createSecurityHeaders, FixedWindowRateLimiter } from "./security";
import { normalizeRoomId } from "./room-id";
import { log } from "./logger";
import { createReportsStore } from "./reports";
import { createDailyStore, dailyBoard, dailyDayNumber } from "./daily";
import { createXpStore } from "./xp";
import { addPack, deletePack, getPack, listPacks, parseCsvQuestions, parseJsonQuestions, updatePack, validatePackQuestions, type StoredPack } from "./packs";

const app = express();
app.disable("x-powered-by");
app.use(createSecurityHeaders(IS_PRODUCTION));
// Paket gövdeleri (JSON/CSV metin) varsayılan 100kb sınırını aşabilir.
app.use(express.json({ limit: "256kb" }));
app.use("/auth", createRateLimitMiddleware({ limit: 30, windowMs: 60_000 }));
app.use(["/question-packs", "/api/question-packs"], createRateLimitMiddleware({ limit: 20, windowMs: 60_000 }));
const httpServer = createServer(app);
// "Bu soru hatalı" bildirimleri tek kalıcı dosyaya yazar; test ve
// taşıma için REPORTS_DB_PATH ile yol ezilebilir.
const reports = createReportsStore(process.env.REPORTS_DB_PATH ?? resolve(process.cwd(), "data", "question-reports.db"));
// Günlük meydan okuma sonuçları ayrı tabloda — "günde bir kez" kapısı bunu okur.
const dailyStore = createDailyStore(process.env.DAILY_DB_PATH ?? resolve(process.cwd(), "data", "daily.db"));
// Kalıcı ilerleme (XP/seviye/lig/sezon/seri) tek dosyada; XP_DB_PATH ile ezilebilir.
const xpStore = createXpStore(process.env.XP_DB_PATH ?? resolve(process.cwd(), "data", "xp.db"));
const io = new Server(httpServer, {
  // Discord URL Mapping, public `/api` prefixini origin'e iletirken soyar.
  // Bu yüzden origin standart Socket.IO yolunu dinlemeli; istemci Discord
  // içindeyken dışarıdan `/api/socket.io` yoluna bağlanır.
  path: "/socket.io",
  cors: {
    origin: (origin, callback) => callback(null, !IS_PRODUCTION || isAllowedProductionOrigin(origin)),
    credentials: false,
  },
});
const rooms = new Map<string, Room>();
const socketIpLimiter = new FixedWindowRateLimiter(60, 60_000);
const socketUserLimiter = new FixedWindowRateLimiter(12, 60_000);

function socketError(message: string, code: string): Error {
  const error = new Error(message) as Error & { data?: { code: string } };
  error.data = { code };
  return error;
}

const OAUTH_STATE_COOKIE = "qt-oauth-state";
function cookieValue(header: string | undefined, name: string) {
  if (!header) return "";
  const prefix = `${name}=`;
  return header.split(";").map((item) => item.trim()).find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? "";
}

app.get("/health", (_req, res) => res.json({ ok: true }));

// ── Yönetici: soru bildirimleri paneli ────────────────────────────────────
// `Authorization: Bearer QT_ADMIN_TOKEN` ile açılır; tarayıcı HTML tablo,
// diğer istekler JSON alır. Token ayarlanmadıysa uç 503 döner.
const QT_ADMIN_TOKEN = process.env.QT_ADMIN_TOKEN ?? "";
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.codePointAt(0)};`);

app.get(["/admin/reports", "/api/admin/reports"], (req, res) => {
  if (!QT_ADMIN_TOKEN) return res.status(503).json({ error: "QT_ADMIN_TOKEN ayarlanmadı." });
  const auth = req.headers.authorization ?? "";
  if (auth !== `Bearer ${QT_ADMIN_TOKEN}`) return res.status(401).json({ error: "Yetkisiz." });
  const rows = reports.list();
  if (!req.accepts("html")) return res.json({ reports: rows });
  const trs = rows.map((r) => `<tr><td>${r.id}</td><td>${new Date(r.reportedAt).toISOString()}</td><td>${esc(r.category)}</td><td>${esc(r.questionText)}</td><td>${esc(r.note)}</td><td>${esc(r.userName)}</td></tr>`).join("");
  res.type("html").send(`<!doctype html><meta charset="utf-8"><title>Soru bildirimleri</title>
<style>body{font-family:system-ui;margin:24px;background:#0c1420;color:#dbe7f0}table{border-collapse:collapse;width:100%}td,th{border:1px solid #335;padding:6px 10px;font-size:13px;text-align:left;vertical-align:top}th{background:#16283c}</style>
<h1>Soru bildirimleri (${rows.length})</h1>
<table><tr><th>#</th><th>Tarih</th><th>Kategori</th><th>Soru</th><th>Not</th><th>Bildiren</th></tr>${trs}</table>`);
});

// ── Özel soru paketleri (FAZ 4.4) ─────────────────────────────────────────
// Discord proxy'si /api önekini soyduğu için her iki yol da kayıtlı.
// Listeleme herkese açık; yükleme yalnızca QT_ADMIN_TOKEN ile (mock modda
// yerel geliştirmede açık). Yüklenen içerik Faz 1.4 doğrulayıcı kurallarından
// geçirilir; hata varsa 422 + sorun listesi döner.
const PACK_PATHS = ["/question-packs", "/api/question-packs"];

app.get(PACK_PATHS, (_req, res) => {
  res.json({ packs: listPacks() });
});

/**
 * Paket isteğinin kimliği. Üç kaynak denenir (öncelik sırasıyla):
 *  1) `Bearer QT_ADMIN_TOKEN` → "admin" (operatör; her paketi yönetir)
 *  2) `Bearer <oturum>` → verifySession'dan geçen Discord kullanıcısı
 *  3) ALLOW_MOCK_AUTH'ta `x-dev-id` → socket yoluyla aynı `dev:<id>` kimliği;
 *     başlıksız istekler eski davranışa düşer ("dev").
 * Prod'da geçerli kimlik yoksa null — yazma uçları 401 döner.
 */
function packRequestUser(req: import("express").Request): SessionUser | null {
  const auth = req.headers.authorization ?? "";
  if (auth.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length);
    if (QT_ADMIN_TOKEN && token === QT_ADMIN_TOKEN) {
      return { id: "admin", name: "admin", avatarUrl: null };
    }
    const session = verifySession(token);
    if (session) return session;
  }
  if (!ALLOW_MOCK_AUTH) return null;
  const devId = req.headers["x-dev-id"];
  if (typeof devId === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(devId)) {
    return { id: `dev:${devId}`, name: "dev", avatarUrl: null };
  }
  return { id: "dev", name: "dev", avatarUrl: null };
}

/** Paketi düzenleme/silme hakkı: admin veya oluşturan. Mock modda "dev"
 *  sahipli eski paketler tüm yerel kullanıcılara açıktır. */
function canManagePack(user: SessionUser | null, pack: StoredPack): boolean {
  if (!user) return false;
  if (user.id === "admin" || user.id === pack.createdBy) return true;
  return ALLOW_MOCK_AUTH && pack.createdBy === "dev" && user.id.startsWith("dev:");
}

function parsePackBody(body: unknown): { name: string; questions: ReturnType<typeof parseJsonQuestions> } | { error: string; status: number } {
  const b = body as { name?: unknown; format?: unknown; content?: unknown } | undefined;
  const name = typeof b?.name === "string" ? b.name.trim() : "";
  if (!name) return { error: "name eksik.", status: 400 };
  let questions;
  try {
    questions = b?.format === "csv"
      ? parseCsvQuestions(String(b?.content ?? ""))
      : parseJsonQuestions(b?.format === "text" ? JSON.parse(String(b?.content ?? "")) : b?.content);
  } catch (error) {
    return { error: `İçerik ayrıştırılamadı: ${error instanceof Error ? error.message : error}`, status: 400 };
  }
  return { name, questions };
}

app.post(PACK_PATHS, (req, res) => {
  const user = packRequestUser(req);
  if (!user) {
    if (!QT_ADMIN_TOKEN) return res.status(503).json({ error: "Paket yükleme kapalı (Discord oturumu ya da QT_ADMIN_TOKEN gerekli)." });
    return res.status(401).json({ error: "Yetkisiz — oturum ya da geçerli yönetici belirteci gerekli." });
  }
  const parsed = parsePackBody(req.body);
  if ("error" in parsed) return res.status(parsed.status).json({ error: parsed.error });
  const { errors, warnings } = validatePackQuestions(parsed.questions);
  if (errors.length) return res.status(422).json({ error: "Paket doğrulamadan geçemedi.", errors, warnings });
  res.status(201).json({ pack: addPack(parsed.name, parsed.questions, user.id), warnings });
});

const PACK_ID_PATHS = PACK_PATHS.map((p) => `${p}/:id`);

// Tam içerik (correctIndex dahil) yalnızca sahibine/admin'e açılır — aksi
// halde paketlerin cevap anahtarı herkese sızardı (anti-hile sözleşmesi).
app.get(PACK_ID_PATHS, (req, res) => {
  const pack = getPack(String(req.params.id));
  if (!pack) return res.status(404).json({ error: "Paket bulunamadı." });
  if (!canManagePack(packRequestUser(req), pack)) {
    return res.status(403).json({ error: "Bu paketi yalnızca oluşturan kişi düzenleyebilir." });
  }
  res.json({ pack });
});

app.put(PACK_ID_PATHS, (req, res) => {
  const pack = getPack(String(req.params.id));
  if (!pack) return res.status(404).json({ error: "Paket bulunamadı." });
  if (!canManagePack(packRequestUser(req), pack)) {
    return res.status(403).json({ error: "Bu paketi yalnızca oluşturan kişi düzenleyebilir." });
  }
  const parsed = parsePackBody(req.body);
  if ("error" in parsed) return res.status(parsed.status).json({ error: parsed.error });
  const { errors, warnings } = validatePackQuestions(parsed.questions);
  if (errors.length) return res.status(422).json({ error: "Paket doğrulamadan geçemedi.", errors, warnings });
  res.json({ pack: updatePack(pack.id, parsed.name, parsed.questions), warnings });
});

app.delete(PACK_ID_PATHS, (req, res) => {
  const pack = getPack(String(req.params.id));
  if (!pack) return res.status(404).json({ error: "Paket bulunamadı." });
  if (!canManagePack(packRequestUser(req), pack)) {
    return res.status(403).json({ error: "Bu paketi yalnızca oluşturan kişi silebilir." });
  }
  deletePack(pack.id);
  res.status(204).end();
});

// İstemciden gelen yakalanmamış hataları yapılandırılmış log'a düşürür
// (rate-limitli; cevap gövdesi yok). /api'li takma ad Discord proxy'si için.
app.post(
  ["/client-errors", "/api/client-errors"],
  createRateLimitMiddleware({ limit: 30, windowMs: 60_000 }),
  (req, res) => {
    const body = req.body as { type?: unknown; message?: unknown; stack?: unknown; url?: unknown } | undefined;
    const clip = (v: unknown, max: number) =>
      typeof v === "string" ? v.slice(0, max) : undefined;
    log.warn(
      {
        ip: clientAddressKey(req.headers, req.socket.remoteAddress),
        type: clip(body?.type, 40),
        message: clip(body?.message, 500),
        stack: clip(body?.stack, 2000),
        url: clip(body?.url, 300),
      },
      "istemci hatası raporlandı",
    );
    res.status(204).end();
  },
);

app.get("/auth/discord", (_req, res) => {
  if (!DISCORD_CLIENT_ID) return res.status(503).json({ error: "Discord OAuth henüz yapılandırılmadı." });
  if (!DISCORD_OAUTH_REDIRECT_URI) return res.status(503).json({ error: "PUBLIC_BASE_URL is required for browser OAuth." });
  const state = crypto.randomBytes(32).toString("base64url");
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: DISCORD_OAUTH_REDIRECT_URI.startsWith("https://"),
    path: "/auth/discord",
    maxAge: 10 * 60_000,
  });
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", DISCORD_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", DISCORD_OAUTH_REDIRECT_URI);
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});
app.get("/auth/discord/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!code) return res.status(400).json({ error: "Discord authorization code eksik." });
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const expectedState = cookieValue(req.headers.cookie, OAUTH_STATE_COOKIE);
  res.clearCookie(OAUTH_STATE_COOKIE, { path: "/auth/discord" });
  if (!state || !expectedState || state.length !== expectedState.length
    || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))) {
    return res.status(400).json({ error: "Discord OAuth state validation failed." });
  }
  try {
    const session = await exchangeCode(code, DISCORD_OAUTH_REDIRECT_URI);
    res.json({ session_token: session.session_token, user: session.user });
  } catch (error) {
    log.error({ err: error }, "oauth token değişimi başarısız");
    res.status(502).json({ error: "Discord kimliği doğrulanamadı." });
  }
});

/**
 * Embedded App SDK authorize() code'unu Activity icinden server-side token'a cevirir.
 * /api'li takma ad: Discord proxy'si URL eslemesindeki onek'i soyarak iletir;
 * soymadigi bir surumle karsilasirsak istek yine de karsilanir (ucuz sigorta).
 */
app.post(["/auth/activity/token", "/api/auth/activity/token"], async (req, res) => {
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  if (!code) return res.status(400).json({ error: "Discord authorization code eksik." });
  try {
    res.json(await exchangeCode(code));
  } catch (error) {
    log.error({ err: error }, "activity oauth token değişimi başarısız");
    res.status(502).json({ error: "Discord Activity oturumu dogrulanamadi." });
  }
});

if (IS_PRODUCTION) {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const serverRoot = basename(dirname(moduleDir)) === "dist"
    ? resolve(moduleDir, "../..")
    : resolve(moduleDir, "..");
  const clientDist = resolve(serverRoot, "../client/dist");
  const clientIndex = resolve(clientDist, "index.html");
  if (!existsSync(clientIndex)) {
    throw new Error(`Production client build not found: ${clientIndex}. Run npm run build first.`);
  }
  // Discord Developer Portal, uygulama doğrulamasında kamu gizlilik/koşul URL'leri
  // ister. Dosyalar client/public'ten dist'e kopyalanır; temiz yollar da verelim.
  app.get(["/privacy", "/terms"], (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.sendFile(resolve(clientDist, req.path === "/terms" ? "terms.html" : "privacy.html"));
  });
  app.use(express.static(clientDist, {
    index: "index.html",
    setHeaders: (res, path) => {
      res.setHeader(
        "Cache-Control",
        path.endsWith("index.html") ? "no-cache" : path.includes(`${resolve(clientDist, "assets")}`)
          ? "public, max-age=31536000, immutable"
          : "public, max-age=3600",
      );
    },
  }));
  // React istemci rotaları doğrudan açıldığında index'e düşer; API benzeri
  // bilinmeyen yollar ise HTML 200 yerine gerçek 404 olarak kalır.
  app.get("/{*splat}", (req, res, next) => {
    if (/^\/(?:auth|api|health|socket\.io)(?:\/|$)/.test(req.path)) return next();
    res.setHeader("Cache-Control", "no-cache");
    return res.sendFile(clientIndex);
  });
}

function getRoom(roomId: string) {
  const id = normalizeRoomId(roomId);
  let room = rooms.get(id);
  if (!room) {
    room = new Room(id, () => emitRoom(room!), {});
    room.setQuestionStartedHandler(scheduleBotAnswers);
    room.setProgressStore(xpStore);
    room.setDailyBoardProvider((userId) => dailyBoard(dailyStore, dailyDayNumber(), userId));
    room.onDailyFinished = (entries) => {
      for (const entry of entries) {
        try { dailyStore.record(entry); }
        catch (error) { console.error("[daily] günlük sonuç kaydedilemedi:", error); }
      }
    };
    room.setEmptiedHandler(() => {
      room?.dispose();
      rooms.delete(id);
    });
    rooms.set(id, room);
  }
  return room;
}

function emitRoom(room: Room) {
  // Oyuncular + izleyiciler: herkes kendi bakış açısıyla state alır.
  for (const recipient of room.recipients()) {
    if (recipient.socketId) io.to(recipient.socketId).emit(EV.STATE, room.stateFor(recipient.id, ALLOW_MOCK_AUTH));
  }
}

/** Kullanıcıya gösterilecek mesaj: metin değil ANAHTAR gider, çeviri istemcide yapılır. */
function toast(socketId: string, key: ToastKey, params?: Record<string, string | number>) {
  const payload: ToastPayload = params ? { key, params } : { key };
  io.to(socketId).emit(EV.TOAST, payload);
}

io.use(async (socket, next) => {
  // Reddetmeler sessizce kayboluyordu; istemci yalnızca "sunucuya
  // ulaşılamadı" gördüğü için hata kodunun sunucu logunda izi olmalı.
  const deny = (code: string, message: string) => {
    log.warn(
      {
        code,
        ip: clientAddressKey(socket.handshake.headers, socket.handshake.address),
        origin: socket.handshake.headers.origin,
      },
      "socket bağlantısı reddedildi",
    );
    return next(socketError(message, code));
  };
  const ipKey = clientAddressKey(socket.handshake.headers, socket.handshake.address);
  if (!socketIpLimiter.consume(ipKey).allowed) {
    return deny("RATE_LIMITED", "Çok fazla bağlantı denemesi.");
  }
  // Origin başlığı yalnızca cross-origin tarayıcı isteklerinde bulunur; Discord
  // iframe'i sunucuya same-origin bağlandığından header gelmez (undefined) ve
  // bu durum geçerli bağlantıdır. Header varsa izinli origin olmalı.
  const origin = socket.handshake.headers.origin;
  if (
    IS_PRODUCTION
    && typeof origin === "string"
    && origin.length > 0
    && !isAllowedProductionOrigin(origin)
  ) {
    return deny("ORIGIN_DENIED", "Socket origin is not allowed.");
  }
  const auth = socket.handshake.auth as { sessionToken?: string; devName?: string; devId?: string; instanceId?: string };
  const session = auth.sessionToken ? verifySession(auth.sessionToken) : null;
  let user: SessionUser | null = session;
  if (!user && ALLOW_MOCK_AUTH) {
    const name = (auth.devName || "Sen").slice(0, 24);
    const stableId = typeof auth.devId === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(auth.devId)
      ? auth.devId
      : socket.id;
    user = { id: `dev:${stableId}`, name, avatarUrl: null };
  }
  if (!user) return deny("AUTH_REQUIRED", "Discord oturumu gerekli.");
  if (!socketUserLimiter.consume(user.id).allowed) {
    return deny("RATE_LIMITED", "Çok fazla bağlantı denemesi.");
  }
  if (!ALLOW_MOCK_AUTH) {
    // instanceId zorunlu: gönderilmezse doğrulama "atlanmış" olmaz, bağlantı reddedilir.
    if (
      typeof auth.instanceId !== "string"
      || !/^[A-Za-z0-9_-]{1,128}$/.test(auth.instanceId)
    ) {
      return deny("INSTANCE_REQUIRED", "Activity instance bilgisi eksik.");
    }
    if (!(await verifyInstanceMembership(auth.instanceId, user.id))) {
      log.warn({ userId: user.id, instanceId: auth.instanceId }, "INSTANCE_DENIED ayrıntı");
      return deny("INSTANCE_DENIED", "Bu Discord Activity odasına erişimin doğrulanamadı.");
    }
    // Oyuncu ancak üyeliği doğrulanan instance'ın odasında oynayabilir;
    // istemcinin beyan ettiği roomId üretimde dikkate alınmaz.
    socket.data.roomId = auth.instanceId;
    socket.data.sessionToken = auth.sessionToken;
    socket.data.instanceId = auth.instanceId;
  }
  socket.data.user = user;
  next();
});

io.on("connection", (socket) => {
  const user = socket.data.user as SessionUser;
  const roomId = typeof socket.data.roomId === "string"
    ? socket.data.roomId
    : typeof socket.handshake.auth.roomId === "string" ? socket.handshake.auth.roomId : "ana-lobi";
  const room = getRoom(roomId);
  // Oyuncu ya da izleyici olarak katıl: koltuk varsa oyuncu, masa doluysa (8)
  // reddetmek yerine izleyici. previousSocketId eski bağlantıyı düşürmek için.
  let joined: { role: "player" | "spectator"; previousSocketId: string | null };
  try {
    joined = room.join({ ...user, socketId: socket.id, isBot: false });
  } catch (error) {
    const t = toToast(error, "err.joinFailed"); toast(socket.id, t.key, t.params);
    socket.disconnect();
    return;
  }
  if (joined.previousSocketId && joined.previousSocketId !== socket.id) {
    io.sockets.sockets.get(joined.previousSocketId)?.disconnect(true);
  }
  socket.join(room.id);
  socket.emit(EV.STATE, room.stateFor(user.id, ALLOW_MOCK_AUTH));

  // Bir doğrulanmış socket sınırsız kontrol paketiyle tüm odaya state
  // üretemez. İlk iki taşma sessizce düşer; ısrarlı spam bağlantıyı kapatır.
  const eventLimiter = new FixedWindowRateLimiter(80, 5_000, 1);
  let rateViolations = 0;
  socket.use((_packet, next) => {
    if (eventLimiter.consume("events").allowed) return next();
    rateViolations += 1;
    if (rateViolations >= 3) socket.disconnect(true);
  });

  // Üyelik yalnız handshake anında sonsuza kadar geçerli sayılmaz. Oturum süresi
  // veya Activity üyeliği biterse en geç bu pencere içinde socket düşer.
  let membershipCheckRunning = false;
  const membershipTimer = !ALLOW_MOCK_AUTH ? setInterval(() => {
    if (membershipCheckRunning || !socket.connected) return;
    membershipCheckRunning = true;
    void (async () => {
      const sessionToken = socket.data.sessionToken as string | undefined;
      const instanceId = socket.data.instanceId as string | undefined;
      if (!sessionToken || !verifySession(sessionToken)) {
        socket.emit(EV.AUTH_REQUIRED);
        socket.disconnect(true);
        return;
      }
      if (!instanceId || !(await verifyInstanceMembership(instanceId, user.id))) {
        socket.disconnect(true);
      }
    })().finally(() => { membershipCheckRunning = false; });
  }, 60_000) : null;
  membershipTimer?.unref();

  socket.on(EV.EMOTE, (payload: unknown) => {
    const emote = (payload as { emote?: unknown } | undefined)?.emote;
    if (typeof emote !== "string" || !(EMOTE_KEYS as readonly string[]).includes(emote)) return;
    // Hız sınırı OYUNCUDA tutulur (odadaki kayıtta): socket'te tutulsa
    // yeniden bağlanmak sınırı sıfırlar, spam kapısı aralanırdı.
    const player = room.players.get(user.id);
    if (!player) return;
    const now = Date.now();
    if (now - player.lastEmoteAt < 700) return;
    player.lastEmoteAt = now;
    io.to(room.id).emit(EV.EMOTE, { playerId: user.id, emote: emote as EmoteKey, at: now });
  });

  socket.on(EV.SET_MODE, (payload: unknown) => {
    try {
      room.setGameMode(user.id, (payload as { mode?: unknown } | undefined)?.mode);
    } catch (error) {
      const t = toToast(error, "err.modeFailed"); toast(socket.id, t.key, t.params);
    }
  });

  socket.on(EV.SET_TEAM, (payload: unknown) => {
    try {
      const data = payload as { targetId?: unknown; team?: unknown } | undefined;
      room.setTeam(user.id, data?.targetId, data?.team);
    } catch (error) {
      const t = toToast(error, "err.teamFailed"); toast(socket.id, t.key, t.params);
    }
  });

  socket.on(EV.TEAM_SHUFFLE, () => {
    try {
      room.shuffleTeams(user.id);
    } catch (error) {
      const t = toToast(error, "err.teamFailed"); toast(socket.id, t.key, t.params);
    }
  });

  socket.on(EV.KICK, (payload: unknown) => {
    try {
      const kickedSocketId = room.kick(user.id, (payload as { targetId?: unknown } | undefined)?.targetId);
      if (kickedSocketId) {
        toast(kickedSocketId, "info.kicked");
        io.sockets.sockets.get(kickedSocketId)?.disconnect(true);
      }
    } catch (error) {
      const t = toToast(error, "err.kickFailed"); toast(socket.id, t.key, t.params);
    }
  });

  socket.on(EV.TRANSFER_HOST, (payload: unknown) => {
    try {
      room.transferHost(user.id, (payload as { targetId?: unknown } | undefined)?.targetId);
    } catch (error) {
      const t = toToast(error, "err.transferFailed"); toast(socket.id, t.key, t.params);
    }
  });

  // Koltuğu bırakıp izleyiciye geç (oynamadan izle).
  socket.on(EV.SPECTATE, () => room.becomeSpectator(user.id));
  // İzleyiciyken boş koltuğa otur; masa doluysa bilgilendir.
  socket.on(EV.TAKE_SEAT, () => {
    try {
      room.becomePlayer({ ...user, socketId: socket.id });
    } catch (error) {
      const t = toToast(error, "err.tableFull"); toast(socket.id, t.key, t.params);
    }
  });

  socket.on(EV.START, (payload: unknown) => {
    try {
      if (ALLOW_MOCK_AUTH && room.players.size === 1) {
        const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
        room.addBot(botName);
      }
      // Mod, SET_MODE ile paylaşılan ve hazır onaylarını sıfırlayan masa ayarıdır.
      // START paketindeki istemci beyanı bu yetkili ayarı atlayamaz.
      // { daily: true } → Günlük Meydan Okuma: herkes için aynı 5 soru,
      // günde bir kez. Bugün tamamlayan koltuktan iner (izleyici).
      room.start(user.id, room.gameMode, {
        daily: (payload as { daily?: unknown } | undefined)?.daily === true,
        completed: (playerId) => dailyStore.has(playerId, dailyDayNumber()),
      });
      // Botları BURADA zamanlama: start() henüz countdown fazında, soru başlamadı.
      // Her soru başında onQuestionStarted -> scheduleBotAnswers otomatik tetikleniyor
      // (setQuestionStartedHandler, yukarıda). Elle çağrı round 0'da çifte setTimeout
      // kurup botları tasarımdan erken cevaplatıyordu.
    } catch (error) {
      const t = toToast(error, "err.startFailed"); toast(socket.id, t.key, t.params);
    }
  });
  socket.on(EV.ANSWER, (choice: unknown) => room.answer(user.id, Number(choice)));
  socket.on(EV.CIRCLE_ANSWER, (answer: unknown) => room.answerCircle(user.id, typeof answer === "string" ? answer : ""));
  socket.on(EV.WORD_ANSWER, (answer: unknown) => room.wordAnswer(user.id, typeof answer === "string" ? answer : ""));
  socket.on(EV.WORD_LETTER, () => room.wordLetter(user.id));
  socket.on(EV.BET, (amount: unknown) => room.placeBet(user.id, Number(amount)));
  socket.on(EV.USE_CARD, (payload: unknown) => {
    try {
      const body = (payload ?? {}) as { type?: unknown; targetId?: unknown };
      const type = typeof body.type === "string" && (CARD_TYPES as readonly string[]).includes(body.type) ? body.type as CardType : null;
      if (!type) throw new GameError("err.invalidInput");
      room.useCard(user.id, type, typeof body.targetId === "string" ? body.targetId : undefined);
    } catch (error) {
      const t = toToast(error, "err.cardFailed"); toast(socket.id, t.key, t.params);
    }
  });
  socket.on(EV.ADD_BOT, () => {
    if (!ALLOW_MOCK_AUTH || room.hostId !== user.id) return;
    try {
      room.addBot(BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]);
      // Elle zamanlama yok: bot normalde lobide eklenir, maç başlayınca
      // onQuestionStarted onu her soruda zaten zamanlar. (Maç ortasında eklenirse
      // o anki soruyu atlar, sıradakinden oynar — kabul edilebilir.)
    } catch (error) {
      const t = toToast(error, "err.botFailed"); toast(socket.id, t.key, t.params);
    }
  });
  socket.on(EV.READY, (payload: unknown) => {
    room.setReady(user.id, Boolean(payload));
  });
  socket.on(EV.SET_QUESTION_COUNT, (payload: unknown) => {
    try {
      room.setQuestionCount(user.id, (payload as { count?: unknown } | undefined)?.count);
    } catch (error) {
      const t = toToast(error, "err.countFailed"); toast(socket.id, t.key, t.params);
    }
  });
  socket.on(EV.SET_DIFFICULTY, (payload: unknown) => {
    try {
      room.setDifficulty(user.id, (payload as { difficulty?: unknown } | undefined)?.difficulty ?? null);
    } catch (error) {
      const t = toToast(error, "err.difficultyFailed"); toast(socket.id, t.key, t.params);
    }
  });
  socket.on(EV.SET_QUESTION_TIME, (payload: unknown) => {
    try {
      room.setQuestionTime(user.id, (payload as { ms?: unknown } | undefined)?.ms ?? null);
    } catch (error) {
      const t = toToast(error, "err.timeFailed"); toast(socket.id, t.key, t.params);
    }
  });
  socket.on(EV.SET_SPEED_BONUS, (payload: unknown) => {
    try {
      room.setTableFlag(user.id, "speedBonus", (payload as { value?: unknown } | undefined)?.value);
    } catch (error) {
      const t = toToast(error, "err.settingFailed"); toast(socket.id, t.key, t.params);
    }
  });
  socket.on(EV.SET_IMAGE_ONLY, (payload: unknown) => {
    try {
      room.setTableFlag(user.id, "imageOnly", (payload as { value?: unknown } | undefined)?.value);
    } catch (error) {
      const t = toToast(error, "err.settingFailed"); toast(socket.id, t.key, t.params);
    }
  });
  socket.on(EV.SET_CATEGORIES, (payload: unknown) => {
    try {
      room.setCategories(user.id, payload);
    } catch (error) {
      const t = toToast(error, "err.categoryFailed"); toast(socket.id, t.key, t.params);
    }
  });

  socket.on(EV.SET_PACK, (payload: unknown) => {
    try {
      room.setPack(user.id, (payload as { packId?: unknown } | undefined)?.packId);
    } catch (error) {
      const t = toToast(error, "err.packFailed"); toast(socket.id, t.key, t.params);
    }
  });
  socket.on(EV.LEAVE_GAME, () => {
    room.removePlayer(user.id);
    socket.leave(room.id);
    socket.disconnect(true);
  });
  socket.on(EV.RETURN_TO_LOBBY, () => room.returnToLobby(user.id));
  socket.on(EV.REMATCH, () => {
    try {
      room.voteRematch(user.id);
    } catch (error) {
      const t = toToast(error, "err.rematchPhase"); toast(socket.id, t.key, t.params);
    }
  });
  socket.on(EV.PREDICT, (payload: unknown) => {
    const targetId = typeof payload === "object" && payload !== null ? (payload as { targetId?: unknown }).targetId : undefined;
    try {
      room.predict(user.id, targetId);
    } catch (error) {
      const t = toToast(error, "err.predictFailed"); toast(socket.id, t.key, t.params);
    }
  });
  socket.on(EV.PLAY_AGAIN, () => {
    if (room.phase !== "podium") return;
    try {
      room.start(user.id, room.gameMode);
    } catch (error) {
      const t = toToast(error, "err.startFailed"); toast(socket.id, t.key, t.params);
    }
  });
  socket.on(EV.QUESTION_REPORT, (payload: unknown) => {
    // Soru kimliği istemciden GELMEZ — güncel soru sunucudan çözülür; böylece
    // sahte question_id ile tablo kirletilemez. Yalnız aktif oyun fazında
    // kabul edilir; Çember'in Question'ı yoktur (currentQuestion null döner).
    const question = room.phase !== "lobby" && room.phase !== "podium" ? room.currentQuestion() : null;
    if (!question) { toast(socket.id, "report.failed"); return; }
    const note = typeof (payload as { note?: unknown } | undefined)?.note === "string"
      ? (payload as { note: string }).note : "";
    try {
      const { duplicate } = reports.report({
        roomId: room.id,
        userId: user.id,
        userName: user.name,
        questionId: question.id,
        questionText: question.text,
        category: question.category,
        note,
      });
      toast(socket.id, duplicate ? "report.duplicate" : "report.sent");
    } catch (error) {
      log.error({ err: error }, "soru bildirimi yazılamadı");
      toast(socket.id, "report.failed");
    }
  });
  // Unvan: { title: BadgeKey | null } — doğruluk BADGE_KEYS kümesi + depodaki
  // kazanılmış-rozet kontrolüyle sağlanır (kazanılmamış rozet takılamaz).
  socket.on(EV.SET_TITLE, (payload: unknown) => {
    const raw = (payload as { title?: unknown } | undefined)?.title;
    const title = typeof raw === "string" && (BADGE_KEYS as readonly string[]).includes(raw)
      ? (raw as BadgeKey) : null;
    try {
      room.setTitle(user.id, title);
    } catch (error) {
      const t = toToast(error, "err.title"); toast(socket.id, t.key, t.params);
    }
  });
  // socket.id koşulu: eski bağlantının geç gelen disconnect'i yeni bağlantıyı düşüremez.
  // Kullanıcı ya oyuncu ya izleyici; ilgisiz olan çağrı erken döner (ikisi güvenli).
  socket.on("disconnect", () => {
    if (membershipTimer) clearInterval(membershipTimer);
    room.markDisconnected(user.id, socket.id);
    room.removeSpectator(user.id, socket.id);
  });
});

httpServer.listen(PORT, HOST, () => log.info({ host: HOST, port: PORT }, "server dinliyor"));

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, "kapatma sinyali alındı; bağlantılar kontrollü kapatılıyor");

  for (const room of rooms.values()) room.dispose();
  rooms.clear();

  let finished = false;
  const finish = (error?: Error) => {
    if (finished) return;
    finished = true;
    clearTimeout(forceTimer);
    if (error) {
      log.error({ err: error }, "kapanış hatası");
      process.exitCode = 1;
    } else {
      log.info("kontrollü kapanış tamamlandı");
      process.exitCode = 0;
    }
  };
  const forceTimer = setTimeout(() => {
    log.error("kapanış zaman aşımına uğradı; açık bağlantılar zorla kapatılıyor");
    httpServer.closeAllConnections();
    process.exit(1);
  }, 10_000);
  forceTimer.unref();

  // Socket.IO istemcilerini önce düşürür; bağlı HTTP sunucusunu da kapatabildiği
  // için callback'te listening durumunu yeniden kontrol ederiz.
  io.close(() => {
    if (!httpServer.listening) return finish();
    httpServer.close((error) => finish(error ?? undefined));
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
