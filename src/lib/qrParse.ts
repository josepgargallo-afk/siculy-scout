// Clasificación y parseo de contenido de QR. Sólo se TRATA COMO TEXTO: nunca se ejecuta,
// ni se abre ningún enlace automáticamente, ni se hace scraping.

export type QrKind = 'vcard' | 'mecard' | 'url' | 'email' | 'phone' | 'text';

export interface QrContact {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  role?: string;
  department?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  web?: string;
  address?: string;
  notes?: string;
  extras: string[];
  /** Detalle con el TIPO declarado en la tarjeta (WORK/HOME/CELL…): permite separar datos de empresa y personales. */
  emails?: { value: string; type: string }[];
  phones?: { value: string; type: string }[];
  urls?: { value: string; type: string }[];
  addresses?: { text: string; type: string; street?: string; city?: string; region?: string; postal?: string; country?: string }[];
}

export interface QrResult {
  kind: QrKind;
  raw: string;
  contact?: QrContact;
  url?: string;
  email?: string;
  phone?: string;
}

const MAX_LEN = 20000;

function unfold(s: string) { return s.replace(/\r?\n[ \t]/g, ''); }

function unescapeV(s: string) {
  return s.replace(/\\n/gi, '\n').replace(/\\([,;:])/g, '$1').replace(/\\\\/g, '\\').trim();
}

function decodeQP(s: string): string {
  try {
    const bytes: number[] = [];
    const t = s.replace(/=\r?\n/g, '');
    for (let i = 0; i < t.length; i++) {
      if (t[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(t.slice(i + 1, i + 3))) { bytes.push(parseInt(t.slice(i + 1, i + 3), 16)); i += 2; }
      else bytes.push(...new TextEncoder().encode(t[i]));
    }
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  } catch { return s; }
}

/** Separa por `;` no escapados */
function splitSemi(s: string): string[] {
  const parts: string[] = []; let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) { cur += s[i] + s[i + 1]; i++; continue; }
    if (s[i] === ';') { parts.push(cur); cur = ''; } else cur += s[i];
  }
  parts.push(cur);
  return parts;
}

const typeOf = (params: string): string => (/HOME|PERSONAL/.test(params) ? 'home' : /CELL|MOBILE/.test(params) ? 'cell' : /FAX/.test(params) ? 'fax' : /WORK|OFFICE/.test(params) ? 'work' : 'other');

/** Un archivo .vcf puede traer varios contactos (exportación de la agenda, tarjeta de equipo…). */
export function parseVCards(text: string): QrContact[] {
  const blocks = text.replace(/\r\n/g, '\n').split(/(?=^BEGIN:VCARD)/im).filter((b) => /^BEGIN:VCARD/i.test(b.trim()));
  return blocks.map((b) => parseVCard(b)).filter((c) => c.fullName || c.email || c.phone || c.mobile || c.company);
}

export function parseVCard(text: string): QrContact {
  const c: QrContact = { extras: [] };
  const lines = unfold(text).split(/\r?\n/);
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const head = line.slice(0, idx);
    let value = line.slice(idx + 1);
    const [propRaw, ...params] = head.split(';');
    const prop = propRaw.replace(/^item\d+\./i, '').toUpperCase();
    const paramStr = params.join(';').toUpperCase();
    if (/ENCODING=QUOTED-PRINTABLE/.test(paramStr)) value = decodeQP(value);
    const v = unescapeV(value);
    if (!v) continue;
    switch (prop) {
      case 'FN': c.fullName = v; break;
      case 'N': {
        const [last, first] = splitSemi(value).map(unescapeV);
        c.lastName = last || undefined; c.firstName = first || undefined;
        if (!c.fullName && (first || last)) c.fullName = [first, last].filter(Boolean).join(' ');
        break;
      }
      case 'ORG': c.company = splitSemi(value).map(unescapeV).filter(Boolean)[0]; c.department = splitSemi(value).map(unescapeV).filter(Boolean)[1]; break;
      case 'TITLE': c.role = v; break;
      case 'EMAIL': (c.emails ??= []).push({ value: v, type: typeOf(paramStr) }); if (!c.email) c.email = v; else c.extras.push(`Email: ${v}`); break;
      case 'TEL': {
        (c.phones ??= []).push({ value: v, type: typeOf(paramStr) });
        const mob = /CELL|MOBILE/.test(paramStr);
        const fax = /FAX/.test(paramStr);
        if (fax) c.extras.push(`Fax: ${v}`);
        else if (mob && !c.mobile) c.mobile = v;
        else if (!mob && !c.phone) c.phone = v;
        else c.extras.push(`Tel: ${v}`);
        break;
      }
      case 'URL': (c.urls ??= []).push({ value: v, type: typeOf(paramStr) }); if (!c.web) c.web = v; else c.extras.push(`Web: ${v}`); break;
      case 'ADR': {
        const f = splitSemi(value).map(unescapeV); // pobox;ext;calle;ciudad;región;CP;país
        const text = f.filter(Boolean).join(', ');
        (c.addresses ??= []).push({ text, type: typeOf(paramStr), street: f[2] || undefined, city: f[3] || undefined, region: f[4] || undefined, postal: f[5] || undefined, country: f[6] || undefined });
        if (!c.address) c.address = text;
        break;
      }
      case 'NOTE': c.notes = v; break;
      default: break;
    }
  }
  return c;
}

export function parseMeCard(text: string): QrContact {
  const c: QrContact = { extras: [] };
  const body = text.replace(/^MECARD:/i, '');
  for (const field of splitSemi(body)) {
    if (!field) continue;
    const i = field.indexOf(':');
    if (i < 0) continue;
    const key = field.slice(0, i).toUpperCase();
    const val = unescapeV(field.slice(i + 1));
    if (!val) continue;
    switch (key) {
      case 'N': {
        // MECARD: "Apellido,Nombre"
        const [last, first] = val.split(',').map((s) => s.trim());
        c.lastName = last || undefined; c.firstName = first || undefined;
        c.fullName = first ? `${first} ${last}`.trim() : last;
        break;
      }
      case 'ORG': c.company = val; break;
      case 'TITLE': c.role = val; break;
      case 'TEL': if (!c.phone) c.phone = val; else c.extras.push(`Tel: ${val}`); break;
      case 'TEL-AV': if (!c.mobile) c.mobile = val; else c.extras.push(`Tel: ${val}`); break;
      case 'EMAIL': if (!c.email) c.email = val; else c.extras.push(`Email: ${val}`); break;
      case 'URL': if (!c.web) c.web = val; else c.extras.push(`Web: ${val}`); break;
      case 'ADR': c.address = val.replace(/,+/g, ', ').replace(/,\s*$/, ''); break;
      case 'NOTE': c.notes = val; break;
      default: break;
    }
  }
  return c;
}

/** Sólo se aceptan http/https. Se descartan javascript:, data:, file:, etc. */
export function safeHttpUrl(s: string): string | null {
  const t = s.trim();
  if (/^www\./i.test(t)) return safeHttpUrl('https://' + t);
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch { return null; }
}

export function classifyQr(rawIn: string): QrResult {
  const raw = (rawIn || '').slice(0, MAX_LEN);
  const t = raw.trim();
  if (/^BEGIN:VCARD/i.test(t)) return { kind: 'vcard', raw, contact: parseVCard(t) };
  if (/^MECARD:/i.test(t)) return { kind: 'mecard', raw, contact: parseMeCard(t) };
  if (/^mailto:/i.test(t)) {
    const addr = decodeURIComponent(t.slice(7).split('?')[0]).trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return { kind: 'email', raw, email: addr.toLowerCase() };
  }
  if (/^matmsg:/i.test(t)) {
    const m = t.match(/TO:([^;]+)/i);
    if (m && /@/.test(m[1])) return { kind: 'email', raw, email: m[1].trim().toLowerCase() };
  }
  if (/^tel:/i.test(t)) {
    const p = t.slice(4).trim();
    if (/^[+\d][\d\s().\-]{5,}$/.test(p)) return { kind: 'phone', raw, phone: p };
  }
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(t)) return { kind: 'email', raw, email: t.toLowerCase() };
  const url = safeHttpUrl(t);
  if (url && !/\s/.test(t)) return { kind: 'url', raw, url };
  return { kind: 'text', raw };
}
