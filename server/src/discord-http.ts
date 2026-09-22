const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 5_000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function retryDelayMs(response: Response): number {
  const raw = response.headers.get("retry-after")
    ?? response.headers.get("x-ratelimit-reset-after")
    ?? "1";
  const seconds = Number(raw);
  return Number.isFinite(seconds)
    ? Math.max(0, Math.min(MAX_RETRY_DELAY_MS, seconds * 1000))
    : 1000;
}

/**
 * Discord HTTP çağrıları için ortak timeout + 429 retry sınırı.
 * Her denemede yeni AbortController kullanılır; asılı bağlantı auth akışını
 * sonsuza kadar bekletemez.
 */
export async function fetchDiscord(
  input: string | URL | Request,
  init: RequestInit = {},
  options: { timeoutMs?: number; retries?: number } = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const abortFromParent = () => controller.abort(init.signal?.reason);
    if (init.signal?.aborted) abortFromParent();
    else init.signal?.addEventListener("abort", abortFromParent, { once: true });
    const timeout = setTimeout(() => controller.abort(new Error("Discord request timed out")), timeoutMs);

    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      if (response.status !== 429 || attempt === retries) return response;
      await response.body?.cancel();
      await wait(retryDelayMs(response));
    } finally {
      clearTimeout(timeout);
      init.signal?.removeEventListener("abort", abortFromParent);
    }
  }

  throw new Error("Discord request retry loop exhausted");
}
