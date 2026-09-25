import { ALL_CIRCLE_PROMPTS } from "./circle";
import { ALL_QUESTIONS } from "./questions";
import type { CategoryOption, Difficulty } from "../../shared/types";

/**
 * Sorusuz da olsa lobide görünmesini istediğimiz kategoriler. İçerik SONRA
 * eklenecek (başka modelle); o zamana kadar classicCount/circleCount 0 kalır ve
 * lobide "yakında" olarak PASİF görünürler. Bir kategoriye soru/prompt eklenince
 * sayımı buradan bağımsız artar ve otomatik aktifleşir — bu listeyi güncellemeye
 * gerek kalmaz. Yeni kategori adları buraya yazılır ki soru eklenmeden görünsün.
 */
export const EXTRA_CATEGORIES = [
  "Kimya",
  "Felsefe",
  "Yemek",
  "Hayvanlar",
  "Anime",
  "Çizgi Film",
  "Otomobil",
  "Ekonomi",
  "Sağlık",
  "Popüler Kültür",
  "İnternet",
  "Türkiye",
  "Bilim Kurgu",
  "Moda",
  "Futbol",
  "Espor",
  "Satranç",
  "Dinozorlar",
  "Deyimler",
  "Ünlüler",
  "Markalar",
  "Süper Kahramanlar",
  "Korku",
  "Polisiye",
  "Diller",
  "Mimari",
  "Psikoloji",
  "İcatlar",
  "Yapay Zeka",
  "Okyanuslar",
] as const;

/** Tek kaynak: lobi hangi kategorinin hangi modda içerik taşıdığını buradan bilir. */
export const CATEGORY_CATALOG: CategoryOption[] = (() => {
  const counts = new Map<string, CategoryOption & { diffTally: Record<Difficulty, number> }>();
  const ensure = (name: string) => {
    const current = counts.get(name) ?? {
      name,
      classicCount: 0,
      circleCount: 0,
      difficulty: null,
      diffTally: { kolay: 0, orta: 0, zor: 0 },
    };
    counts.set(name, current);
    return current;
  };
  // Önce sorusuz planlanan kategorileri kaydet (0 sayımla görünsünler).
  for (const name of EXTRA_CATEGORIES) ensure(name);
  for (const question of ALL_QUESTIONS) {
    const entry = ensure(question.category);
    entry.classicCount += 1;
    entry.diffTally[question.difficulty] += 1;
  }
  for (const prompt of ALL_CIRCLE_PROMPTS) {
    const entry = ensure(prompt.category);
    entry.circleCount += 1;
    entry.diffTally[prompt.difficulty] += 1;
  }
  // Kart görünümünde tek bir zorluk segmenti gösterilir: kategorinin içeriğinde
  // EN ÇOK etiketlenen seviye ("baskın zorluk"). İçerik yoksa null (kilitli kart).
  for (const entry of counts.values()) {
    const { kolay, orta, zor } = entry.diffTally;
    entry.difficulty =
      kolay + orta + zor === 0 ? null : kolay >= orta && kolay >= zor ? "kolay" : orta >= zor ? "orta" : "zor";
  }
  return [...counts.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "tr"))
    .map(({ name, classicCount, circleCount, difficulty }) => ({ name, classicCount, circleCount, difficulty }));
})();

export const CATEGORY_NAMES = new Set(CATEGORY_CATALOG.map((category) => category.name));
