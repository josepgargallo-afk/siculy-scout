import { clean, countryName, MIN_SCORE, nameScore, tidyCase } from './match';
import type { Candidate, Ctx, SourceId, SourceInfo } from './types';

/**
 * Fuentes gratuitas, sin clave, con API pública documentada y CORS abierto (verificadas contra los servidores reales;
 * ver docs/ENRIQUECIMIENTO.md). No hay scraping: sólo se leen las respuestas JSON de esas APIs.
 */
export const SOURCES: SourceInfo[] = [
  { id: 'sirene', label: 'Sirene (Francia, INSEE)', coverage: 'Francia', provides: ['legalName', 'country', 'city', 'address', 'sector'], license: 'Licence Ouverte 2.0' },
  { id: 'brreg', label: 'Brønnøysund (Noruega)', coverage: 'Noruega', provides: ['legalName', 'country', 'city', 'address', 'web', 'phone', 'email', 'sector', 'description'], license: 'NLOD 2.0' },
  { id: 'ares', label: 'ARES (Chequia)', coverage: 'Chequia', provides: ['legalName', 'country', 'city', 'address', 'sector'], license: 'Datos abiertos CZ' },
  { id: 'gleif', label: 'GLEIF (registro mundial de LEI)', coverage: 'Mundial (sólo entidades con código LEI, normalmente medianas y grandes)', provides: ['legalName', 'country', 'city', 'address'], license: 'CC0' },
  { id: 'wikidata', label: 'Wikidata', coverage: 'Mundial (sólo empresas con ficha en Wikidata)', provides: ['name', 'country', 'city', 'web', 'sector', 'description', 'logo'], license: 'CC0' },
  { id: 'osm', label: 'OpenStreetMap', coverage: 'Mundial (comercios y empresas cartografiados; teléfono/email/web sólo si están etiquetados)', provides: ['name', 'legalName', 'country', 'city', 'address', 'web', 'phone', 'email', 'description'], license: '© colaboradores de OpenStreetMap (ODbL)' },
];
const info = (id: SourceId) => SOURCES.find((s) => s.id === id)!;

async function request(ctx: Ctx, url: string, init: RequestInit = {}): Promise<unknown> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ctx.timeoutMs ?? 9000);
  try {
    const r = await ctx.fetch(url, { ...init, signal: ac.signal, credentials: 'omit', referrerPolicy: init.referrerPolicy ?? 'no-referrer' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
const enc = encodeURIComponent;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const httpUrl = (u: unknown): string | undefined => { const s = clean(u); return /^https?:\/\//i.test(s) ? s : undefined; };
const webUrl = (u: unknown): string | undefined => { const s = clean(u); return s ? (/^https?:\/\//i.test(s) ? s : /^[\w-]+(\.[\w-]+)+/.test(s) ? 'https://' + s : undefined) : undefined; };

function mk(source: SourceId, id: string, p: Partial<Candidate> & { title: string; fields: Candidate['fields'] }): Candidate {
  const i = info(source);
  const place = [p.fields.city, p.fields.country].filter(Boolean).join(', ');
  return { id: `${source}:${id}`, source, sourceLabel: i.label, license: i.license, score: 0, ...p, subtitle: [place, p.subtitle].filter(Boolean).join(' · ') } as Candidate;
}
const compact = (f: Candidate['fields']): Candidate['fields'] => Object.fromEntries(Object.entries(f).filter(([, v]) => v && String(v).trim())) as Candidate['fields'];

// ---------- Francia: Sirene ----------
export async function searchSirene(q: string, ctx: Ctx): Promise<Candidate[]> {
  if (q.trim().length < 3) return [];
  const j = obj(await request(ctx, `https://recherche-entreprises.api.gouv.fr/search?q=${enc(q)}&per_page=6`));
  const out: Candidate[] = [];
  for (const r of arr(j.results).map(obj)) {
    // Los empresarios individuales (personas físicas) no se ofrecen: sus datos son personales y no interesan en una ficha comercial.
    if (clean(r.nature_juridique).startsWith('1')) continue;
    const siege = obj(r.siege);
    const title = clean(r.nom_complet) || clean(r.nom_raison_sociale);
    const score = nameScore(q, [title, clean(r.nom_raison_sociale), clean(siege.nom_commercial)]);
    if (!title || score < MIN_SCORE) continue;
    const naf = clean(r.activite_principale) || clean(siege.activite_principale);
    out.push(mk('sirene', clean(r.siren), {
      title, score, inactive: clean(r.etat_administratif) === 'C',
      subtitle: 'SIREN ' + clean(r.siren),
      sourceUrl: `https://annuaire-entreprises.data.gouv.fr/entreprise/${enc(clean(r.siren))}`,
      fields: compact({
        legalName: clean(r.nom_raison_sociale) || title, country: 'Francia',
        city: tidyCase(clean(siege.libelle_commune)), address: tidyCase(clean(siege.adresse)),
        sector: naf ? `Actividad principal (código NAF): ${naf}` : '',
      }),
    }));
  }
  return out;
}

// ---------- Noruega: Brønnøysund ----------
export async function searchBrreg(q: string, ctx: Ctx): Promise<Candidate[]> {
  if (q.trim().length < 3) return [];
  const j = obj(await request(ctx, `https://data.brreg.no/enhetsregisteret/api/enheter?navn=${enc(q)}&size=6`));
  const out: Candidate[] = [];
  for (const e of arr(obj(j._embedded).enheter).map(obj)) {
    if (clean(obj(e.organisasjonsform).kode) === 'ENK') continue; // empresario individual (persona física)
    const title = clean(e.navn);
    const score = nameScore(q, [title]);
    if (!title || score < MIN_SCORE) continue;
    const a = obj(e.forretningsadresse);
    const street = arr(a.adresse).map(clean).filter(Boolean).join(', ');
    const nk = obj(e.naeringskode1);
    const org = clean(e.organisasjonsnummer);
    out.push(mk('brreg', org, {
      title, score, inactive: e.konkurs === true || e.underAvvikling === true || e.underTvangsavviklingEllerTvangsopplosning === true,
      subtitle: 'Org.nr ' + org, sourceUrl: `https://w2.brreg.no/enhet/sok/detalj.jsp?orgnr=${enc(org)}`,
      fields: compact({
        legalName: title, country: countryName(clean(a.landkode)) || clean(a.land), city: tidyCase(clean(a.poststed)),
        address: [tidyCase(street), [clean(a.postnummer), tidyCase(clean(a.poststed))].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        web: webUrl(e.hjemmeside) ?? '', phone: clean(e.telefon) || clean(e.mobil), email: clean(e.epostadresse),
        sector: clean(nk.beskrivelse), description: arr(e.aktivitet).map(clean).join(' '),
      }),
    }));
  }
  return out;
}

// ---------- Chequia: ARES ----------
export async function searchAres(q: string, ctx: Ctx): Promise<Candidate[]> {
  if (q.trim().length < 3) return [];
  const j = obj(await request(ctx, 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/vyhledat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ obchodniJmeno: q.trim(), start: 0, pocet: 6 }),
  }));
  const out: Candidate[] = [];
  for (const e of arr(j.ekonomickeSubjekty).map(obj)) {
    if (/^10[0-7]$/.test(clean(e.pravniForma))) continue; // persona física que ejerce una actividad (empresario individual)
    const title = clean(e.obchodniJmeno);
    const score = nameScore(q, [title]);
    if (!title || score < MIN_SCORE) continue;
    const s = obj(e.sidlo);
    const ico = clean(e.ico);
    const nace = arr(e.czNace2008).map(clean).filter(Boolean)[0];
    out.push(mk('ares', ico, {
      title, score, subtitle: 'IČO ' + ico, sourceUrl: `https://ares.gov.cz/ekonomicke-subjekty?ico=${enc(ico)}`,
      fields: compact({
        legalName: title, country: countryName(clean(s.kodStatu)) || 'Chequia', city: clean(s.nazevObce), address: clean(s.textovaAdresa),
        sector: nace ? `Actividad principal (CZ-NACE): ${nace}` : '',
      }),
    }));
  }
  return out;
}

// ---------- Mundial: GLEIF ----------
export async function searchGleif(q: string, ctx: Ctx): Promise<Candidate[]> {
  if (q.trim().length < 3) return [];
  const j = obj(await request(ctx, `https://api.gleif.org/api/v1/lei-records?filter%5Bentity.legalName%5D=${enc(q.trim())}&page%5Bsize%5D=8`));
  const out: Candidate[] = [];
  for (const rec of arr(j.data).map(obj)) {
    const e = obj(obj(rec.attributes).entity);
    const title = clean(obj(e.legalName).name);
    const others = arr(e.otherNames).map((o) => clean(obj(o).name));
    const score = nameScore(q, [title, ...others]);
    if (!title || score < MIN_SCORE) continue;
    const a = obj(e.legalAddress);
    const lei = clean(rec.id);
    const street = [...arr(a.addressLines).map(clean), clean(a.addressNumber)].filter(Boolean).join(', ');
    const reg = clean(e.registeredAs);
    out.push(mk('gleif', lei, {
      title, score, inactive: clean(e.status) !== 'ACTIVE',
      subtitle: reg ? `Reg. ${reg}` : 'LEI ' + lei, sourceUrl: `https://search.gleif.org/#/record/${enc(lei)}`,
      fields: compact({
        legalName: title, country: countryName(clean(a.country)), city: tidyCase(clean(a.city)),
        address: [tidyCase(street), [clean(a.postalCode), tidyCase(clean(a.city))].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      }),
    }));
  }
  return out;
}

// ---------- Mundial: Wikidata ----------
const BUSINESS_CLASSES = new Set(['Q4830453', 'Q783794', 'Q6881511', 'Q891723', 'Q167037', 'Q1616075', 'Q43229', 'Q1056878', 'Q15265344', 'Q2085381', 'Q11351', 'Q1370614', 'Q18388277', 'Q5621421', 'Q484652', 'Q1664720']);

const claimIds = (cl: unknown, p: string): string[] => arr(obj(cl)[p]).map((c) => clean(obj(obj(obj(c).mainsnak).datavalue).value && obj(obj(obj(obj(c).mainsnak).datavalue).value).id)).filter(Boolean);
const claimStr = (cl: unknown, p: string): string[] => arr(obj(cl)[p]).map((c) => { const v = obj(obj(obj(c).mainsnak).datavalue).value; return typeof v === 'string' ? v : ''; }).filter(Boolean);
const pickLabel = (l: unknown): string => clean(obj(obj(l).es).value) || clean(obj(obj(l).en).value) || clean(obj(obj(l).it).value) || clean(obj(Object.values(obj(l))[0]).value);

export async function searchWikidata(q: string, ctx: Ctx): Promise<Candidate[]> {
  if (q.trim().length < 3) return [];
  const api = 'https://www.wikidata.org/w/api.php';
  const s = obj(await request(ctx, `${api}?action=wbsearchentities&search=${enc(q.trim())}&language=es&uselang=es&type=item&limit=8&format=json&origin=*`));
  const ids = arr(s.search).map((x) => clean(obj(x).id)).filter(Boolean);
  if (!ids.length) return [];
  const e = obj(obj(await request(ctx, `${api}?action=wbgetentities&ids=${ids.join('|')}&props=labels|descriptions|claims&languages=es|en|it&format=json&origin=*`)).entities);
  const items = ids.map((id) => ({ id, ent: obj(e[id]) })).filter(({ ent }) => {
    const cl = obj(ent.claims);
    return claimIds(cl, 'P31').some((c) => BUSINESS_CLASSES.has(c)) || claimIds(cl, 'P452').length > 0;
  });
  if (!items.length) return [];
  const need = [...new Set(items.flatMap(({ ent }) => { const cl = obj(ent.claims); return [...claimIds(cl, 'P17'), ...claimIds(cl, 'P495'), ...claimIds(cl, 'P159'), ...claimIds(cl, 'P452')]; }))].slice(0, 40);
  const labels = need.length ? obj(obj(await request(ctx, `${api}?action=wbgetentities&ids=${need.join('|')}&props=labels&languages=es|en&format=json&origin=*`)).entities) : {};
  const lab = (id: string) => pickLabel(obj(labels[id]).labels);
  const out: Candidate[] = [];
  for (const { id, ent } of items) {
    const cl = obj(ent.claims);
    const title = pickLabel(ent.labels);
    const score = nameScore(q, [title]);
    if (!title || score < MIN_SCORE) continue;
    const desc = clean(obj(obj(ent.descriptions).es).value) || clean(obj(obj(ent.descriptions).en).value) || clean(obj(obj(ent.descriptions).it).value);
    const country = claimIds(cl, 'P17')[0] ?? claimIds(cl, 'P495')[0];
    const logoFile = claimStr(cl, 'P154')[0];
    let logoUrl: string | undefined;
    if (logoFile) {
      try {
        const ii = obj(obj(await request(ctx, `https://commons.wikimedia.org/w/api.php?action=query&titles=${enc('File:' + logoFile)}&prop=imageinfo&iiprop=url&iiurlwidth=320&format=json&origin=*`)).query);
        const page = obj(Object.values(obj(ii.pages))[0]);
        logoUrl = httpUrl(obj(arr(page.imageinfo)[0]).thumburl);
      } catch { /* sin logo: el resto de datos sigue siendo válido */ }
    }
    out.push(mk('wikidata', id, {
      title, score, subtitle: desc, sourceUrl: `https://www.wikidata.org/wiki/${id}`, logoUrl,
      fields: compact({
        name: title, country: country ? lab(country) : '', city: lab(claimIds(cl, 'P159')[0] ?? ''), web: webUrl(claimStr(cl, 'P856')[0]) ?? '',
        sector: claimIds(cl, 'P452').slice(0, 3).map(lab).filter(Boolean).join(', '), description: desc,
      }),
    }));
  }
  return out;
}

// ---------- Mundial: OpenStreetMap (Nominatim) ----------
const OSM_SKIP = new Set(['boundary', 'place', 'highway', 'natural', 'waterway', 'railway', 'route', 'landuse']);

export async function searchOsm(q: string, ctx: Ctx): Promise<Candidate[]> {
  if (q.trim().length < 3) return [];
  // Una sola petición por búsqueda y sólo cuando el usuario la pide (política de uso de Nominatim).
  const rows = arr(await request(ctx, `https://nominatim.openstreetmap.org/search?q=${enc(q.trim())}&format=jsonv2&limit=6&addressdetails=1&extratags=1&accept-language=es`, { referrerPolicy: 'origin' }));
  const out: Candidate[] = [];
  for (const r of rows.map(obj)) {
    const cat = clean(r.category);
    const title = clean(r.name);
    if (!title || OSM_SKIP.has(cat)) continue;
    const score = nameScore(q, [title]);
    if (score < MIN_SCORE) continue;
    const a = obj(r.address); const x = obj(r.extratags);
    const street = [clean(a.road), clean(a.house_number)].filter(Boolean).join(' ');
    const city = clean(a.city) || clean(a.town) || clean(a.village) || clean(a.municipality);
    const operator = clean(x.operator);
    const type = clean(r.osm_type); const oid = clean(r.osm_id);
    out.push(mk('osm', `${type}${oid}`, {
      title, score, subtitle: [cat, clean(r.type)].filter(Boolean).join('/'), sourceUrl: `https://www.openstreetmap.org/${enc(type)}/${enc(oid)}`,
      fields: compact({
        name: title, legalName: operator, country: clean(a.country), city,
        address: [street, [clean(a.postcode), city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        web: webUrl(x.website || x['contact:website']) ?? '', phone: clean(x.phone) || clean(x['contact:phone']),
        email: clean(x.email) || clean(x['contact:email']), description: clean(x.description),
      }),
    }));
  }
  return out;
}

export const ADAPTERS: Record<SourceId, (q: string, ctx: Ctx) => Promise<Candidate[]>> = {
  sirene: searchSirene, brreg: searchBrreg, ares: searchAres, gleif: searchGleif, wikidata: searchWikidata, osm: searchOsm,
};
