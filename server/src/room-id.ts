import { createHash } from "node:crypto";

/**
 * Discord instance kimlikleri güvenli alfabedeyse eksiksiz korunur. Mock
 * geliştirme girdilerindeki diğer karakterler okunabilir bir önek ve hash ile
 * ayrıştırılır; farklı ham değerler aynı oda anahtarına çökmez.
 */
export function normalizeRoomId(raw: string): string {
  const value = raw.trim();
  if (!value) return "ana-lobi";
  if (/^[A-Za-z0-9_-]{1,128}$/.test(value)) return value;

  const readable = value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80) || "room";
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 12);
  return `${readable}-${digest}`;
}
