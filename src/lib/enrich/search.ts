import { findCompanyDuplicates } from '../duplicates';
import type { Company, FieldSource } from '../types';
import { ADAPTERS, SOURCES } from './sources';
import { FIELD_ORDER, type Candidate, type Ctx, type FieldKey, type SearchResult, type SourceId, type SourceStatus } from './types';

/** Prioridad a igualdad de parecido: registros oficiales > LEI > Wikidata > OpenStreetMap. */
const PRIORITY: SourceId[] = ['sirene', 'brreg', 'ares', 'gleif', 'wikidata', 'osm'];

export async function searchCompanies(query: string, ctx: Ctx): Promise<SearchResult> {
  const q = query.trim();
  const settled = await Promise.allSettled(SOURCES.map((s) => ADAPTERS[s.id](q, ctx)));
  const sources: SourceStatus[] = [];
  const candidates: Candidate[] = [];
  settled.forEach((r, i) => {
    const s = SOURCES[i];
    if (r.status === 'fulfilled') {
      candidates.push(...r.value);
      sources.push({ id: s.id, label: s.label, status: r.value.length ? 'ok' : 'empty', count: r.value.length });
    } else {
      sources.push({ id: s.id, label: s.label, status: 'error', count: 0, error: (r.reason as Error)?.name === 'AbortError' ? 'tardó demasiado' : String((r.reason as Error)?.message ?? r.reason) });
    }
  });
  candidates.sort((a, b) => b.score - a.score || PRIORITY.indexOf(a.source) - PRIORITY.indexOf(b.source));
  return { candidates, sources };
}

/** Coincidencias en el directorio local (para no crear duplicados). */
export function localMatches(query: string, companies: Company[]): Company[] {
  return findCompanyDuplicates(query, companies).slice(0, 4).map((m) => m.company);
}

export interface FieldOption { value: string; cand: Candidate }

/** Valores propuestos por cada campo entre las coincidencias elegidas, en el orden en que se marcaron. */
export function mergeCandidates(selected: Candidate[]): Partial<Record<FieldKey, FieldOption[]>> {
  const out: Partial<Record<FieldKey, FieldOption[]>> = {};
  for (const key of FIELD_ORDER) {
    const opts: FieldOption[] = [];
    for (const cand of selected) {
      const v = (cand.fields[key] ?? '').trim();
      if (v && !opts.some((o) => o.value.toLowerCase() === v.toLowerCase())) opts.push({ value: v, cand });
    }
    if (opts.length) out[key] = opts;
  }
  return out;
}

export interface Chosen { value: string; cand?: Candidate; edited: boolean }

/** Procedencia de lo que se guarda: fuente y enlace de la coincidencia, o «editado» si el usuario cambió el texto. */
export function buildProvenance(chosen: Partial<Record<string, Chosen>>, now = new Date().toISOString()): Record<string, FieldSource> {
  const out: Record<string, FieldSource> = {};
  for (const [k, c] of Object.entries(chosen)) {
    if (!c || !c.cand) continue;
    const f: FieldSource = { source: c.cand.sourceLabel, at: now };
    if (c.cand.sourceUrl) f.url = c.cand.sourceUrl;
    if (c.edited) f.edited = true;
    out[k] = f;
  }
  return out;
}

/** Quita la procedencia de los campos cuyo valor cambió respecto al guardado (el usuario los editó a mano). `logo` se conserva. */
export function pruneProvenance(prov: Company['provenance'], stored: Partial<Record<string, unknown>>, next: Partial<Record<string, string | undefined>>): Company['provenance'] | undefined {
  if (!prov) return undefined;
  const out: NonNullable<Company['provenance']> = {};
  for (const [k, v] of Object.entries(prov)) {
    if (k !== 'logo' && k in next && String(stored[k] ?? '').trim() !== (next[k] ?? '').trim()) continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}
