/**
 * Özel soru paketi API'si (FAZ 4.4). `/api` öneki hem Discord proxy'sinde
 * (önek soyulur) hem prod'un aynı-origin servisinde çalışır; vite dev
 * sunucusu `/api`'yi :3001'e proxy'ler.
 */

export interface QuestionPackMeta {
  id: string;
  name: string;
  count: number;
  categories: string[];
  createdAt: number;
  createdBy: string;
}

const PACKS_URL = '/api/question-packs'

export async function listPacks(): Promise<QuestionPackMeta[]> {
  try {
    const res = await fetch(PACKS_URL)
    if (!res.ok) return []
    const data = (await res.json()) as { packs?: QuestionPackMeta[] }
    return Array.isArray(data.packs) ? data.packs : []
  } catch {
    return []
  }
}

export interface PackUploadResult {
  ok: boolean
  pack?: QuestionPackMeta
  errors?: string[]
  warnings?: string[]
  message?: string
}

export async function uploadPack(args: { name: string; content: string; format: 'json' | 'csv'; token?: string }): Promise<PackUploadResult> {
  try {
    const res = await fetch(PACKS_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(args.token ? { authorization: `Bearer ${args.token}` } : {}),
      },
      body: JSON.stringify({
        name: args.name,
        format: args.format,
        content: args.format === 'json' ? JSON.parse(args.content) : args.content,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as { pack?: QuestionPackMeta; errors?: string[]; warnings?: string[]; error?: string }
    if (!res.ok) return { ok: false, errors: data.errors, warnings: data.warnings, message: data.error }
    return { ok: true, pack: data.pack, warnings: data.warnings }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
