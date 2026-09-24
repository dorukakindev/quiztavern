import type { NextFunction, Request, RequestHandler, Response } from "express";

type RateDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

/**
 * Bağımlılıksız, bellek sınırı olan sabit pencereli hız sınırlayıcı.
 * Triviara tek süreç olarak çalışırken auth uçlarını Discord API abuse'una
 * karşı korur. Çok süreçli dağıtımda bu sınıfın paylaşımlı store'a taşınması gerekir.
 */
export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();
  private operations = 0;

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly maxEntries = 10_000,
  ) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error("rate limit must be a positive integer");
    if (!Number.isFinite(windowMs) || windowMs < 1) throw new Error("rate window must be positive");
  }

  consume(key: string, now = Date.now()): RateDecision {
    this.operations += 1;
    if (this.operations % 256 === 0 || this.entries.size >= this.maxEntries) this.prune(now);

    let entry = this.entries.get(key);
    if (!entry || now >= entry.resetAt) {
      if (!entry && this.entries.size >= this.maxEntries) {
        const oldest = this.entries.keys().next().value as string | undefined;
        if (oldest) this.entries.delete(oldest);
      }
      entry = { count: 0, resetAt: now + this.windowMs };
      this.entries.set(key, entry);
    }

    const allowed = entry.count < this.limit;
    if (allowed) entry.count += 1;
    const remaining = Math.max(0, this.limit - entry.count);
    return {
      allowed,
      limit: this.limit,
      remaining,
      resetAt: entry.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  private prune(now: number) {
    for (const [key, entry] of this.entries) {
      if (now >= entry.resetAt) this.entries.delete(key);
    }
  }
}

function isLoopback(address: string): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

/** Cloudflare Tunnel aynı makineden bağlanır; dış bağlantının sahte CF başlığına güvenilmez. */
export function clientAddressKey(headers: Record<string, unknown>, remoteAddress?: string): string {
  const remote = remoteAddress ?? "unknown";
  const loopbackRemote = isLoopback(remote);
  const cloudflareIp = headers["cf-connecting-ip"];
  if (
    loopbackRemote
    && typeof cloudflareIp === "string"
    && /^[0-9a-fA-F:.]{2,64}$/.test(cloudflareIp)
  ) {
    return `cf:${cloudflareIp}`;
  }
  // Aynı makinedeki başka bir ters proxy (nginx/caddy, TUNNEL.md alternatifi)
  // de remote adresini 127.0.0.1'e çevirir; XFF olmadan tüm istemciler aynı
  // `remote:127.0.0.1` anahtarını paylaşıp ortak limit kovasına düşer. En sağ
  // XFF değeri en içteki proxy'nin gördüğü adrestir.
  const xff = headers["x-forwarded-for"];
  if (loopbackRemote && typeof xff === "string") {
    const last = xff.split(",").pop()?.trim() ?? "";
    if (/^[0-9a-fA-F:.]{2,64}$/.test(last)) return `xff:${last}`;
  }
  return `remote:${remote}`;
}

function requestClientKey(req: Request): string {
  return clientAddressKey(req.headers, req.socket.remoteAddress);
}

export function createRateLimitMiddleware(options: {
  limit: number;
  windowMs: number;
  maxEntries?: number;
}): RequestHandler {
  const limiter = new FixedWindowRateLimiter(options.limit, options.windowMs, options.maxEntries);
  return (req, res, next) => {
    const decision = limiter.consume(requestClientKey(req));
    res.setHeader("RateLimit-Limit", String(decision.limit));
    res.setHeader("RateLimit-Remaining", String(decision.remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(decision.resetAt / 1000)));
    if (decision.allowed) return next();
    res.setHeader("Retry-After", String(decision.retryAfterSeconds));
    return res.status(429).json({ error: "Çok fazla doğrulama isteği. Lütfen kısa süre sonra tekrar deneyin." });
  };
}

export function contentSecurityPolicy(production: boolean): string {
  const localConnectSources = production
    ? ""
    : " http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:*";
  return `default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https://cdn.discordapp.com; media-src 'self' blob:; connect-src 'self'${localConnectSources} https://discord.com https://*.discord.com https://*.discordsays.com wss://*.discordsays.com https://*.trycloudflare.com wss://*.trycloudflare.com; form-action 'self' https://discord.com; frame-ancestors https://discord.com https://*.discord.com https://*.discordapp.com`;
}

/** API başlıkları; Discord Activity iframe'ini engelleyecek global frame policy uygulanmaz. */
export function createSecurityHeaders(production: boolean): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    // X-Frame-Options/DENY veya frame-ancestors 'none' Discord Activity'yi
    // tamamen kırar. Yalnız Discord yüzeylerinin çerçevelemesine izin verilir.
    res.setHeader("Content-Security-Policy", contentSecurityPolicy(production));
    if (production) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
  };
}
