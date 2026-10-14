import { normalizeName, similarity } from '../duplicates';

/**
 * Parecido entre el nombre buscado y los nombres de un registro (0..1).
 * Es sólo una ayuda para ordenar y descartar ruido: la coincidencia SIEMPRE la confirma el usuario.
 */
export function nameScore(query: string, names: (string | undefined)[]): number {
  const q = normalizeName(query);
  if (q.length < 2) return 0;
  const qt = q.split(' ');
  let best = 0;
  for (const raw of names) {
    const n = normalizeName(raw ?? '');
    if (!n) continue;
    let s: number;
    if (n === q) s = 1;
    else {
      const nt = n.split(' ');
      const shorter = qt.length <= nt.length ? qt : nt;
      const longer = qt.length <= nt.length ? nt : qt;
      // todas las palabras del nombre más corto aparecen enteras en el más largo («barilla» ⊂ «barilla france»)
      const contained = shorter.every((t) => longer.includes(t));
      s = contained ? 0.7 + 0.25 * (shorter.join('').length / longer.join('').length) : similarity(q, n) * 0.9;
    }
    if (s > best) best = s;
  }
  return best;
}

export const MIN_SCORE = 0.6;

/** Pasa MAYÚSCULAS de registro a «Título» (sólo direcciones y ciudades; los nombres legales se dejan como constan). */
export function tidyCase(s: string): string {
  const t = s.trim();
  if (!t || t !== t.toUpperCase() || !/[A-ZÀ-Ý]/.test(t)) return t;
  return t.toLowerCase().replace(/(^|[\s\-'’/(])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
}

export function countryName(code?: string | null): string {
  if (!code) return '';
  try { return new Intl.DisplayNames(['es'], { type: 'region' }).of(code.toUpperCase()) ?? code; } catch { return code; }
}

export const clean = (s: unknown): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
