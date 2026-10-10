import { similarity } from '../../lib/duplicates';
import type { Expected } from './cards';

export interface Extracted {
  company?: string; name?: string; role?: string;
  primaryEmail?: string; emails: string[];
  mobile?: string; phone?: string; web?: string; address?: string;
}

export type Verdict = 'ok' | 'empty' | 'wrong';
export const FIELDS = ['company', 'name', 'role', 'primaryEmail', 'allEmails', 'mobile', 'phone', 'web', 'address'] as const;
export type FieldName = (typeof FIELDS)[number];

const norm = (s = '') => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
const digits = (s = '') => s.replace(/\D/g, '');
const stripLegal = (s: string) => norm(s).replace(/(srl|spa|sl|sa|sarl|sas|ltd|gmbh)$/, '');

export function scoreCard(exp: Expected, got: Extracted): Record<FieldName, Verdict> {
  const v = (has: boolean, ok: boolean): Verdict => (!has ? 'empty' : ok ? 'ok' : 'wrong');
  const sim = (a: string, b: string) => similarity(norm(a), norm(b));
  const emailsNorm = got.emails.map((e) => e.toLowerCase());
  const dom = (u = '') => u.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  return {
    company: v(!!got.company, !!got.company && similarity(stripLegal(got.company), stripLegal(exp.company)) >= 0.85),
    name: v(!!got.name, !!got.name && sim(got.name, exp.name) >= 0.9),
    role: v(!!got.role, !!got.role && sim(got.role, exp.role) >= 0.8),
    primaryEmail: v(!!got.primaryEmail, got.primaryEmail?.toLowerCase() === exp.emails[0]),
    allEmails: v(emailsNorm.length > 0, exp.emails.every((e) => emailsNorm.includes(e))),
    mobile: v(!!got.mobile, !!exp.mobile && digits(got.mobile) === digits(exp.mobile)),
    phone: v(!!got.phone, !!exp.phone && digits(got.phone) === digits(exp.phone)),
    web: v(!!got.web, dom(got.web) === dom(exp.web)),
    address: v(!!got.address, !!got.address && norm(got.address).includes(norm(exp.address))),
  };
}

export interface Tally { ok: number; empty: number; wrong: number }
export function newTally(): Record<FieldName, Tally> {
  return Object.fromEntries(FIELDS.map((f) => [f, { ok: 0, empty: 0, wrong: 0 }])) as Record<FieldName, Tally>;
}
export function addTally(t: Record<FieldName, Tally>, r: Record<FieldName, Verdict>) {
  for (const f of FIELDS) t[f][r[f]]++;
}
export function formatTally(title: string, t: Record<FieldName, Tally>, n: number, ms: number[]): string {
  const rows = FIELDS.map((f) => `  ${f.padEnd(13)} ok ${String(t[f].ok).padStart(2)}/${n}  vacío ${String(t[f].empty).padStart(2)}  ERRÓNEO ${String(t[f].wrong).padStart(2)}`);
  const sorted = [...ms].sort((a, b) => a - b);
  const total = FIELDS.reduce((s, f) => s + t[f].ok, 0);
  const wrong = FIELDS.reduce((s, f) => s + t[f].wrong, 0);
  return `\n== ${title} ==\n${rows.join('\n')}\n  TOTAL campos correctos ${total}/${n * FIELDS.length} (${Math.round((100 * total) / (n * FIELDS.length))}%), erróneos ${wrong}\n  tiempo: mediana ${Math.round(sorted[Math.floor(sorted.length / 2)])} ms, máx ${Math.round(sorted[sorted.length - 1])} ms\n`;
}
