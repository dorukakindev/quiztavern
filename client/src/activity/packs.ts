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

/** Editördeki tek soru taslağı — sunucudaki Question ile aynı şekil. */
export interface PackQuestion {
  id: string
  category: string
  text: string
  textEn: string
  choices: string[]
  choicesEn: string[]
  correctIndex: number
  difficulty: 'kolay' | 'orta' | 'zor'
}

/** GET /:id — sorularıyla birlikte paket (yalnızca sahibi/admin). */
export interface StoredPack extends QuestionPackMeta {
  questions: PackQuestion[]
}

export interface PackAuth {
  /** Discord oturum belirteci — prod'da paket sahipliği bununla doğrulanır. */
  sessionToken?: string | null
  /** Mock modda socket'e gönderilen aynı devId (getDevIdentity().id). */
  devId?: string | null
}

function authHeaders(auth: PackAuth): Record<string, string> {
  if (auth.sessionToken) return { authorization: `Bearer ${auth.sessionToken}` }
  if (auth.devId) return { 'x-dev-id': auth.devId }
  return {}
}

/** Paketin tam içeriğini (correctIndex dahil) getirir — sahibi olmayan 403 yer. */
export async function getPack(id: string, auth: PackAuth): Promise<StoredPack | null> {
  try {
    const res = await fetch(`${PACKS_URL}/${encodeURIComponent(id)}`, { headers: authHeaders(auth) })
    if (!res.ok) return null
    const data = (await res.json()) as { pack?: StoredPack }
    return data.pack ?? null
  } catch {
    return null
  }
}

/** Yeni paket kaydeder (id yok) ya da var olanı günceller (id var, sahip gerekir). */
export async function savePack(args: { id?: string | null; name: string; questions: PackQuestion[]; auth: PackAuth }): Promise<PackUploadResult> {
  try {
    const res = await fetch(args.id ? `${PACKS_URL}/${encodeURIComponent(args.id)}` : PACKS_URL, {
      method: args.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders(args.auth) },
      body: JSON.stringify({ name: args.name, format: 'json', content: args.questions }),
    })
    const data = (await res.json().catch(() => ({}))) as { pack?: QuestionPackMeta; errors?: string[]; warnings?: string[]; error?: string }
    if (!res.ok) return { ok: false, errors: data.errors, warnings: data.warnings, message: data.error }
    return { ok: true, pack: data.pack, warnings: data.warnings }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

/** Paketi siler (sahibi/admin); odada seçiliyse sonraki maç standart havuza düşemez — sunucu err.packUnknown verir. */
export async function deletePack(id: string, auth: PackAuth): Promise<boolean> {
  try {
    const res = await fetch(`${PACKS_URL}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders(auth) })
    return res.ok
  } catch {
    return false
  }
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
