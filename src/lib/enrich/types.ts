/** Campos de la ficha que la búsqueda puede proponer. */
export type FieldKey = 'name' | 'legalName' | 'country' | 'city' | 'address' | 'web' | 'phone' | 'email' | 'sector' | 'description';

export const FIELD_LABEL: Record<FieldKey, string> = {
  name: 'Nombre comercial', legalName: 'Razón social', country: 'País', city: 'Ciudad', address: 'Dirección',
  web: 'Web', phone: 'Teléfono', email: 'Email general', sector: 'Sector', description: 'Descripción de la actividad',
};
export const FIELD_ORDER: FieldKey[] = ['name', 'legalName', 'country', 'city', 'address', 'web', 'phone', 'email', 'sector', 'description'];

export type SourceId = 'sirene' | 'brreg' | 'ares' | 'gleif' | 'wikidata' | 'osm';

export interface SourceInfo {
  id: SourceId;
  label: string;
  /** Cobertura geográfica legible. */
  coverage: string;
  /** Campos que esta fuente puede aportar. */
  provides: FieldKey[] | 'logo'[] | string[];
  license: string;
}

export interface Candidate {
  id: string;
  source: SourceId;
  sourceLabel: string;
  sourceUrl?: string;
  license?: string;
  title: string;
  /** Texto corto para distinguir homónimos (país · ciudad · nº de registro). */
  subtitle: string;
  fields: Partial<Record<FieldKey, string>>;
  logoUrl?: string;
  /** 0..1: parecido del nombre con lo buscado. NO prueba que sea la misma empresa. */
  score: number;
  inactive?: boolean;
}

export interface SourceStatus { id: SourceId; label: string; status: 'ok' | 'empty' | 'error'; count: number; error?: string }

export interface SearchResult { candidates: Candidate[]; sources: SourceStatus[] }

export interface Ctx { fetch: typeof fetch; timeoutMs?: number }
