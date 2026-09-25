import { CATEGORY_CATALOG } from "./categories";
import { questionPoolIds, sampleQuestions } from "./questions";
import type { Question } from "./questions";
import type { Difficulty } from "../../shared/types";
import { GAME } from "./config";

export interface BoardCellSpec {
  category: string;
  value: number;
  question: Question;
}

export interface BoardSpec {
  /** Sütun başlıkları (≤ BOARD_COLS kategori). */
  categories: string[];
  /** Satır-major: cells[kategoriIdx * 5 + değerIdx]. */
  cells: BoardCellSpec[];
}

const DIFF_RANK: Record<Difficulty, number> = { kolay: 0, orta: 1, zor: 2 };

/**
 * Tavern Panosu (§6.1): 5 kategori × 5 değer hücresini soruyla doldurur.
 * Kategori adayları: lobide seçili kategoriler (yeterli içerik varsa) —
 * boşsa tüm havuzdan en dolu kategoriler. Bir sütunda sorular zorluk sırasına
 * dizilir ve değerler artan sırada atanır: en kolay hücre 100, en zoru 500.
 * Sütunu dolduramayan kategori (görülmemiş <5 soru) elenir; pano <5 sütunla
 * da açılabilir — hücre sayısı roundLimit'i belirler.
 */
export function sampleBoardCells(categories: string[], seen: Set<string>, lastIds: Set<string>): BoardSpec {
  const perCol = GAME.BOARD_VALUES.length;
  // Aday havuz: seçim varsa önce ondan, yetmezse genel katalogdan tamamla —
  // içerik sayısı BOARD_VALUES kadar olanlar uygun.
  const selected = categories.filter((name) =>
    CATEGORY_CATALOG.some((c) => c.name === name && c.classicCount >= perCol),
  );
  const rest = CATEGORY_CATALOG.filter((c) => c.classicCount >= perCol && !selected.includes(c.name)).map(
    (c) => c.name,
  );
  const candidates = [...selected, ...rest];
  const specCats: string[] = [];
  const cells: BoardCellSpec[] = [];
  for (const cat of candidates) {
    if (specCats.length >= GAME.BOARD_COLS) break;
    // Kategori-bazlı tekrar önleme: bu kategoride görülmemiş <5 kaldıysa
    // yalnız o kategorinin geçmişini (son maç hariç) temizle.
    const poolIds = questionPoolIds([cat]);
    const unseen = poolIds.filter((id) => !seen.has(id)).length;
    if (unseen < perCol) for (const id of poolIds) if (!lastIds.has(id)) seen.delete(id);
    const qs = sampleQuestions(perCol, [cat], seen);
    if (qs.length < perCol) continue;
    qs.sort((a, b) => DIFF_RANK[a.difficulty] - DIFF_RANK[b.difficulty]);
    specCats.push(cat);
    qs.forEach((q, i) => {
      seen.add(q.id);
      cells.push({ category: cat, value: GAME.BOARD_VALUES[i], question: q });
    });
  }
  return { categories: specCats, cells };
}
