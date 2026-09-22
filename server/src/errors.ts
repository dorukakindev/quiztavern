import type { ToastKey } from "../../shared/types";

/**
 * Kullanıcıya gösterilecek hatalar. Mesaj METNİ değil ANAHTARI taşır: çeviri
 * istemcide, oyuncunun kendi dilinde yapılır. Sunucu hiçbir yerde kullanıcıya
 * görünecek düz metin üretmez.
 */
export class GameError extends Error {
  constructor(
    readonly key: ToastKey,
    readonly params?: Record<string, string | number>
  ) {
    super(key);
    this.name = "GameError";
  }
}

/** Yakalanan hatayı istemciye gidecek toast'a çevirir; beklenmedik hatalar yedek anahtara düşer. */
export function toToast(error: unknown, fallback: ToastKey): { key: ToastKey; params?: Record<string, string | number> } {
  if (error instanceof GameError) return { key: error.key, params: error.params };
  return { key: fallback };
}
