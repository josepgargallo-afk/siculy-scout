import type { Num, Sentence } from './corpus.ts';

export function norm(s: string): string[] {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(\d)[.\s](\d{3})(?!\d)/g, '$1$2') // 1.200 → 1200
    .replace(/(\d),(\d)/g, '$1,$2')
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9,\s]/g, ' ')
    .replace(/,(?!\d)/g, ' ')
    .split(/\s+/).filter(Boolean);
}

/** Distancia de edición entre secuencias de palabras: [errores, sustituciones, borrados, inserciones]. */
export function wordEdit(ref: string[], hyp: string[]): { err: number; sub: number; del: number; ins: number } {
  const n = ref.length; const m = hyp.length;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => [i, ...Array(m).fill(0)]);
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
  let i = n; let j = m; let sub = 0; let del = 0; let ins = 0;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1)) { if (ref[i - 1] !== hyp[j - 1]) sub++; i--; j--; }
    else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { del++; i--; }
    else { ins++; j--; }
  }
  return { err: d[n][m], sub, del, ins };
}

export function numberHit(num: Num, hyp: string): boolean {
  const h = ' ' + norm(hyp).join(' ') + ' ';
  const forms = [num.d, ...num.words].map((w) => ' ' + norm(w).join(' ') + ' ');
  return forms.some((f) => h.includes(f));
}

export function termHit(alts: string[], hyp: string): boolean {
  const h = norm(hyp).join(' ');
  return alts.some((a) => h.includes(norm(a).join(' ')));
}

export interface ClipScore { words: number; err: number; sub: number; del: number; ins: number; numsTotal: number; numsOk: number; termsTotal: number; termsOk: number; termsGlossTotal: number; termsGlossOk: number }

export function scoreClip(s: Sentence, hyp: string, glossary: string): ClipScore {
  const ref = norm(s.ref); const e = wordEdit(ref, norm(hyp));
  const g = norm(glossary).join(' ');
  const inGloss = (alts: string[]) => alts.some((a) => g.includes(norm(a).join(' ')));
  let tg = 0; let tgOk = 0; let t = 0; let tOk = 0;
  for (const alts of s.terms) { const hit = termHit(alts, hyp); if (inGloss(alts)) { tg++; if (hit) tgOk++; } else { t++; if (hit) tOk++; } }
  return {
    words: ref.length, err: e.err, sub: e.sub, del: e.del, ins: e.ins,
    numsTotal: s.nums.length, numsOk: s.nums.filter((n) => numberHit(n, hyp)).length,
    termsTotal: t, termsOk: tOk, termsGlossTotal: tg, termsGlossOk: tgOk,
  };
}

export function sum(a: ClipScore[]): ClipScore {
  const z: ClipScore = { words: 0, err: 0, sub: 0, del: 0, ins: 0, numsTotal: 0, numsOk: 0, termsTotal: 0, termsOk: 0, termsGlossTotal: 0, termsGlossOk: 0 };
  for (const c of a) for (const k of Object.keys(z) as (keyof ClipScore)[]) z[k] += c[k];
  return z;
}

export const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : NaN);
