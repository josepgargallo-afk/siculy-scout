import { domainOf, normalizeName, similarity, stripAccents } from './duplicates';
import type { Company } from './types';

/** Campos de empresa que se pueden rellenar desde una tarjeta, QR o archivo .vcf. */
export interface CompanyDraft {
  name: string;
  legalName: string;
  country: string;
  city: string;
  address: string; // dirección legal / sede
  operationalAddress: string;
  web: string;
  email: string; // buzón corporativo genérico
  phone: string; // teléfono corporativo
}

export const emptyCompanyDraft: CompanyDraft = { name: '', legalName: '', country: '', city: '', address: '', operationalAddress: '', web: '', email: '', phone: '' };

export const COMPANY_FIELDS: { key: Exclude<keyof CompanyDraft, 'name'>; label: string }[] = [
  { key: 'legalName', label: 'Nombre legal' },
  { key: 'country', label: 'País' },
  { key: 'city', label: 'Ciudad' },
  { key: 'address', label: 'Dirección legal' },
  { key: 'operationalAddress', label: 'Dirección operativa' },
  { key: 'web', label: 'Web' },
  { key: 'email', label: 'Email corporativo' },
  { key: 'phone', label: 'Teléfono corporativo' },
];

export type DiffStatus = 'new' | 'same' | 'conflict';
export interface FieldDiff { key: Exclude<keyof CompanyDraft, 'name'>; label: string; current: string; detected: string; status: DiffStatus }

const digits = (s: string) => s.replace(/\D/g, '');
const flat = (s: string) => stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

/** ¿Dos valores del mismo campo son equivalentes? (formato, mayúsculas, www., puntuación…) */
export function sameValue(key: FieldDiff['key'], a: string, b: string): boolean {
  if (!a || !b) return false;
  switch (key) {
    case 'web': return !!domainOf(a) && domainOf(a) === domainOf(b);
    case 'email': return a.trim().toLowerCase() === b.trim().toLowerCase();
    case 'phone': { const x = digits(a); const y = digits(b); return x.length >= 7 && y.length >= 7 && x.slice(-8) === y.slice(-8); }
    case 'address': case 'operationalAddress': { const x = flat(a); const y = flat(b); return x === y || (Math.min(x.length, y.length) >= 8 && (x.includes(y) || y.includes(x))); }
    case 'legalName': return normalizeName(a) === normalizeName(b);
    default: return flat(a) === flat(b);
  }
}

/** Compara lo detectado con la empresa existente: nuevo (hueco), igual o conflicto (valores distintos). */
export function diffCompany(existing: Company, draft: CompanyDraft): FieldDiff[] {
  const out: FieldDiff[] = [];
  for (const { key, label } of COMPANY_FIELDS) {
    const detected = (draft[key] ?? '').trim();
    if (!detected) continue;
    const current = ((existing[key as keyof Company] as string | undefined) ?? '').trim();
    const status: DiffStatus = !current ? 'new' : sameValue(key, current, detected) ? 'same' : 'conflict';
    out.push({ key, label, current, detected, status });
  }
  return out;
}

/**
 * Parche para updateCompany. `choice[key]` = true usa el valor detectado.
 * Por defecto SÓLO se rellenan huecos: un conflicto conserva el dato actual hasta que el usuario elija lo contrario.
 */
export function buildCompanyPatch(diffs: FieldDiff[], choice: Partial<Record<FieldDiff['key'], boolean>>): Partial<Company> {
  const patch: Partial<Company> = {};
  for (const d of diffs) {
    const use = choice[d.key] ?? d.status === 'new';
    if (use && d.status !== 'same') (patch as Record<string, string>)[d.key] = d.detected;
  }
  return patch;
}

/** ¿El nombre identificado en la tarjeta/QR difiere de verdad del de la empresa elegida? */
export function companyNameMismatch(existingName: string, detectedName: string): boolean {
  const a = normalizeName(existingName); const b = normalizeName(detectedName);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return false;
  return similarity(a, b) < 0.7;
}

/** Datos de una empresa nueva a partir del borrador (sólo campos con valor). */
export function companyInputFromDraft(d: CompanyDraft): Partial<Company> & { name: string } {
  const out: Partial<Company> & { name: string } = { name: d.name.trim() };
  for (const { key } of COMPANY_FIELDS) { const v = (d[key] ?? '').trim(); if (v) (out as unknown as Record<string, string>)[key] = v; }
  return out;
}
