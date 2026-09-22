import assert from "node:assert/strict";
import { fetchDiscord } from "../src/discord-http";
import { Room } from "../src/rooms";
import { clientAddressKey, contentSecurityPolicy, FixedWindowRateLimiter } from "../src/security";
import { normalizeRoomId } from "../src/room-id";

let passed = 0;
async function check(label: string, test: () => void | Promise<void>) {
  await test();
  passed += 1;
  console.log(`  ✓ ${label}`);
}

await check("rate limiter sınırı uygular ve pencere sonunda sıfırlanır", () => {
  const limiter = new FixedWindowRateLimiter(2, 1000);
  assert.equal(limiter.consume("ip", 100).allowed, true);
  assert.equal(limiter.consume("ip", 200).allowed, true);
  const blocked = limiter.consume("ip", 300);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(limiter.consume("ip", 1100).allowed, true);
});

await check("uzun Discord instance kimlikleri kesilmeden ve çakışmadan oda anahtarına dönüşür", () => {
  const prefix = "instance-" + "a".repeat(40);
  const first = `${prefix}-first`;
  const second = `${prefix}-second`;
  assert.equal(normalizeRoomId(first), first);
  assert.equal(normalizeRoomId(second), second);
  assert.notEqual(normalizeRoomId("room/a"), normalizeRoomId("room?a"));
});

await check("üretim CSP'si Discord çerçevesini korur ve yerel servis hedeflerini dışarıda bırakır", () => {
  const production = contentSecurityPolicy(true);
  const development = contentSecurityPolicy(false);
  assert.match(production, /frame-ancestors https:\/\/discord\.com/);
  assert.doesNotMatch(production, /localhost|127\.0\.0\.1/);
  assert.match(development, /localhost/);
  assert.match(development, /127\.0\.0\.1/);
});

await check("oda kapatılınca bekleyen bot işi iptal edilir", async () => {
  const room = new Room("timer-test", () => undefined);
  let ran = false;
  room.scheduleBotTask(() => { ran = true; }, 10);
  room.dispose();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(ran, false);
});

await check("sunucu mod başına kategori sınırını yetkili olarak uygular", () => {
  const room = new Room("category-limit", () => undefined);
  room.addPlayer({ id: "host", name: "Host", avatarUrl: null, socketId: "socket:host", isBot: false });
  const classicNames = room.stateFor("host", true).availableCategories
    .filter((category) => category.classicCount > 0)
    .slice(0, 3)
    .map((category) => category.name);
  assert.equal(classicNames.length, 3);
  room.setCategories("host", classicNames);
  assert.equal(room.categorySelection.length, 3);
  room.setGameMode("host", "lightning");
  assert.equal(room.categorySelection.length, 1);
  room.setCategories("host", classicNames);
  assert.equal(room.categorySelection.length, 1);
  room.dispose();
});

await check("aynı ready değeri tekrar gönderilince state yayını üretilmez", () => {
  let broadcasts = 0;
  const room = new Room("ready-noop", () => { broadcasts += 1; });
  room.addPlayer({ id: "host", name: "Host", avatarUrl: null, socketId: "socket:host", isBot: false });
  const afterJoin = broadcasts;
  for (let i = 0; i < 1000; i += 1) room.setReady("host", false);
  assert.equal(broadcasts, afterJoin);
  room.setReady("host", true);
  const afterChange = broadcasts;
  for (let i = 0; i < 1000; i += 1) room.setReady("host", true);
  assert.equal(broadcasts, afterChange);
  room.dispose();
});

await check("dış bağlantı sahte CF-Connecting-IP ile limiter anahtarını değiştiremez", () => {
  const first = clientAddressKey({ "cf-connecting-ip": "1.1.1.1" }, "10.0.0.5");
  const second = clientAddressKey({ "cf-connecting-ip": "8.8.8.8" }, "10.0.0.5");
  assert.equal(first, second);
  assert.equal(clientAddressKey({ "cf-connecting-ip": "1.1.1.1" }, "127.0.0.1"), "cf:1.1.1.1");
});

const originalFetch = globalThis.fetch;
try {
  await check("Discord 429 yanıtını Retry-After sonrasında yeniden dener", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return calls === 1
        ? new Response("limited", { status: 429, headers: { "Retry-After": "0" } })
        : new Response("ok", { status: 200 });
    };
    const response = await fetchDiscord("https://discord.test/endpoint", {}, { timeoutMs: 100, retries: 1 });
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
  });

  await check("Discord isteğini süre dolunca iptal eder", async () => {
    globalThis.fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    });
    await assert.rejects(
      fetchDiscord("https://discord.test/hang", {}, { timeoutMs: 20, retries: 0 }),
      /timed out/,
    );
  });
} finally {
  globalThis.fetch = originalFetch;
}

const expected = 9;
assert.equal(passed, expected);
console.log(`\n[hardening] sonuç: ${passed}/${expected} geçti`);
