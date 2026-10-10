// Extracción CONSERVADORA de campos desde texto OCR de tarjetas de visita (es/it/en/fr).
// Principio: ante la duda, el campo se deja vacío y el texto queda disponible para el usuario.
// Nada de lo extraído se ejecuta ni se envía a ningún sitio.

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
  /** Datos adicionales detectados (p.ej. segundo email, fax) que no caben en un campo. */
  extras: string[];
  /** Campos que se rellenaron con baja certeza; la UI los marca para revisar. */
  uncertain: string[];
}

const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}/g;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s,;<>()]+|\b[a-z0-9\-]+(?:\.[a-z0-9\-]+)*\.(?:com|it|es|fr|eu|net|org|info|biz|de|uk|pt|co|io)(?:\/[^\s,;<>()]*)?\b/gi;
const PHONE_RE = /(?:\+|00)?\d[\d\s().\-\/]{6,}\d/g;

const MOBILE_HINT = /(mob|cell|cel\b|móvil|movil|portable|port\.|whatsapp|\bgsm\b|\bm:)/i;
const FAX_HINT = /\b(fax|f:)/i;
const TEL_HINT = /\b(tel|t:|phone|ph:|tél|telefono|teléfono|direct|ufficio|office|bureau)/i;

const ROLE_WORDS = [
  'director', 'directora', 'directeur', 'directrice', 'direttore', 'direttrice', 'manager', 'gerente', 'responsable',
  'ceo', 'cfo', 'coo', 'cto', 'founder', 'fundador', 'fondatore', 'owner', 'propietario', 'titolare',
  'president', 'presidente', 'presidente', 'vice', 'export', 'sales', 'ventas', 'comercial', 'commercial', 'vendite',
  'purchasing', 'buyer', 'compras', 'acheteur', 'acquisti', 'procurement',
  'administrador', 'amministratore', 'delegado', 'head', 'chief', 'jefe', 'chef', 'capo', 'key account',
  'sourcing', 'consultant', 'consultor', 'agente', 'representante',
  'representative', 'executive', 'engineer', 'ingeniero', 'ingénieur', 'ingegnere', 'partner', 'socio', 'associé',
];
const ROLE_RE = new RegExp(`\\b(${ROLE_WORDS.join('|')})\\b`, 'i');

const COMPANY_SUFFIX_RE = /\b(s\.?\s?r\.?\s?l\.?|s\.?\s?p\.?\s?a\.?|s\.?\s?a\.?\s?s\.?|s\.?\s?a\.?\s?r\.?\s?l\.?|s\.?\s?l\.?u?\.?|s\.?\s?a\.?|gmbh|ltd\.?|llc|inc\.?|b\.?v\.?|srls|snc|group|groupe|gruppo|grupo|foods?|alimentari|alimentaria|alimentation|surgelati|congelati|surgelés|frozen)\b/i;

const ADDRESS_RE = /\b(via|viale|corso|piazza|strada|calle|c\/|avenida|avda|paseo|plaza|rue|avenue|boulevard|bd|chemin|street|st\.|road|rd\.|lane|zona industriale|polígono|poligono|zone industrielle|z\.i\.)\b/i;
const POSTAL_RE = /\b(?:\d{5}|\d{4,5}\s?[A-Z]{2}|[A-Z]{1,2}-\d{4,5})\b/;

const NAME_TITLE_RE = /^(sig\.?|sig\.ra|dott\.?|dr\.?|dra\.?|ing\.?|avv\.?|mr\.?|mrs\.?|ms\.?|mme\.?|m\.|sr\.?|sra\.?)\s+/i;

export function extractEmails(text: string): string[] {
  const found = (text.match(EMAIL_RE) || []).map((e) => e.replace(/[.,;:]+$/, '').toLowerCase());
  return [...new Set(found)];
}

export function extractUrls(text: string): string[] {
  const noEmails = text.replace(EMAIL_RE, ' ');
  const found = (noEmails.match(URL_RE) || []).map((u) => u.replace(/[.,;:]+$/, ''));
  return [...new Set(found)];
}

export interface PhoneHit { raw: string; normalized: string; kind: 'mobile' | 'fax' | 'phone' | 'unknown' }

/** Teléfonos con su pista de tipo (móvil/fax/fijo) según etiquetas de la línea. */
export function extractPhones(text: string): PhoneHit[] {
  const hits: PhoneHit[] = [];
  for (const line of text.split(/\r?\n/)) {
    const clean = line.replace(EMAIL_RE, ' ');
    const matches = clean.match(PHONE_RE) || [];
    for (const raw of matches) {
      const trimmed = raw.trim();
      const digits = trimmed.replace(/\D/g, '');
      if (digits.length < 8 || digits.length > 15) continue;
      // evita códigos postales + fechas: exige que no sea una fecha tipo 12/05/2026
      if (/^\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}$/.test(trimmed)) continue;
      const kind: PhoneHit['kind'] = FAX_HINT.test(line) && !TEL_HINT.test(line) ? 'fax'
        : MOBILE_HINT.test(line) ? 'mobile' : TEL_HINT.test(line) ? 'phone' : 'unknown';
      const normalized = trimmed.replace(/^00/, '+').replace(/[^\d+]/g, '');
      if (!hits.some((h) => h.normalized === normalized)) hits.push({ raw: trimmed, normalized, kind });
    }
  }
  return hits;
}

const isMostlyLetters = (s: string) => {
  const letters = (s.match(/\p{L}/gu) || []).length;
  return letters >= s.replace(/\s/g, '').length * 0.85;
};

const looksLikeName = (line: string): boolean => {
  const l = line.replace(NAME_TITLE_RE, '').trim();
  if (l.length < 5 || l.length > 40) return false;
  if (/[@\d\/\\:|_]/.test(l)) return false;
  if (ROLE_RE.test(l) || COMPANY_SUFFIX_RE.test(l) || ADDRESS_RE.test(l)) return false;
  if (!isMostlyLetters(l)) return false;
  const words = l.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  // cada palabra con inicial mayúscula (o todo MAYÚSCULAS), permitiendo partículas
  const particles = new Set(['de', 'del', 'la', 'di', 'da', 'van', 'von', 'le', 'dos', 'das', 'y', 'e']);
  return words.every((w) => particles.has(w.toLowerCase()) || /^[\p{Lu}][\p{L}'’.\-]*$/u.test(w));
};

function splitName(full: string): { firstName?: string; lastName?: string } {
  const words = full.split(/\s+/);
  if (words.length === 2) return { firstName: words[0], lastName: words[1] };
  // Con 3-4 palabras es ambiguo (apellidos compuestos): no inventamos la división.
  return {};
}

export function parseCardText(raw: string): CardFields {
  const text = raw.replace(/ /g, ' ');
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 1);
  const out: CardFields = { extras: [], uncertain: [] };

  const emails = extractEmails(text);
  if (emails.length) { out.email = emails[0]; if (emails.length > 1) out.extras.push(...emails.slice(1).map((e) => `Email: ${e}`)); }

  const urls = extractUrls(text).filter((u) => !emails.some((e) => e.split('@')[1] === u.toLowerCase()));
  if (urls.length) {
    const linkedin = urls.find((u) => /linkedin\./i.test(u));
    out.web = urls.find((u) => !/linkedin\./i.test(u)) ?? linkedin;
    if (linkedin && out.web !== linkedin) out.extras.push(`LinkedIn: ${linkedin}`);
    const rest = urls.filter((u) => u !== out.web && u !== linkedin);
    if (rest.length) out.extras.push(...rest.map((u) => `Web: ${u}`));
  }

  const phones = extractPhones(text);
  const mobiles = phones.filter((p) => p.kind === 'mobile');
  const fixed = phones.filter((p) => p.kind === 'phone');
  const unknown = phones.filter((p) => p.kind === 'unknown');
  const faxes = phones.filter((p) => p.kind === 'fax');
  if (mobiles[0]) out.mobile = mobiles[0].raw;
  if (fixed[0]) out.phone = fixed[0].raw;
  // Sin etiquetas: un único teléfono se asigna a "teléfono" marcado como incierto; varios sin etiqueta: no se adivina cuál es cuál.
  if (!out.phone && unknown.length === 1 && !out.mobile) { out.phone = unknown[0].raw; out.uncertain.push('phone'); }
  else if (!out.phone && !out.mobile && unknown.length > 1) {
    out.phone = unknown[0].raw; out.uncertain.push('phone');
    out.extras.push(...unknown.slice(1).map((p) => `Teléfono sin etiqueta: ${p.raw}`));
  } else if (unknown.length) out.extras.push(...unknown.map((p) => `Teléfono sin etiqueta: ${p.raw}`));
  out.extras.push(...faxes.map((p) => `Fax: ${p.raw}`), ...mobiles.slice(1).map((p) => `Móvil: ${p.raw}`), ...fixed.slice(1).map((p) => `Tel: ${p.raw}`));

  const used = new Set<number>();
  const mark = (i: number) => used.add(i);
  // Líneas que son sólo datos de contacto (email, teléfono, web): no pueden ser nombre/cargo/empresa.
  const EMAIL_ONE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+\.[A-Za-z]{2,}/;
  const URL_ONE = /^(?:https?:\/\/|www\.)\S+$|^[a-z0-9\-]+(?:\.[a-z0-9\-]+)*\.[a-z]{2,}(?:\/\S*)?$/i;
  lines.forEach((l, i) => {
    if (
      EMAIL_ONE.test(l) || URL_ONE.test(l) ||
      /^(tel|t|fax|f|mob|cell|www|web|email|e-mail|mail)\b[:.\s]/i.test(l) ||
      /^\+?[\d\s().\-\/]{8,}$/.test(l)
    ) mark(i);
  });

  // Cargo
  const roleIdx = lines.findIndex((l, i) => !used.has(i) && ROLE_RE.test(l) && l.length <= 60 && !/@/.test(l));
  if (roleIdx >= 0) { out.role = lines[roleIdx]; mark(roleIdx); }

  // Dirección: línea con calle + número, o código postal + localidad
  const addrIdx = lines.findIndex((l, i) => !used.has(i) && ADDRESS_RE.test(l) && /\d/.test(l));
  if (addrIdx >= 0) {
    const parts = [lines[addrIdx]];
    mark(addrIdx);
    const next = lines[addrIdx + 1];
    if (next && !used.has(addrIdx + 1) && POSTAL_RE.test(next) && !ROLE_RE.test(next)) { parts.push(next); mark(addrIdx + 1); }
    out.address = parts.join(', ');
  }

  // Empresa: línea con forma jurídica; si no, dominio del email/web coincidente con una línea
  const compIdx = lines.findIndex((l, i) => !used.has(i) && COMPANY_SUFFIX_RE.test(l) && !ADDRESS_RE.test(l) && l.length <= 60);
  if (compIdx >= 0) { out.company = lines[compIdx]; mark(compIdx); }
  else {
    const domain = (out.email?.split('@')[1] || out.web?.replace(/^(https?:\/\/)?(www\.)?/i, '').split(/[\/]/)[0] || '').split('.')[0].toLowerCase();
    if (domain.length >= 3) {
      const idx = lines.findIndex((l, i) => !used.has(i) && l.length <= 50 && l.toLowerCase().replace(/[^a-z0-9]/g, '').includes(domain));
      if (idx >= 0 && !looksLikeName(lines[idx])) { out.company = lines[idx]; mark(idx); out.uncertain.push('company'); }
    }
  }

  // Nombre: sólo si hay una línea claramente de persona; si hay varias candidatas, la primera pero marcada como incierta
  const nameIdxs = lines.map((l, i) => (!used.has(i) && looksLikeName(l) ? i : -1)).filter((i) => i >= 0);
  if (nameIdxs.length) {
    const name = lines[nameIdxs[0]].replace(NAME_TITLE_RE, '').trim();
    out.fullName = name;
    Object.assign(out, splitName(name));
    if (nameIdxs.length > 1) out.uncertain.push('fullName');
  }
  return out;
}
