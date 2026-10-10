// Interpretación de texto OCR de tarjetas de visita (es/it/fr/en). Es independiente del motor OCR.
// Principios: (1) nunca elegir una cadena ilegible; (2) cada campo lleva confianza y alternativas;
// (3) lo dudoso queda vacío o marcado "revisar"; (4) lo no clasificado se conserva; (5) nada se inventa.

export type FieldKey = 'fullName' | 'role' | 'company' | 'email' | 'phone' | 'mobile' | 'web' | 'address';

export interface FieldInfo {
  confidence: number; // 0..1
  level: 'high' | 'review';
  alternatives: string[];
}

export interface EmailHit { address: string; kind: 'corporate' | 'personal' }
export interface PhoneHit { raw: string; normalized: string; kind: 'mobile' | 'fax' | 'phone' | 'unknown'; inferred?: boolean }
export interface OcrLineIn { text: string; conf?: number }

export interface CardFields {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  company?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  web?: string;
  address?: string;
  emails: EmailHit[];
  addresses: string[];
  /** Datos adicionales o no clasificados que no caben en un campo (se conservan, nunca se descartan en silencio). */
  extras: string[];
  /** Campos rellenados con baja certeza (la UI los marca «revisar»). */
  uncertain: string[];
  info: Partial<Record<FieldKey, FieldInfo>>;
  /** Datos de la EMPRESA (no de la persona) deducidos de la tarjeta; sólo con evidencia en el texto. */
  org: OrgFields;
  department?: string;
}

export interface OrgFields {
  commercialName?: string; // sin forma jurídica
  legalName?: string; // con forma jurídica (sólo si aparece)
  legalAddress?: string;
  operationalAddress?: string;
  city?: string;
  country?: string;
  /** país/ciudad deducidos por el prefijo telefónico o el código postal: revisar */
  inferred: ('country' | 'city')[];
  email?: string; // buzón genérico (info@, ventas@…)
  phone?: string; // teléfono fijo / centralita
}

// ---------------------------------------------------------------- patrones
const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}/g;
const TLDS = 'com|it|es|fr|eu|net|org|info|biz|de|uk|pt|co|io|ch|be|nl|at|us|ca|shop|store|online|food|foods|sicilia|cat|pro';
const URL_RE = new RegExp(`\\b(?:https?:\\/\\/|www\\.)[^\\s,;<>()]+|\\b[a-z0-9][a-z0-9\\-]*(?:\\.[a-z0-9\\-]+)*\\.(?:co\\.uk|com\\.[a-z]{2}|${TLDS})(?:\\/[^\\s,;<>()]*)?(?![\\w@])`, 'gi');
const PHONE_RE = /(?:\+|00)?\(?\d[\d\s().\-\/]{6,}\d/g;

const FREE_MAIL = /(^|\.)(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|libero|virgilio|tiscali|alice|tin|fastwebnet|icloud|me|mac|aol|gmx|web|protonmail|proton|wanadoo|orange|free|laposte|sfr|neuf|telefonica|terra|movistar|mail|zoho|pec)\./i;

const MOBILE_LABEL = /(?<![\p{L}])(mob(?:ile|il)?|cell(?:ulare|ular)?|cel|móvil|movil|portable|port|handy|whatsapp|wa|gsm|m)(?![\p{L}])\s*[.:\-]?\s*$/iu;
const PHONE_LABEL = /(?<![\p{L}])(tel(?:efono|éfono|\.?\/?fax)?|tél|phone|ph|office|ufficio|uff|fisso|fixe|direct(?:o|a)?|bureau|oficina|centralino|t)(?![\p{L}])\s*[.:\-]?\s*$/iu;
const FAX_LABEL = /(?<![\p{L}])(fax|f)(?![\p{L}])\s*[.:\-]?\s*$/iu;
const FISCAL = /(p\.?\s?iva|partita\s+iva|vat|c\.?\s?f\.?\b|cod\.?\s*fisc|\brea\b|\bcif\b|\bnif\b|siret|siren|\bsdi\b|iban|swift|reg\.?\s*imp|n\.?\s?iscr|tva|ust-?id|registro)/i;

const ROLE_KW = [
  'co[\\s-]?founders?', 'founders?', 'ceo', 'cfo', 'coo', 'cto', 'cmo', 'owner', 'titolare', 'socio', 'partner', 'associate',
  'amministratore(?:\\s+(?:delegato|unico))?', 'presidente', 'président', 'president', 'vice[\\s-]?president',
  'direttore', 'direttrice', 'director[a]?', 'directeur', 'directrice', 'gérant[e]?', 'gerente', 'gestore',
  'responsabile', 'responsable', 'manager', 'head', 'chief', 'jefe', 'chef', 'capo', 'executive',
  'export', 'sales', 'ventas', 'vendite', 'comercial', 'commerciale', 'commercial', 'buyer', 'purchasing', 'procurement', 'acquisti', 'compras', 'achats', 'acheteur[se]?',
  'marketing', 'logistics?', 'logistica', 'logística', 'logistique', 'quality\\s+(?:manager|assurance)', 'qualità', 'calidad',
  'propietari[oa]', 'fundador[a]?', 'fondatore', 'fondatrice', 'fondateur', 'fondatrice', 'consultant', 'consultor', 'agente?', 'representante', 'representative',
  'rappresentante', 'engineer', 'ingeniero', 'ingénieur', 'ingegnere', 'sourcing', 'account', 'area', 'dirigente', 'delegado', 'délégué',
];
const ROLE_RE = new RegExp(`(?<![\\p{L}])(?:${ROLE_KW.join('|')})(?![\\p{L}])`, 'iu');

const STREET = '(?:via|viale|v\\.le|corso|c\\.so|piazza|p\\.zza|piazzale|strada|contrada|c\\.da|località|localita|loc\\.|vicolo|largo|zona\\s+industriale|z\\.i\\.|area\\s+industriale|calle|c\\/|avenida|avda\\.?|paseo|plaza|polígono|poligono|carrer|camino|rue|avenue|av\\.|boulevard|bd|chemin|allée|route|impasse|place|zone\\s+industrielle|street|st\\.|road|rd\\.|lane|drive|park|square|strasse|straße|str\\.)';
const STREET_RE = new RegExp(`(?<![\\p{L}])${STREET}(?![\\p{L}])`, 'iu');
const POSTAL_RE = /(?:^|\s)(?:[A-Z]{1,2}[-\s]?)?\d{4,5}(?:\s?[A-Z]{2})?\s+[\p{L}]{3,}|\b[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2}\b|\(\s?[A-Z]{2}\s?\)/u;
const ADDRESS_HEADER = /^(sede\s+(?:legale|operativa|amministrativa)|stabilimento|magazzino|uffici|headquarters?|head\s+office|registered\s+office|warehouse|plant|siège|siege|dirección|direccion|address|indirizzo|adresse)\s*:?\s*$/i;

type AddrKind = 'legal' | 'operational' | 'unknown';
const LEGAL_LABEL = /(sede\s+legale|sede\s+amministrativa|registered\s+office|head\s*quarters?|head\s+office|siège\s+social|siege\s+social|domicilio\s+(?:fiscal|social)|\bsede\b)/i;
const OPERATIONAL_LABEL = /(sede\s+operativa|stabilimento|magazzino|unit[àa]\s+produttiva|warehouse|plant|factory|almac[ée]n|f[áa]brica|usine|entrep[ôo]t|laboratorio|production)/i;
const kindOfLabel = (t: string): AddrKind => (OPERATIONAL_LABEL.test(t) ? 'operational' : LEGAL_LABEL.test(t) ? 'legal' : 'unknown');
const ADDR_LABEL_INLINE = /^(sede\s+(?:legale|operativa|amministrativa)|stabilimento|magazzino|registered\s+office|head\s+office|headquarters?|warehouse|plant|siège\s+social|almac[ée]n|f[áa]brica|usine|entrep[ôo]t)\s*[:\-–]\s*(.+)$/i;
const GENERIC_MAILBOX = /^(info|ufficio|office|contact|contacto|contatti|contatto|sales|vendite|ventas|export|ordini|orders|pedidos|amministrazione|admin|administracion|accounting|commerciale|comercial|customerservice|servizio|hello|mail|segreteria|reception|marketing|logistica|qualita|acquisti|purchasing|direzione|general|bonjour|commande|booking|supply|ufficioacquisti|assistenza|support)$/i;
const DEPT_RE = /^(?:dept\.?|department|dipartimento|departamento|département|reparto|ufficio|servizio|service|servicio|area)\s*[:\-]?\s*(.+)$|(?:^|\s)(?:department|dipartimento|departamento|département)$/i;
const COUNTRY_WORDS: [RegExp, string][] = [
  [/^(italy|italia|italie)$/i, 'Italia'], [/^(spain|españa|espana|espagne)$/i, 'España'], [/^(france|francia)$/i, 'Francia'],
  [/^(germany|deutschland|alemania|germania|allemagne)$/i, 'Alemania'], [/^(united kingdom|uk|u\.k\.|great britain|reino unido|regno unito)$/i, 'Reino Unido'],
  [/^(portugal|portogallo)$/i, 'Portugal'], [/^(switzerland|svizzera|suisse|suiza|schweiz)$/i, 'Suiza'], [/^(belgium|belgio|belgique|bélgica)$/i, 'Bélgica'],
  [/^(netherlands|olanda|pays-bas|países bajos|nederland)$/i, 'Países Bajos'], [/^(usa|u\.s\.a\.|united states|stati uniti|estados unidos|états-unis)$/i, 'EE. UU.'],
];
const PHONE_COUNTRY: [RegExp, string][] = [
  [/^\+?39/, 'Italia'], [/^\+?34/, 'España'], [/^\+?33/, 'Francia'], [/^\+?44/, 'Reino Unido'], [/^\+?49/, 'Alemania'],
  [/^\+?351/, 'Portugal'], [/^\+?41/, 'Suiza'], [/^\+?32/, 'Bélgica'], [/^\+?31/, 'Países Bajos'], [/^\+?1/, 'EE. UU.'],
];

const NAME_TITLE_RE = /^(sig\.ra|sig\.|sig|dott\.ssa|dott\.|dott|dr\.ssa|dr\.|dra\.|dr|ing\.|ing|avv\.|arch\.|prof\.|prof|mr\.|mr|mrs\.|mrs|ms\.|ms|mme\.|mme|m\.|sr\.|sr|sra\.|sra|d\.|don)\s+/i;
const BUSINESS_WORDS = /(?<![\p{L}])(pasticceria|panificio|pastificio|azienda|agricola|alimentari|alimentaria|alimentation|alimentos|surgelati|congelati|congelados|surgelés|frozen|foods?|food|group|groupe|gruppo|grupo|import|export|trading|distribuzione|distribution|distribución|distributori|casa|maison|antica|antico|fratelli|figli|industria|industrie|industries|conserve|olio|oleificio|caseificio|salumificio|cantina|vini|wines?|spa|srl|ltd|gmbh|sarl|company|co\.|corp|laboratorio|produzione|prodotti|products|productos|produits|sapori|gusti|dolci|bakery|company|international|internacional|italia|italy|sicilia|sicily|sicilian|siciliana|siciliano|napoli|roma|milano|espa[ñn]a|france|spain|catering|hotel|ristorante|restaurant)(?![\p{L}])/iu;

export function extractEmails(text: string): string[] {
  const t = normalizeContactText(text);
  const found = (t.match(EMAIL_RE) || []).map((e) => e.replace(/[.,;:]+$/, '').toLowerCase());
  return [...new Set(found)];
}

export function extractUrls(text: string): string[] {
  const noEmails = normalizeContactText(text).replace(EMAIL_RE, ' ');
  const found = (noEmails.match(URL_RE) || []).map((u) => u.replace(/[.,;:]+$/, ''));
  return [...new Set(found)];
}

/**
 * El OCR suele leer «@» como «Q», «©», «®» o «€», sobre todo con texto claro sobre fondo oscuro.
 * Sólo se repara si la línea no tiene ya una «@» y lo que sigue parece un dominio con TLD conocida.
 */
const AT_MISREAD = new RegExp(String.raw`([A-Za-z0-9][A-Za-z0-9._\-]{1,})[Q©®€](?=[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.(?:co\.uk|${TLDS})(?![A-Za-z0-9]))`);
const DOT_LOST_Q = new RegExp(String.raw`([A-Za-z0-9._\-]+[Q©®€][A-Za-z0-9\-]+)\s((?:co\.uk|${TLDS}))$`);
const DOT_LOST = new RegExp(String.raw`((?:www\.\S+|\S+@\S+))\s((?:co\.uk|${TLDS}))$`, 'i');
export function repairAtSign(line: string): string {
  const out = line.includes('@') ? line : line.replace(DOT_LOST_Q, '$1.$2').replace(AT_MISREAD, '$1@');
  // «dominio fr» → «dominio.fr»: el OCR a veces pierde el último punto de una web o email
  return out.replace(DOT_LOST, '$1.$2');
}

/** Corrige errores típicos del OCR en direcciones de contacto: «a @ b.com», «(at)», «E-mail: ». */
function normalizeContactText(s: string): string {
  return s
    .replace(/\s*\(\s*at\s*\)\s*/gi, '@')
    .replace(/([A-Za-z0-9._%+\-])\s+@\s*([A-Za-z0-9\-])/g, '$1@$2')
    .replace(/([A-Za-z0-9._%+\-])\s*@\s+([A-Za-z0-9\-])/g, '$1@$2');
}

// ---------------------------------------------------------------- teléfonos
const MOBILE_PATTERNS: RegExp[] = [
  /^(?:\+?39)?3\d{8,9}$/, // IT
  /^(?:\+?34)?[67]\d{8}$/, // ES
  /^(?:\+?33|0)?[67]\d{8}$/, // FR
  /^(?:\+?44|0)?7\d{9}$/, // UK
  /^(?:\+?49|0)?1[567]\d{8,9}$/, // DE
];

function classifyPhoneByLabel(before: string, line: string): PhoneHit['kind'] {
  if (FAX_LABEL.test(before)) return 'fax';
  if (MOBILE_LABEL.test(before)) return 'mobile';
  if (PHONE_LABEL.test(before)) return 'phone';
  // etiqueta general de la línea cuando hay un solo número
  const only = (line.match(new RegExp(PHONE_RE.source, 'g')) || []).length === 1;
  if (only) {
    if (/^\s*(fax|f)\b/i.test(line)) return 'fax';
    if (/(mob|cell|móvil|movil|portable|whatsapp)/i.test(line)) return 'mobile';
    if (/(tel|tél|phone|ufficio|office|bureau)/i.test(line)) return 'phone';
  }
  return 'unknown';
}

/** Teléfonos con su pista de tipo (móvil/fax/fijo) según etiquetas y, si no hay, según el formato del número. */
export function extractPhones(text: string): PhoneHit[] {
  const hits: PhoneHit[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (FISCAL.test(line)) continue;
    const clean = normalizeContactText(line).replace(EMAIL_RE, ' ');
    PHONE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PHONE_RE.exec(clean))) {
      const raw = m[0].trim().replace(/[\s.\-\/(]+$/, '');
      const digits = raw.replace(/\D/g, '');
      if (digits.length < 8 || digits.length > 15) continue;
      if (/^\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}$/.test(raw)) continue;
      if (/^(?:19|20)\d{2}[\s.\-]+(?:19|20)\d{2}$/.test(raw)) continue;
      const before = clean.slice(Math.max(0, m.index - 14), m.index);
      let kind = classifyPhoneByLabel(before, clean);
      let inferred = false;
      const compact = raw.replace(/^00/, '+').replace(/[^\d+]/g, '');
      if (kind === 'unknown' && MOBILE_PATTERNS.some((p) => p.test(compact))) { kind = 'mobile'; inferred = true; }
      const normalized = compact;
      if (!hits.some((h) => h.normalized === normalized)) hits.push({ raw, normalized, kind, inferred });
    }
  }
  return hits;
}

// ---------------------------------------------------------------- utilidades de texto
const letters = (s: string) => (s.match(/\p{L}/gu) || []).length;
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** ¿La línea parece texto humano (y no basura de logotipo)? */
export function plausibility(line: string): number {
  const t = line.replace(/\s+/g, ' ').trim();
  if (t.length < 3) return 0;
  const nonSpace = t.replace(/\s/g, '');
  const l = letters(t);
  const ratio = (l + (t.match(/\d/g) || []).length * 0.6) / nonSpace.length;
  const tokens = t.split(' ');
  const single = tokens.filter((x) => x.length <= 1).length / tokens.length;
  const words3 = tokens.filter((x) => letters(x) >= 3 && /[aeiouáéíóúàèìòùâêîôûäëïöüyAEIOU]/.test(x)).length;
  const acronym = tokens.some((x) => /^[A-Z]{2,}$/.test(x));
  let s = ratio;
  if (single > 0.4) s -= 0.35;
  if (!words3 && !acronym) s -= 0.4;
  if (/[|¢£§¥©®™<>{}\\^~_=]{1}/.test(t)) s -= 0.15;
  // tokens "raros": símbolos incrustados o mezcla de dígitos y letras (logotipos o texto girado mal leído)
  const weird = tokens.filter((x) => {
    const core = x.replace(/^[^\p{L}\d]+|[^\p{L}\d.)º°]+$/gu, '');
    if (!core) return true;
    if (/[_/\\|*{}[\]<>^~=]/.test(core)) return true;
    if (/\p{L}\d|\d\p{L}/u.test(core) && !/^\d+[ºª°]?$|^\d+\p{L}$/u.test(core)) return true;
    return /^[*(){}[\]<>^~=|]|[*(){}[\]<>^~=|]$/.test(x);
  }).length / tokens.length;
  if (weird > 0.25) s -= 0.5 * weird;
  return Math.max(0, Math.min(1, s));
}

/** Estrictamente: ¿tiene forma jurídica reconocible? Evita falsos positivos como «sa» en basura de OCR. */
export function hasLegalSuffix(line: string): boolean {
  const tokens = line.replace(/[,;]/g, ' ').split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;
  const SET = new Set(['SRL', 'SRLS', 'SPA', 'SAS', 'SNC', 'SL', 'SLU', 'SA', 'SARL', 'SCARL', 'GMBH', 'LTD', 'LLC', 'INC', 'BV', 'NV', 'AG', 'EIRL', 'EURL', 'SAU', 'SCA', 'LIMITED', 'CORP', 'LDA', 'KG', 'OHG']);
  const hasWord = (idx: number) => tokens.slice(0, idx).some((t) => letters(t) >= 3);
  for (let i = 1; i < tokens.length; i++) {
    // formas con puntos separados: «S. r. l.», «S.p.A.»
    const joined = [tokens[i], tokens[i + 1], tokens[i + 2]].filter(Boolean);
    for (let n = 1; n <= 3 && n <= joined.length; n++) {
      const cand = joined.slice(0, n).join('');
      const bare = cand.replace(/[.\s]/g, '');
      if (!SET.has(bare.toUpperCase())) continue;
      const dotted = /\./.test(cand);
      const lower = cand === cand.toLowerCase();
      if (lower && !dotted) continue; // «sa» en minúsculas sin puntos: ruido
      if (bare.length === 2 && !dotted && cand !== cand.toUpperCase() && !/^(Sl|Sa|Ag|Bv|Nv|Kg)$/.test(cand)) continue;
      if (hasWord(i)) return true;
    }
  }
  return false;
}

const isAllCaps = (s: string) => {
  const l = s.replace(/[^\p{L}]/gu, '');
  return l.length >= 4 && l === l.toUpperCase();
};
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s\-'’.])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());

const domainLabel = (host: string) => host.toLowerCase().replace(/^www\./, '').split('.')[0].replace(/[^a-z0-9]/g, '');
const hostOf = (u: string) => u.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[\/?#].*$/, '');

function looksLikeName(line: string): { ok: boolean; clean: string } {
  const clean0 = line.replace(NAME_TITLE_RE, '').replace(/[,;:]+$/, '').trim();
  const l = clean0;
  if (l.length < 5 || l.length > 42) return { ok: false, clean: l };
  if (/[@\d\/\\:|_&]/.test(l)) return { ok: false, clean: l };
  if (ROLE_RE.test(l) || STREET_RE.test(l) || hasLegalSuffix(l) || BUSINESS_WORDS.test(l)) return { ok: false, clean: l };
  const words = l.split(/\s+/);
  if (words.length < 2 || words.length > 4) return { ok: false, clean: l };
  const particles = new Set(['de', 'del', 'della', 'delle', 'dello', 'di', 'da', 'dal', 'van', 'von', 'le', 'la', 'dos', 'das', 'y', 'e', 'el', 'al', 'mac', 'mc']);
  const okWord = (w: string) => particles.has(w.toLowerCase()) || /^\p{Lu}[\p{L}'’.\-]*$/u.test(w) && letters(w) >= 2;
  if (!words.every(okWord)) return { ok: false, clean: l };
  if (words.filter((w) => !particles.has(w.toLowerCase())).length < 2) return { ok: false, clean: l };
  return { ok: true, clean: isAllCaps(l) ? titleCase(l) : l };
}

function nameEmailBonus(name: string, emails: string[]): number {
  const toks = norm(name) ? name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[\s\-'’.]+/).filter((t) => t.length >= 2) : [];
  if (toks.length < 2) return 0;
  let best = 0;
  for (const e of emails) {
    const local = e.split('@')[0].toLowerCase().replace(/\d+/g, '');
    const parts = local.split(/[._\-]+/).filter(Boolean);
    const first = toks[0]; const last = toks[toks.length - 1];
    const hasLast = local.includes(last) && last.length >= 3;
    const hasFirst = local.includes(first) && first.length >= 3;
    const initial = parts.includes(first[0]) || local.startsWith(first[0] + last.slice(0, 3));
    let s = 0;
    if (hasFirst && hasLast) s = 6;
    else if (hasLast && (initial || parts.length > 1 || local === last)) s = 5;
    else if (hasFirst) s = 3.5;
    else if (hasLast) s = 3;
    best = Math.max(best, s);
  }
  return best;
}

function cleanEdges(s: string): string {
  return s.replace(/^[^\p{L}\d(]+/u, '').replace(/[^\p{L}\d.)!]+$/u, '').replace(/\s{2,}/g, ' ').trim();
}

const toLevel = (c: number): FieldInfo['level'] => (c >= 0.75 ? 'high' : 'review');

// ---------------------------------------------------------------- parser principal
export function parseCard(input: OcrLineIn[]): CardFields {
  const out: CardFields = { emails: [], addresses: [], extras: [], uncertain: [], info: {}, org: { inferred: [] } };
  const repairedAt = new Set<string>();
  const lines = input
    .map((l) => ({ text: l.text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(), conf: (l.conf ?? 90) / 100 }))
    .filter((l) => l.text.length > 1)
    .map((l) => {
      const fixed = repairAtSign(l.text);
      if (fixed !== l.text) repairedAt.add(fixed);
      return { ...l, text: fixed };
    });
  const used = new Set<number>();
  const text = lines.map((l) => l.text).join('\n');
  const setInfo = (k: FieldKey, conf: number, alternatives: string[] = []) => {
    const c = Math.max(0, Math.min(1, conf));
    out.info[k] = { confidence: c, level: toLevel(c), alternatives: [...new Set(alternatives)].slice(0, 4) };
    if (toLevel(c) === 'review' && !out.uncertain.includes(k)) out.uncertain.push(k);
  };
  const lineConf = (i: number) => Math.min(1, Math.max(0.3, lines[i].conf));

  // ---- emails
  const emailLines = new Map<string, number>();
  lines.forEach((l, i) => { for (const e of extractEmails(l.text)) if (!emailLines.has(e)) emailLines.set(e, i); });
  const emailList = [...emailLines.keys()];
  for (const [e, i] of emailLines) {
    const rest = normalizeContactText(lines[i].text).replace(EMAIL_RE, '').replace(/(e-?mail|mail|pec|[em])\s*[:.]?/gi, '').trim();
    if (rest.replace(/[^\p{L}\d]/gu, '').length < 3) used.add(i);
    out.emails.push({ address: e, kind: FREE_MAIL.test(e.split('@')[1]) ? 'personal' : 'corporate' });
  }

  // ---- web
  const urlLines = new Map<string, number>();
  lines.forEach((l, i) => { for (const u of extractUrls(l.text)) if (!urlLines.has(u)) urlLines.set(u, i); });
  const urls = [...urlLines.keys()]; // extractUrls ya excluye los dominios que forman parte de un email
  const social = urls.filter((u) => /(linkedin|facebook|instagram|twitter|x\.com|tiktok|youtube)\./i.test(u));
  const webs = urls.filter((u) => !social.includes(u));
  if (webs[0]) {
    out.web = webs[0];
    const i = urlLines.get(webs[0])!;
    setInfo('web', repairedAt.has(lines[i].text) ? 0.55 : Math.min(0.95, lineConf(i) + 0.1), webs.slice(1));
    if (letters(lines[i].text.replace(webs[0], '')) < 3) used.add(i);
    for (const w of webs.slice(1)) out.extras.push(`Web: ${w}`);
  }
  for (const s of social) out.extras.push(`Red social: ${s}`);

  // ---- teléfonos (por línea, para conservar la confianza OCR)
  const phones = extractPhones(text);
  const phoneLine = (h: PhoneHit) => lines.findIndex((l) => l.text.replace(/\D/g, '').includes(h.normalized.replace(/\D/g, '')));
  const mobiles = phones.filter((p) => p.kind === 'mobile');
  const fixed = phones.filter((p) => p.kind === 'phone');
  const unknown = phones.filter((p) => p.kind === 'unknown');
  const faxes = phones.filter((p) => p.kind === 'fax');
  const phoneConf = (h: PhoneHit, base: number) => { const i = phoneLine(h); return (i >= 0 ? lineConf(i) : 0.7) * base; };
  if (mobiles[0]) { out.mobile = mobiles[0].raw; setInfo('mobile', phoneConf(mobiles[0], mobiles[0].inferred ? 0.8 : 1), mobiles.slice(1).map((m) => m.raw)); }
  if (fixed[0]) { out.phone = fixed[0].raw; setInfo('phone', phoneConf(fixed[0], 1), fixed.slice(1).map((m) => m.raw)); }
  if (!out.phone && unknown[0]) {
    out.phone = unknown[0].raw; setInfo('phone', phoneConf(unknown[0], 0.6), unknown.slice(1).map((m) => m.raw));
    unknown.shift();
  }
  const leftPhones = [...mobiles.slice(1).map((p) => ['Móvil', p] as const), ...fixed.slice(1).map((p) => ['Tel', p] as const),
    ...unknown.slice(out.phone && !fixed[0] ? 0 : 0).filter((p) => p.raw !== out.phone).map((p) => ['Teléfono sin etiqueta', p] as const),
    ...faxes.map((p) => ['Fax', p] as const)];
  for (const [lab, p] of leftPhones) out.extras.push(`${lab}: ${p.raw}`);
  for (const h of phones) { const i = phoneLine(h); if (i >= 0 && lines[i].text.replace(/[\d\s().+\-\/:]|tel|mob|cell|fax|móvil|movil|portable|[mtf]\b/gi, '').trim().length < 3) used.add(i); }

  // ---- direcciones (con etiqueta legal / operativa cuando la tarjeta la trae)
  const addrList: { text: string; kind: AddrKind; line: number }[] = [];
  let pendingKind: AddrKind = 'unknown';
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    let t = lines[i].text;
    if (ADDRESS_HEADER.test(t)) { pendingKind = kindOfLabel(t); used.add(i); continue; }
    let kind: AddrKind = pendingKind;
    const inline = t.match(ADDR_LABEL_INLINE);
    if (inline) { kind = kindOfLabel(inline[1]); t = inline[2]; lines[i].text = t; }
    if (FISCAL.test(t) || plausibility(t) < 0.4) continue;
    const street = STREET_RE.test(t) && /\d/.test(t);
    if (!street) continue;
    const parts = [t]; used.add(i);
    const next = lines[i + 1];
    if (next && !used.has(i + 1) && POSTAL_RE.test(next.text) && !ROLE_RE.test(next.text) && !FISCAL.test(next.text) && !STREET_RE.test(next.text)) { parts.push(next.text); used.add(i + 1); }
    addrList.push({ text: parts.join(', '), kind, line: i });
    pendingKind = 'unknown';
  }
  // «CAP Ciudad» suelto (sin calle detectada) → dirección parcial
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const t = lines[i].text;
    if (/^\s*(?:[A-Z]{1,2}[-\s]?)?\d{5}\s+\p{L}{3,}/u.test(t) && !/@|\+|tel/i.test(t) && !FISCAL.test(t)) { addrList.push({ text: t, kind: pendingKind, line: i }); used.add(i); }
  }
  out.addresses = addrList.map((a) => a.text);
  if (addrList.length) {
    const legal = addrList.find((a) => a.kind === 'legal') ?? addrList.find((a) => a.kind === 'unknown');
    const oper = addrList.find((a) => a.kind === 'operational');
    if (legal) {
      out.address = legal.text; out.org.legalAddress = legal.text;
      setInfo('address', lineConf(legal.line) * 0.95, addrList.filter((a) => a !== legal).map((a) => a.text));
    }
    if (oper) out.org.operationalAddress = oper.text;
    if (!legal && oper) { out.address = oper.text; setInfo('address', lineConf(oper.line) * 0.95); }
    for (const a of addrList) if (a !== legal && a !== oper) out.extras.push(`Dirección: ${a.text}`);
    // ciudad: «CAP Ciudad (PR)» en la dirección legal (o la primera)
    const cityHit = (legal ?? oper ?? addrList[0]).text.match(/(?:^|[\s,])(?:[A-Z]{1,2}[-\s]?)?\d{4,5}\s+([\p{L}][\p{L}'’.\- ]{1,40}?)\s*(?:\(\s*[A-Z]{2}\s*\))?\s*$/u);
    if (cityHit) out.org.city = cityHit[1].trim();
  }

  // ---- departamento (sólo con palabra clave explícita; un «Responsable Ufficio Acquisti» sigue siendo cargo)
  const STRONG_ROLE = /(responsab|director|direttore|manager|gerente|head|chief|jefe)/i;
  lines.forEach((l, i) => {
    if (used.has(i) || out.department || l.text.length > 50 || /@|\d{3}/.test(l.text) || STRONG_ROLE.test(l.text) || plausibility(l.text) < 0.55) return;
    const m = l.text.match(DEPT_RE);
    if (m) { out.department = cleanEdges(m[1] ?? l.text); used.add(i); }
  });

  // ---- cargo
  const roleCands = lines.map((l, i) => ({ l, i })).filter(({ l, i }) =>
    !used.has(i) && ROLE_RE.test(l.text) && l.text.length <= 60 && !/@/.test(l.text) && !hasLegalSuffix(l.text) && plausibility(l.text) >= 0.55 && !STREET_RE.test(l.text));
  let roleIdx = -1;
  if (roleCands.length) {
    // prefiere la línea con palabra clave fuerte y más corta
    const strong = /(founder|ceo|owner|titolare|director|direttore|amministratore|presidente|manager|responsab|gerente|socio|partner|head|chief|buyer|export|sales)/i;
    const sorted = [...roleCands].sort((a, b) => Number(strong.test(b.l.text)) - Number(strong.test(a.l.text)) || a.i - b.i);
    roleIdx = sorted[0].i;
    out.role = cleanEdges(lines[roleIdx].text).replace(/(?<=\p{L}) [8B] (?=\p{L})/u, ' & '); // «CEO 8 Co Founder»: la «&» suele leerse como 8
    used.add(roleIdx);
    setInfo('role', lineConf(roleIdx) * (strong.test(out.role) ? 1 : 0.8), sorted.slice(1).map((c) => cleanEdges(c.l.text)));
  }

  // ---- empresa
  const hosts = [...emailList.filter((e) => !FREE_MAIL.test(e.split('@')[1])).map((e) => e.split('@')[1]), ...(webs[0] ? [hostOf(webs[0])] : [])];
  const domainLabels = [...new Set(hosts.map(domainLabel).filter((d) => d.length >= 4))];
  type Cand = { i: number; score: number; text: string };
  const compCands: Cand[] = [];
  lines.forEach((l, i) => {
    if (used.has(i)) return;
    const t = l.text;
    if (t.length > 60 || FISCAL.test(t) || STREET_RE.test(t) && /\d/.test(t) || ROLE_RE.test(t) && !hasLegalSuffix(t)) return;
    if (/@|^\+?\d/.test(t) || (t.match(/\d/g) || []).length > 4) return;
    const p = plausibility(t);
    if (p < 0.55) return;
    let s = 0;
    const legal = hasLegalSuffix(t);
    if (legal) s += 5;
    const n = norm(t);
    const dom = domainLabels.find((d) => n.includes(d) || (d.includes(n) && n.length >= 5));
    if (dom) s += 4;
    else {
      // dominio parecido (error de 1-2 letras del OCR)
      const near = domainLabels.some((d) => n.length >= 5 && Math.abs(n.length - d.length) <= 3 && sim(n.slice(0, d.length), d) >= 0.8);
      if (near) s += 2.5;
    }
    if (isAllCaps(t)) s += 1.5;
    if (i < 3) s += 0.5;
    if (looksLikeName(t).ok && !legal && !dom) s -= 3;
    if (t.split(' ').length > 6) s -= 1.5;
    s *= 0.6 + 0.4 * lineConf(i);
    compCands.push({ i, score: s, text: cleanCompany(t) });
  });
  compCands.sort((a, b) => b.score - a.score);
  if (compCands[0] && compCands[0].score >= 4) {
    out.company = compCands[0].text;
    used.add(compCands[0].i);
    setInfo('company', Math.min(0.97, 0.4 + compCands[0].score / 12), compCands.slice(1).filter((c) => c.score >= 1.5).map((c) => c.text));
  } else {
    const alts = compCands.filter((c) => c.score >= 1.5).map((c) => c.text);
    if (alts.length) out.info.company = { confidence: 0.2, level: 'review', alternatives: alts.slice(0, 4) };
  }

  // ---- persona
  type NCand = { i: number; score: number; text: string };
  const nameCands: NCand[] = [];
  lines.forEach((l, i) => {
    if (used.has(i) || plausibility(l.text) < 0.6) return;
    const ln = looksLikeName(l.text);
    if (!ln.ok) return;
    let s = 1;
    s += nameEmailBonus(ln.clean, emailList);
    if (roleIdx >= 0 && Math.abs(i - roleIdx) === 1) s += 2;
    if (!isAllCaps(l.text) || l.text.split(' ').length <= 3) s += 0.5;
    if (/^\p{Lu}/u.test(ln.clean)) s += 0.5;
    s *= 0.6 + 0.4 * lineConf(i);
    nameCands.push({ i, score: s, text: ln.clean });
  });
  nameCands.sort((a, b) => b.score - a.score);
  if (nameCands[0] && nameCands[0].score >= 2.4) {
    out.fullName = nameCands[0].text;
    used.add(nameCands[0].i);
    const second = nameCands[1] && nameCands[1].score >= 1.5 ? 0.15 : 0;
    setInfo('fullName', Math.min(0.97, 0.35 + nameCands[0].score / 10 - second), nameCands.slice(1).filter((c) => c.score >= 1.2).map((c) => c.text));
    const w = out.fullName.split(/\s+/);
    if (w.length === 2) { out.firstName = w[0]; out.lastName = w[1]; }
  } else if (nameCands.length) {
    out.info.fullName = { confidence: 0.2, level: 'review', alternatives: nameCands.slice(0, 4).map((c) => c.text) };
  }

  // ---- email principal: corporativo con nombre coincidente > corporativo > personal
  if (out.emails.length) {
    const rank = (e: EmailHit) => (e.kind === 'corporate' ? 10 : 0) - (GENERIC_MAILBOX.test(e.address.split('@')[0].replace(/\d+/g, '')) ? 20 : 0) + (out.fullName ? nameEmailBonus(out.fullName, [e.address]) : 0) - (emailLines.get(e.address)! * 0.01);
    const sorted = [...out.emails].sort((a, b) => rank(b) - rank(a));
    out.emails = sorted;
    const isGeneric = (e: EmailHit) => GENERIC_MAILBOX.test(e.address.split('@')[0].replace(/\d+/g, ''));
    const generic = sorted.find((e) => isGeneric(e) && e.kind === 'corporate');
    if (generic) out.org.email = generic.address;
    const personal = sorted.filter((e) => !isGeneric(e));
    if (!personal.length) {
      // sólo hay buzones genéricos: pertenecen a la empresa, no a la persona
      for (const e of sorted.filter((x) => x.address !== out.org.email)) out.extras.push(`Email ${e.kind === 'personal' ? 'personal' : 'corporativo'}: ${e.address}`);
    }
  }
  if (out.emails.length && out.emails.some((e) => !GENERIC_MAILBOX.test(e.address.split('@')[0].replace(/\d+/g, '')))) {
    const sorted = out.emails.filter((e) => !GENERIC_MAILBOX.test(e.address.split('@')[0].replace(/\d+/g, '')));
    out.email = sorted[0].address;
    const i = emailLines.get(out.email)!;
    let conf = lineConf(i) * 0.98;
    if (repairedAt.has(lines[i].text)) conf = Math.min(conf, 0.55); // la «@» o el punto se reconstruyó: revisar
    const wl = webs[0] ? domainLabel(hostOf(webs[0])) : '';
    const el = domainLabel(out.email.split('@')[1]);
    if (wl && el && wl !== el && sim(wl, el) >= 0.6 && sim(wl, el) < 1 && !FREE_MAIL.test(out.email.split('@')[1])) conf = Math.min(conf, 0.6); // email y web casi iguales: posible fallo de OCR
    setInfo('email', conf, sorted.slice(1).map((e) => e.address));
    for (const e of out.emails.filter((x) => x.address !== out.email && x.address !== out.org.email)) out.extras.push(`Email ${e.kind === 'personal' ? 'personal' : 'corporativo'}: ${e.address}`);
  }

  // ---- datos de la empresa
  if (out.company) {
    const legal = hasLegalSuffix(out.company);
    const stripped = out.company.replace(/[\s,]+(?:S\.?\s?r\.?\s?l\.?s?|S\.?\s?p\.?\s?A\.?|S\.?\s?a\.?\s?s\.?|S\.?\s?n\.?\s?c\.?|S\.?\s?L\.?\s?U?\.?|S\.?\s?A\.?\s?R\.?\s?L\.?|S\.?\s?A\.?|GmbH|Ltd\.?|Limited|LLC|Inc\.?|B\.?V\.?|N\.?V\.?|AG)\.?\s*$/i, '').trim();
    out.org.commercialName = legal && stripped.length >= 2 ? stripped : out.company;
    if (legal) out.org.legalName = out.company;
  }
  // país: palabra de país explícita en la tarjeta > prefijo telefónico (deducido → «revisar»)
  const countryLine = lines.findIndex((l) => COUNTRY_WORDS.some(([re]) => re.test(l.text.replace(/[.,]$/, '').trim())));
  if (countryLine >= 0) {
    const t = lines[countryLine].text.replace(/[.,]$/, '').trim();
    out.org.country = COUNTRY_WORDS.find(([re]) => re.test(t))![1];
    used.add(countryLine);
  } else {
    const num = (out.phone ?? out.mobile ?? '').replace(/^00/, '+').replace(/[^\d+]/g, '');
    const hit = num.startsWith('+') ? PHONE_COUNTRY.find(([re]) => re.test(num)) : undefined;
    if (hit) { out.org.country = hit[1]; out.org.inferred.push('country'); }
  }
  if (out.org.city && out.org.legalAddress && /\d{4,5}\s/.test(out.org.legalAddress)) { /* ciudad leída del propio texto de la dirección */ }
  if (out.phone) out.org.phone = out.phone; // el fijo/centralita sirve también como teléfono corporativo (editable)

  // ---- lo no clasificado (conservado, sin basura)
  lines.forEach((l, i) => {
    if (used.has(i)) return;
    if (FISCAL.test(l.text)) { out.extras.push(cleanEdges(l.text)); return; }
    if (plausibility(l.text) >= 0.6 && l.conf >= 0.5 && l.text.length <= 80) out.extras.push(cleanEdges(l.text));
  });
  out.extras = [...new Set(out.extras)].slice(0, 14);
  return out;
}

function sim(a: string, b: string): number {
  if (a === b) return 1;
  const m = Math.max(a.length, b.length);
  if (!m) return 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[b.length] / m;
}

function cleanCompany(t: string): string {
  // quita símbolos y letras sueltas al principio (restos del logotipo) y puntuación final
  return cleanEdges(t).replace(/^(?:\S{1,2}\s+)+(?=\S{3,})/, (m) => (/\p{L}{3}/u.test(m) ? m : ''));
}

/** Compatibilidad: analiza texto plano (sin confianza por línea). */
export function parseCardText(raw: string): CardFields {
  return parseCard(raw.split(/\r?\n/).map((text) => ({ text })));
}

// ---- utilidades compartidas con la importación de QR / vCard
export function countryFromPhone(phone: string): string | undefined {
  const num = phone.replace(/^00/, '+').replace(/[^\d+]/g, '');
  return num.startsWith('+') ? PHONE_COUNTRY.find(([re]) => re.test(num))?.[1] : undefined;
}
export function normalizeCountry(text: string): string | undefined {
  const t = text.replace(/[.,]$/, '').trim();
  return COUNTRY_WORDS.find(([re]) => re.test(t))?.[1];
}
export function isGenericMailbox(address: string): boolean {
  return GENERIC_MAILBOX.test(address.split('@')[0].replace(/\d+/g, ''));
}
export function isFreeMail(address: string): boolean {
  return FREE_MAIL.test(address.split('@')[1] ?? '');
}
/** «Alfa Foods S.r.l.» → «Alfa Foods» (sólo si lleva forma jurídica reconocible). */
export function splitLegalName(name: string): { commercial: string; legal?: string } {
  const n = name.trim();
  if (!hasLegalSuffix(n)) return { commercial: n };
  const stripped = n.replace(/[\s,]+(?:S\.?\s?r\.?\s?l\.?s?|S\.?\s?p\.?\s?A\.?|S\.?\s?a\.?\s?s\.?|S\.?\s?n\.?\s?c\.?|S\.?\s?L\.?\s?U?\.?|S\.?\s?A\.?\s?R\.?\s?L\.?|S\.?\s?A\.?|GmbH|Ltd\.?|Limited|LLC|Inc\.?|B\.?V\.?|N\.?V\.?|AG)\.?\s*$/i, '').trim();
  return { commercial: stripped.length >= 2 ? stripped : n, legal: n };
}

/** ¿El formato del número es el de un móvil (IT/ES/FR/UK/DE)? Sirve cuando la fuente no indica el tipo. */
export function looksMobile(phone: string): boolean {
  const compact = phone.replace(/^00/, '+').replace(/[^\d+]/g, '');
  return MOBILE_PATTERNS.some((p) => p.test(compact));
}
