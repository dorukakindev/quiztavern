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
import { EMOTE_KEYS, EV, type EmoteKey, type ToastKey, type ToastPayload } from "../../shared/types";
import { toToast } from "./errors";
import { clientAddressKey, createRateLimitMiddleware, createSecurityHeaders, FixedWindowRateLimiter } from "./security";
import { normalizeRoomId } from "./room-id";

const app = express();
app.disable("x-powered-by");
app.use(createSecurityHeaders(IS_PRODUCTION));
app.use(express.json());
app.use("/auth", createRateLimitMiddleware({ limit: 30, windowMs: 60_000 }));
const httpServer = createServer(app);
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
    console.error("[oauth]", error);
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
    console.error("[activity oauth]", error);
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
  const ipKey = clientAddressKey(socket.handshake.headers, socket.handshake.address);
  if (!socketIpLimiter.consume(ipKey).allowed) {
    return next(socketError("Çok fazla bağlantı denemesi.", "RATE_LIMITED"));
  }
  if (IS_PRODUCTION && !isAllowedProductionOrigin(socket.handshake.headers.origin)) {
    return next(socketError("Socket origin is not allowed.", "ORIGIN_DENIED"));
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
  if (!user) return next(socketError("Discord oturumu gerekli.", "AUTH_REQUIRED"));
  if (!socketUserLimiter.consume(user.id).allowed) {
    return next(socketError("Çok fazla bağlantı denemesi.", "RATE_LIMITED"));
  }
  if (!ALLOW_MOCK_AUTH) {
    // instanceId zorunlu: gönderilmezse doğrulama "atlanmış" olmaz, bağlantı reddedilir.
    if (
      typeof auth.instanceId !== "string"
      || !/^[A-Za-z0-9_-]{1,128}$/.test(auth.instanceId)
    ) {
      return next(socketError("Activity instance bilgisi eksik.", "INSTANCE_REQUIRED"));
    }
    if (!(await verifyInstanceMembership(auth.instanceId, user.id))) {
      return next(socketError("Bu Discord Activity odasına erişimin doğrulanamadı.", "INSTANCE_DENIED"));
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

  socket.on(EV.START, () => {
    try {
      if (ALLOW_MOCK_AUTH && room.players.size === 1) {
        const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
        room.addBot(botName);
      }
      // Mod, SET_MODE ile paylaşılan ve hazır onaylarını sıfırlayan masa ayarıdır.
      // START paketindeki istemci beyanı bu yetkili ayarı atlayamaz.
      room.start(user.id, room.gameMode);
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
  socket.on(EV.BET, (amount: unknown) => room.placeBet(user.id, Number(amount)));
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
  socket.on(EV.SET_CATEGORIES, (payload: unknown) => {
    try {
      room.setCategories(user.id, payload);
    } catch (error) {
      const t = toToast(error, "err.categoryFailed"); toast(socket.id, t.key, t.params);
    }
  });
  socket.on(EV.LEAVE_GAME, () => {
    room.removePlayer(user.id);
    socket.leave(room.id);
    socket.disconnect(true);
  });
  socket.on(EV.PLAY_AGAIN, () => {
    if (room.phase !== "podium") return;
    try {
      room.start(user.id, room.gameMode);
    } catch (error) {
      const t = toToast(error, "err.startFailed"); toast(socket.id, t.key, t.params);
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

httpServer.listen(PORT, HOST, () => console.log(`[server] http://${HOST}:${PORT}`));

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} alındı; bağlantılar kontrollü kapatılıyor.`);

  for (const room of rooms.values()) room.dispose();
  rooms.clear();

  let finished = false;
  const finish = (error?: Error) => {
    if (finished) return;
    finished = true;
    clearTimeout(forceTimer);
    if (error) {
      console.error("[server] kapanış hatası:", error);
      process.exitCode = 1;
    } else {
      console.log("[server] kontrollü kapanış tamamlandı.");
      process.exitCode = 0;
    }
  };
  const forceTimer = setTimeout(() => {
    console.error("[server] kapanış zaman aşımına uğradı; açık bağlantılar zorla kapatılıyor.");
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
