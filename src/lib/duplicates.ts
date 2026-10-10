import type { Company, Contact } from './types';

const LEGAL = /\b(s\.?\s?r\.?\s?l\.?|s\.?\s?p\.?\s?a\.?|s\.?\s?a\.?\s?s\.?|s\.?\s?a\.?\s?r\.?\s?l\.?|s\.?\s?l\.?\s?u\.?|s\.?\s?l\.?|s\.?\s?a\.?|gmbh|ltd|llc|inc|bv|nv|ag|srls|snc|sas|sarl|spa|sl|sa|srl|co|corp|company|group|groupe|gruppo|grupo)\b/gi;

export function stripAccents(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Normaliza un nombre de empresa para comparar: sin acentos, sin formas jurídicas ni signos. */
export function normalizeName(s: string): string {
  return stripAccents(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(LEGAL, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

export function domainOf(url?: string): string | null {
  if (!url) return null;
  const m = url.trim().toLowerCase().match(/^(?:[a-z]+:\/\/)?(?:www\.)?([^\/\s?#:]+)/);
  return m && m[1].includes('.') ? m[1] : null;
}

export type DuplicateReason = 'same-name' | 'similar-name' | 'same-domain';
export interface CompanyMatch { company: Company; reason: DuplicateReason; score: number }

/** Candidatos a duplicado entre empresas locales. Conservador: sólo avisa, nunca fusiona solo. */
export function findCompanyDuplicates(
  name: string, existing: Company[], opts: { web?: string; excludeId?: string } = {},
): CompanyMatch[] {
  const n = normalizeName(name);
  const dom = domainOf(opts.web);
  const out: CompanyMatch[] = [];
  for (const c of existing) {
    if (c.id === opts.excludeId) continue;
    const cn = normalizeName(c.name);
    const cl = c.legalName ? normalizeName(c.legalName) : '';
    if (n && (cn === n || (cl && cl === n))) { out.push({ company: c, reason: 'same-name', score: 1 }); continue; }
    if (dom && domainOf(c.web) === dom) { out.push({ company: c, reason: 'same-domain', score: 0.95 }); continue; }
    if (n.length >= 4 && cn.length >= 4) {
      const contains = cn.includes(n) || n.includes(cn);
      const sim = similarity(n, cn);
      if (sim >= 0.85 || (contains && Math.min(n.length, cn.length) / Math.max(n.length, cn.length) >= 0.6)) {
        out.push({ company: c, reason: 'similar-name', score: Math.max(sim, 0.6) });
      }
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

export interface ContactMatch { contact: Contact; reason: 'same-email' | 'same-name' | 'same-phone' }

const digits = (s?: string) => (s || '').replace(/\D+/g, '');

/** Contactos de la misma empresa que parecen el mismo (mismo email, teléfono o nombre). */
export function findContactDuplicates(
  cand: { fullName?: string; email?: string; phone?: string; mobile?: string },
  existing: Contact[], excludeId?: string,
): ContactMatch[] {
  const out: ContactMatch[] = [];
  const email = (cand.email || '').trim().toLowerCase();
  const name = normalizeName(cand.fullName || '');
  const phones = [digits(cand.phone), digits(cand.mobile)].filter((p) => p.length >= 7);
  for (const c of existing) {
    if (c.id === excludeId) continue;
    if (email && (c.email || '').trim().toLowerCase() === email) { out.push({ contact: c, reason: 'same-email' }); continue; }
    const cp = [digits(c.phone), digits(c.mobile)].filter((p) => p.length >= 7);
    if (phones.some((p) => cp.some((q) => q.slice(-8) === p.slice(-8)))) { out.push({ contact: c, reason: 'same-phone' }); continue; }
    if (name && name.includes(' ') && normalizeName(c.fullName) === name) out.push({ contact: c, reason: 'same-name' });
  }
  return out;
}
