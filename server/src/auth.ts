import crypto from "node:crypto";
import {
  DISCORD_BOT_TOKEN,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  SESSION_SECRET,
} from "./config";
import { fetchDiscord } from "./discord-http";

export interface SessionUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface SessionPayload {
  user: SessionUser;
  exp: number;
}

const SESSION_TTL_MS = 6 * 3600_000;

const hmac = (data: string) =>
  crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");

function signSession(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${hmac(data)}`;
}

export function verifySession(token: string): SessionUser | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(data);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload: SessionPayload = JSON.parse(
      Buffer.from(data, "base64url").toString("utf-8")
    );
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    return payload.user;
  } catch {
    return null;
  }
}

/**
 * Discord OAuth akışının sunucu ayağı: authorize() ile alınan code burada
 * token'a çevrilir (client secret tarayıcıya asla inmez), kullanıcı Discord'dan
 * doğrulanır ve socket bağlantılarında kullanılacak kısa ömürlü, imzalı bir
 * oyun oturumu üretilir. Böylece her reconnect'te Discord API'sine gidilmez.
 */
export async function exchangeCode(code: string, redirectUri?: string) {
  const body = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    client_secret: DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
  });
  if (redirectUri) body.set("redirect_uri", redirectUri);
  const tokenRes = await fetchDiscord("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenRes.ok) throw new Error(`token exchange: ${tokenRes.status}`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  // Kimliği istemcinin beyanından değil, token'ın sahibinden al
  const meRes = await fetchDiscord("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!meRes.ok) throw new Error(`users/@me: ${meRes.status}`);
  const me = (await meRes.json()) as {
    id: string;
    username: string;
    global_name: string | null;
    avatar: string | null;
  };

  const user: SessionUser = {
    id: me.id,
    name: me.global_name || me.username,
    // cdn.discordapp.com Discord'un CSP istisnasındadır, Activity içinden yüklenebilir
    avatarUrl: me.avatar
      ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64`
      : null,
  };

  return {
    access_token,
    session_token: signSession({ user, exp: Date.now() + SESSION_TTL_MS }),
    user,
  };
}

// --- Activity Instance doğrulaması ---------------------------------------
// Rastgele instanceId ile başka odaya sızmayı engeller. Önbellek kuralı:
// 1) önbellekte kullanıcı VARSA kabul et,
// 2) yoksa Discord'dan BİR KEZ taze liste çek (yeni katılan reddedilmesin),
// 3) taze listede de yoksa reddet. API hatasında fail-closed.

const instanceCache = new Map<string, { users: Set<string>; fetchedAt: number }>();
const negativeMembershipCache = new Map<string, number>();
const instanceFetches = new Map<string, Promise<Set<string> | null>>();
const INSTANCE_CACHE_MS = 45_000;
const NEGATIVE_MEMBERSHIP_MS = 10_000;
const MAX_CONCURRENT_INSTANCE_FETCHES = 12;
let activeInstanceFetches = 0;

async function fetchInstanceUsers(instanceId: string): Promise<Set<string> | null> {
  const res = await fetchDiscord(
    `https://discord.com/api/v10/applications/${DISCORD_CLIENT_ID}/activity-instances/${encodeURIComponent(instanceId)}`,
    { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } }
  );
  if (res.status === 404) return null; // instance yok ya da kapanmış
  if (!res.ok) throw new Error(`activity-instances: ${res.status}`);
  const data = (await res.json()) as { users?: string[] };
  const users = new Set((data.users ?? []).map(String));
  // Budama: kapanan instance'lar cache'te sonsuza dek birikmesin. Bayat
  // girdiler zaten kabul için kullanılmıyor; bu yalnızca bellek hijyeni.
  const now = Date.now();
  for (const [key, entry] of instanceCache) {
    if (now - entry.fetchedAt > INSTANCE_CACHE_MS * 4) instanceCache.delete(key);
  }
  for (const [key, until] of negativeMembershipCache) {
    if (now >= until) negativeMembershipCache.delete(key);
  }
  instanceCache.set(instanceId, { users, fetchedAt: now });
  return users;
}

async function fetchInstanceUsersDeduplicated(instanceId: string): Promise<Set<string> | null> {
  const existing = instanceFetches.get(instanceId);
  if (existing) return existing;
  if (activeInstanceFetches >= MAX_CONCURRENT_INSTANCE_FETCHES) {
    throw new Error("too many concurrent Activity Instance verifications");
  }
  activeInstanceFetches += 1;
  const request = fetchInstanceUsers(instanceId).finally(() => {
    activeInstanceFetches -= 1;
    instanceFetches.delete(instanceId);
  });
  instanceFetches.set(instanceId, request);
  return request;
}

export async function verifyInstanceMembership(
  instanceId: string,
  userId: string
): Promise<boolean> {
  // Fail-closed: doğrulama yapılamıyorsa erişim de yok. Bot token'sız
  // "geç kabul et" davranışı, rastgele instanceId ile odaya sızma kapısıdır.
  if (!DISCORD_BOT_TOKEN || !DISCORD_CLIENT_ID) {
    console.error(
      "[instance] DISCORD_BOT_TOKEN/CLIENT_ID eksik — doğrulama yapılamadı, bağlantı REDDEDİLDİ."
    );
    return false;
  }
  const now = Date.now();
  const negativeKey = `${instanceId}\u0000${userId}`;
  if ((negativeMembershipCache.get(negativeKey) ?? 0) > now) return false;
  const cached = instanceCache.get(instanceId);
  if (
    cached &&
    now - cached.fetchedAt < INSTANCE_CACHE_MS &&
    cached.users.has(userId)
  ) {
    return true;
  }
  try {
    const fresh = await fetchInstanceUsersDeduplicated(instanceId);
    const allowed = fresh !== null && fresh.has(userId);
    if (allowed) negativeMembershipCache.delete(negativeKey);
    else negativeMembershipCache.set(negativeKey, Date.now() + NEGATIVE_MEMBERSHIP_MS);
    return allowed;
  } catch (err) {
    console.error("[instance] doğrulama hatası:", err);
    return false;
  }
}
