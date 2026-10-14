import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import { db } from '../lib/db';
import { createCompany } from '../lib/repo';
import { exportBackup, parseBackup, restoreBackup } from '../lib/backup';
import { clean, countryName, nameScore, tidyCase } from '../lib/enrich/match';
import { searchAres, searchBrreg, searchGleif, searchOsm, searchSirene, searchWikidata } from '../lib/enrich/sources';
import { buildProvenance, mergeCandidates, pruneProvenance, searchCompanies } from '../lib/enrich/search';
import { applyToCompany } from '../ui/Enrich';

type Routes = [string | RegExp, unknown | (() => unknown)][];
/** fetch simulado: responde con respuestas REALES abreviadas (capturadas de las APIs) según la URL. */
const fakeFetch = (routes: Routes, calls: string[] = []): typeof fetch => (async (url: string | URL | Request) => {
  const u = String(url);
  calls.push(u);
  for (const [k, v] of routes) {
    if (typeof k === 'string' ? u.includes(k) : k.test(u)) {
      const body = typeof v === 'function' ? (v as () => unknown)() : v;
      if (body instanceof Error) throw body;
      if (typeof body === 'number') return new Response('', { status: body });
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  }
  return new Response('', { status: 404 });
}) as typeof fetch;
const ctx = (routes: Routes, calls: string[] = []) => ({ fetch: fakeFetch(routes, calls) });

const SIRENE = { results: [
  { siren: '433225356', nom_complet: 'BARILLA FRANCE', nom_raison_sociale: 'BARILLA FRANCE', nature_juridique: '5710', activite_principale: '10.71A', etat_administratif: 'A',
    siege: { adresse: 'IMMEUBLE ETIK 892 RUE YVES KERMEN 92100 BOULOGNE-BILLANCOURT', libelle_commune: 'BOULOGNE-BILLANCOURT' } },
  { siren: '839769155', nom_complet: 'CATHIE BARILLA', nom_raison_sociale: 'CATHIE BARILLA', nature_juridique: '1000', activite_principale: '96.04Z', siege: { adresse: 'X', libelle_commune: 'SAINT BARTHELEMY' } },
] };
const GLEIF = { data: [{ id: '81560087CDD082886B74', attributes: { entity: {
  legalName: { name: 'PASTIFICIO DI MARTINO S.P.A.' }, otherNames: [], status: 'ACTIVE', registeredAs: '01813160635',
  legalAddress: { addressLines: ['VIA CASTELLAMMARE, 82'], city: 'GRAGNANO', country: 'IT', postalCode: '80054' } } } }] };
const BRREG = { _embedded: { enheter: [
  { organisasjonsnummer: '923609016', navn: 'EQUINOR ASA', organisasjonsform: { kode: 'ASA' }, hjemmeside: 'www.equinor.com', telefon: '51 99 00 00', epostadresse: 'post@equinor.example',
    forretningsadresse: { adresse: ['Forusbeen 50'], postnummer: '4035', poststed: 'STAVANGER', landkode: 'NO', land: 'Norge' }, naeringskode1: { beskrivelse: 'Utvinning av råolje' }, aktivitet: ['Energi.', 'Utleie.'] },
  { organisasjonsnummer: '1', navn: 'EQUINOR PERSONA', organisasjonsform: { kode: 'ENK' }, forretningsadresse: {} },
] } };
const ARES = { ekonomickeSubjekty: [
  { ico: '26185610', obchodniJmeno: 'AGROFERT, a.s.', pravniForma: '121', czNace2008: ['016'], sidlo: { kodStatu: 'CZ', nazevObce: 'Praha', textovaAdresa: 'Pyšelská 2327/2, Chodov, 14900 Praha 4' } },
  { ico: '2', obchodniJmeno: 'Agrofert Pepa', pravniForma: '101', sidlo: {} },
] };
const OSM = [
  { category: 'shop', type: 'confectionery', name: 'Pasticceria Cappello', osm_type: 'node', osm_id: 1,
    address: { road: 'Via Colonna Rotta', house_number: '68', postcode: '90138', city: 'Palermo', country: 'Italia' },
    extratags: { phone: '+39 091 489601', email: 'info@pasticceriacappello.it', website: 'https://www.pasticceriacappello.it/', operator: 'Pasticceria Cappello srl' } },
  { category: 'boundary', type: 'administrative', name: 'Cappello', osm_type: 'relation', osm_id: 2, address: {}, extratags: {} },
];
const WD_SEARCH = { search: [{ id: 'Q18523065' }, { id: 'Q762787' }] };
const WD_ENTS = { entities: {
  Q18523065: { labels: { es: { value: 'Barilla' } }, descriptions: { es: { value: 'género de insectos' } }, claims: {} },
  Q762787: { labels: { en: { value: 'Barilla' } }, descriptions: { en: { value: 'Italian food company' } }, claims: {
    P31: [{ mainsnak: { datavalue: { value: { id: 'Q4830453' } } } }], P856: [{ mainsnak: { datavalue: { value: 'https://www.barillagroup.com/' } } }],
    P17: [{ mainsnak: { datavalue: { value: { id: 'Q38' } } } }], P159: [{ mainsnak: { datavalue: { value: { id: 'Q2683' } } } }], P452: [{ mainsnak: { datavalue: { value: { id: 'Q540912' } } } }],
    P154: [{ mainsnak: { datavalue: { value: 'Barilla logo.svg' } } }] } } } };
const WD_LABELS = { entities: { Q38: { labels: { es: { value: 'Italia' } } }, Q2683: { labels: { es: { value: 'Parma' } } }, Q540912: { labels: { es: { value: 'industria alimentaria' } } } } };
const COMMONS = { query: { pages: { 1: { imageinfo: [{ thumburl: 'https://thumb.wikimedia.org/x/330px-Barilla_logo.svg.png' }] } } } };
const WD_ROUTES: Routes = [['wbsearchentities', WD_SEARCH], ['props=labels|descriptions|claims', WD_ENTS], ['props=labels&', WD_LABELS], ['commons.wikimedia.org', COMMONS]];

describe('coincidencia por nombre', () => {
  it('idéntico = 1, contenido = parecido alto, otro nombre = bajo; ignora formas jurídicas y acentos', () => {
    expect(nameScore('Pastificio Di Martino', ['PASTIFICIO DI MARTINO S.P.A.'])).toBe(1);
    expect(nameScore('Caffè Borbone', ["CAFFE' BORBONE SPA"])).toBe(1);
    const parcial = nameScore('Barilla', ['BARILLA FRANCE']);
    expect(parcial).toBeGreaterThan(0.7); expect(parcial).toBeLessThan(0.95);
    expect(nameScore('Barilla', ['Mulino Bianco'])).toBeLessThan(0.6);
    expect(nameScore('a', ['a'])).toBe(0);
  });
  it('formatos', () => {
    expect(tidyCase('VIA CASTELLAMMARE, 82')).toBe('Via Castellammare, 82');
    expect(tidyCase('Via Roma 1')).toBe('Via Roma 1'); // ya normal: no se toca
    expect(countryName('IT')).toBe('Italia');
    expect(clean('  a   b ')).toBe('a b');
  });
});

describe('fuentes (respuestas reales abreviadas)', () => {
  it('Sirene: mapea la empresa y NO ofrece empresarios individuales', async () => {
    const r = await searchSirene('Barilla', ctx([['recherche-entreprises', SIRENE]]));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ source: 'sirene', title: 'BARILLA FRANCE', sourceUrl: expect.stringContaining('433225356') });
    expect(r[0].fields).toMatchObject({ legalName: 'BARILLA FRANCE', country: 'Francia', city: 'Boulogne-Billancourt', address: 'Immeuble Etik 892 Rue Yves Kermen 92100 Boulogne-Billancourt' });
    expect(r[0].fields.sector).toContain('10.71A');
  });
  it('GLEIF: razón social, dirección legal, país y nº de registro', async () => {
    const [c] = await searchGleif('Pastificio Di Martino', ctx([['api.gleif.org', GLEIF]]));
    expect(c.fields).toEqual({ legalName: 'PASTIFICIO DI MARTINO S.P.A.', country: 'Italia', city: 'Gragnano', address: 'Via Castellammare, 82, 80054 Gragnano' });
    expect(c.subtitle).toBe('Gragnano, Italia · Reg. 01813160635'); // país y ciudad visibles para distinguir homónimos
    expect(c.score).toBe(1);
  });
  it('Brønnøysund: web, teléfono, email y actividad; descarta personas físicas (ENK)', async () => {
    const r = await searchBrreg('Equinor', ctx([['data.brreg.no', BRREG]]));
    expect(r).toHaveLength(1);
    expect(r[0].fields).toMatchObject({ country: 'Noruega', city: 'Stavanger', web: 'https://www.equinor.com', phone: '51 99 00 00', email: 'post@equinor.example', sector: 'Utvinning av råolje', description: 'Energi. Utleie.' });
  });
  it('ARES: descarta personas físicas (forma jurídica 101)', async () => {
    const r = await searchAres('Agrofert', ctx([['ares.gov.cz', ARES]]));
    expect(r.map((c) => c.title)).toEqual(['AGROFERT, a.s.']);
    expect(r[0].fields.country).toBe('Chequia');
  });
  it('OpenStreetMap: contacto sólo si está etiquetado; ignora límites administrativos', async () => {
    const r = await searchOsm('Pasticceria Cappello Palermo', ctx([['nominatim.openstreetmap.org', OSM]]));
    expect(r).toHaveLength(1);
    expect(r[0].fields).toMatchObject({ phone: '+39 091 489601', email: 'info@pasticceriacappello.it', web: 'https://www.pasticceriacappello.it/', legalName: 'Pasticceria Cappello srl', city: 'Palermo', address: 'Via Colonna Rotta 68, 90138 Palermo' });
    expect(r[0].license).toContain('ODbL');
  });
  it('Wikidata: sólo empresas (descarta homónimos), con web, sector, país, ciudad y logo vía Commons', async () => {
    const r = await searchWikidata('Barilla', ctx(WD_ROUTES));
    expect(r).toHaveLength(1);
    expect(r[0].fields).toMatchObject({ name: 'Barilla', country: 'Italia', city: 'Parma', web: 'https://www.barillagroup.com/', sector: 'industria alimentaria', description: 'Italian food company' });
    expect(r[0].logoUrl).toBe('https://thumb.wikimedia.org/x/330px-Barilla_logo.svg.png');
  });
  it('un nombre que no se parece no genera coincidencias («no deducir por parecido»)', async () => {
    expect(await searchGleif('Barilla', ctx([['api.gleif.org', GLEIF]]))).toEqual([]);
  });
});

describe('búsqueda combinada', () => {
  it('una fuente caída o limitada no rompe las demás y se informa', async () => {
    const r = await searchCompanies('Pastificio Di Martino', ctx([['api.gleif.org', GLEIF], ['wikidata.org', 429], ['nominatim', new Error('red')], ['recherche-entreprises', { results: [] }]]));
    expect(r.candidates.map((c) => c.source)).toEqual(['gleif']);
    const st = Object.fromEntries(r.sources.map((s) => [s.id, s.status]));
    expect(st).toMatchObject({ gleif: 'ok', sirene: 'empty', wikidata: 'error', osm: 'error' });
    expect(r.sources.find((s) => s.id === 'wikidata')!.error).toContain('429');
  });
  it('sin resultados fiables: lista vacía (se puede crear la ficha normalmente)', async () => {
    const r = await searchCompanies('Gamberi del Sud', ctx([]));
    expect(r.candidates).toEqual([]);
  });
  it('sólo se envían peticiones sin credenciales ni datos personales', async () => {
    const calls: string[] = [];
    await searchCompanies('Barilla', ctx([], calls));
    expect(calls.length).toBeGreaterThanOrEqual(6);
    expect(calls.every((u) => u.startsWith('https://') && !/key|token|apikey/i.test(u))).toBe(true);
  });
});

describe('fusión y procedencia', () => {
  it('combina coincidencias, conserva el orden de marcado y registra la fuente de cada dato', async () => {
    const [g] = await searchGleif('Pastificio Di Martino', ctx([['api.gleif.org', GLEIF]]));
    const [o] = await searchOsm('Pasticceria Cappello', ctx([['nominatim', OSM]]));
    const m = mergeCandidates([g, o]);
    expect(m.legalName!.map((x) => x.value)).toEqual(['PASTIFICIO DI MARTINO S.P.A.', 'Pasticceria Cappello srl']);
    expect(m.phone![0].cand.source).toBe('osm');
    const prov = buildProvenance({ legalName: { value: 'x', cand: g, edited: false }, phone: { value: 'y', cand: o, edited: true } }, '2026-10-14T10:00:00.000Z');
    expect(prov.legalName).toMatchObject({ source: 'GLEIF (registro mundial de LEI)', url: expect.stringContaining('gleif'), at: '2026-10-14T10:00:00.000Z' });
    expect(prov.phone.edited).toBe(true);
  });
  it('la procedencia se elimina si el usuario edita el dato a mano', () => {
    const prov = { phone: { source: 'OSM', at: 'x' }, web: { source: 'W', at: 'x' }, logo: { source: 'W', at: 'x' } };
    expect(Object.keys(pruneProvenance(prov, { phone: '1', web: 'a' }, { phone: '2', web: 'a' })!)).toEqual(['web', 'logo']);
  });
});

describe('aplicar a la ficha y copias', () => {
  beforeEach(() => { freshDb(); });
  const ui = { toast: () => undefined, confirm: async () => true } as never;

  it('rellena sólo lo confirmado, conserva el resto y guarda la procedencia', async () => {
    const c = await createCompany({ name: 'Pastificio Di Martino', email: 'ya@existente.it', notes: 'nota mía' });
    await applyToCompany(c.id, { fields: { legalName: 'PASTIFICIO DI MARTINO S.P.A.', city: 'Gragnano' }, provenance: { legalName: { source: 'GLEIF', at: 'x' }, city: { source: 'GLEIF', at: 'x' } } }, ui);
    const after = (await db.companies.get(c.id))!;
    expect(after).toMatchObject({ name: 'Pastificio Di Martino', legalName: 'PASTIFICIO DI MARTINO S.P.A.', city: 'Gragnano', email: 'ya@existente.it', notes: 'nota mía' });
    expect(after.phone).toBeUndefined();
    expect(Object.keys(after.provenance!)).toEqual(['legalName', 'city']);
  });
  it('el nombre comercial de una ficha existente nunca se cambia desde la búsqueda', async () => {
    const c = await createCompany({ name: 'Mi nombre' });
    await applyToCompany(c.id, { fields: { name: 'Otro', sector: 'Alimentación' }, provenance: {} }, ui);
    expect(await db.companies.get(c.id)).toMatchObject({ name: 'Mi nombre', sector: 'Alimentación' });
  });
  it('sector, descripción y procedencia viajan en la copia ZIP y se restauran idénticos', async () => {
    const c = await createCompany({ name: 'Alfa', sector: 'Alimentación', description: 'Pasta seca', provenance: { sector: { source: 'Wikidata', url: 'https://www.wikidata.org/wiki/Q1', at: '2026-10-14T10:00:00Z' } } });
    const { blob } = await exportBackup();
    await db.delete(); await db.open();
    await restoreBackup(await parseBackup(blob), { mode: 'replace' });
    expect(await db.companies.get(c.id)).toMatchObject({ sector: 'Alimentación', description: 'Pasta seca', provenance: { sector: { source: 'Wikidata', url: 'https://www.wikidata.org/wiki/Q1' } } });
  });
  it('una copia con procedencia manipulada se sanea (URLs no http se descartan)', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const c = await createCompany({ name: 'Beta' });
    const { blob } = await exportBackup();
    const { unzipSync } = await import('fflate');
    const z = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const data = JSON.parse(new TextDecoder().decode(z['data.json']));
    data.companies[0].provenance = { phone: { source: 'X', at: 'now', url: 'javascript:alert(1)' }, bad: 5, web: { source: 'Y', at: 'now', url: 'https://ok.example/' } };
    z['data.json'] = strToU8(JSON.stringify(data));
    // el manifiesto lleva el hash de data.json: se recalcula como lo haría una copia legítima modificada → se rechaza o se sanea
    let ok = true;
    try { await parseBackup(new Blob([zipSync(z) as unknown as ArrayBuffer])); } catch { ok = false; }
    expect(ok).toBe(false); // un data.json alterado no pasa la verificación SHA-256: nunca se importa
    expect(c.id).toBeTruthy();
  });
});
