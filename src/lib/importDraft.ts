// Convierte lo leído de una tarjeta (OCR), un QR vCard/MECARD o un archivo .vcf en un BORRADOR editable:
// datos de empresa + datos de contacto. Nada se guarda aquí, y nada se deduce sin evidencia en el texto.
import { emptyCompanyDraft, type CompanyDraft } from './companyMerge';
import { countryFromPhone, isFreeMail, looksMobile, isGenericMailbox, normalizeCountry, splitLegalName, type CardFields } from './ocrParse';
import type { QrContact } from './qrParse';
import { emptyContact, type ContactFields } from './contactFields';

export interface ImportDraft {
  company: CompanyDraft;
  /** campos de empresa con baja certeza o deducidos (la UI los marca «revisar») */
  companyFlags: (keyof CompanyDraft)[];
  companyAlts: Partial<Record<keyof CompanyDraft, string[]>>;
  contact: ContactFields;
  contactFlags: string[];
  contactAlts: Partial<Record<keyof ContactFields, string[]>>;
  /** enlace de tarjeta digital (Avacard, HiHello…) si el origen era una URL de ese tipo */
  digitalCardUrl?: string;
}

const SOCIAL = /(linkedin|facebook|instagram|twitter|x\.com|tiktok|youtube)\./i;
/** Plataformas de tarjeta digital: su URL identifica a la PERSONA, no es la web de la empresa. */
export const DIGITAL_CARD_HOSTS = /(avacard|hihello|blinq|linktr\.ee|popl\.co|mobilo|qrcodechimp|haystack|vcard)/i;

const isCompanyWeb = (url: string) => !SOCIAL.test(url) && !DIGITAL_CARD_HOSTS.test(url);

export function draftFromCard(f: CardFields): ImportDraft {
  const alt = (k: keyof CardFields['info']) => f.info[k]?.alternatives ?? [];
  const linkedin = f.extras.map((e) => e.match(/^Red social: (.*linkedin.*)$/i)?.[1]).find(Boolean) ?? '';
  const d: ImportDraft = {
    company: {
      ...emptyCompanyDraft,
      name: f.org.commercialName ?? f.company ?? '',
      legalName: f.org.legalName ?? '',
      country: f.org.country ?? '', city: f.org.city ?? '',
      address: f.org.legalAddress ?? '', operationalAddress: f.org.operationalAddress ?? '',
      web: f.web && isCompanyWeb(f.web) ? f.web : '',
      email: f.org.email ?? '', phone: f.org.phone ?? '',
    },
    companyFlags: [],
    companyAlts: { name: alt('company') },
    contact: {
      ...emptyContact,
      fullName: f.fullName ?? '', role: f.role ?? '', department: f.department ?? '', email: f.email ?? '',
      phone: f.phone ?? '', mobile: f.mobile ?? '', webOrLinkedin: linkedin || (f.web && !isCompanyWeb(f.web) ? f.web : ''),
      notes: f.extras.filter((e) => !/^Red social: .*linkedin/i.test(e)).join('\n'),
    },
    contactFlags: f.uncertain.map((k) => (k === 'web' ? 'webOrLinkedin' : k)),
    contactAlts: { fullName: alt('fullName'), role: alt('role'), email: alt('email'), phone: alt('phone'), mobile: alt('mobile') },
  };
  if (f.info.company?.level === 'review') d.companyFlags.push('name');
  if (f.org.inferred.includes('country')) d.companyFlags.push('country');
  if (f.info.address?.level === 'review') d.companyFlags.push('address');
  if (f.info.web?.level === 'review') d.companyFlags.push('web');
  return d;
}

type Addr = NonNullable<QrContact['addresses']>[number];

export function draftFromVcard(c: QrContact, sourceUrl?: string): ImportDraft {
  const d: ImportDraft = {
    company: { ...emptyCompanyDraft }, companyFlags: [], companyAlts: {},
    contact: { ...emptyContact, fullName: c.fullName ?? '', role: c.role ?? '', department: c.department ?? '' },
    contactFlags: [], contactAlts: {},
  };
  const notes: string[] = [];
  if (c.company) { const s = splitLegalName(c.company); d.company.name = s.commercial; d.company.legalName = s.legal ?? ''; }

  // emails: HOME → notas; buzón genérico → empresa; nominal → persona
  const emails = c.emails?.length ? c.emails : c.email ? [{ value: c.email, type: 'work' }] : [];
  for (const e of emails) {
    if (e.type === 'home') { notes.push(`Email personal: ${e.value}`); continue; }
    if (isGenericMailbox(e.value) && !isFreeMail(e.value) && !d.company.email) { d.company.email = e.value; continue; }
    if (!d.contact.email) d.contact.email = e.value;
    else notes.push(`Email${isFreeMail(e.value) ? ' personal' : ''}: ${e.value}`);
  }
  // teléfonos: móvil → persona; fijo de trabajo → persona y empresa; fax/otros → notas
  const phones = c.phones?.length ? c.phones : [...(c.phone ? [{ value: c.phone, type: 'work' }] : []), ...(c.mobile ? [{ value: c.mobile, type: 'cell' }] : [])];
  for (const raw of phones) {
    // sin tipo declarado: el formato del número decide si es móvil
    const p = raw.type === 'other' && looksMobile(raw.value) ? { ...raw, type: 'cell' } : raw;
    if (p.type === 'cell') { if (!d.contact.mobile) d.contact.mobile = p.value; else notes.push(`Móvil: ${p.value}`); }
    else if (p.type === 'fax') notes.push(`Fax: ${p.value}`);
    else if (p.type === 'home') notes.push(`Tel. personal: ${p.value}`);
    else if (!d.contact.phone) { d.contact.phone = p.value; d.company.phone = p.value; } else notes.push(`Tel: ${p.value}`);
  }
  // web: la de empresa sólo si no es red social ni plataforma de tarjeta digital
  const urls = c.urls?.length ? c.urls : c.web ? [{ value: c.web, type: 'work' }] : [];
  for (const u of urls) {
    if (SOCIAL.test(u.value)) { if (!d.contact.webOrLinkedin) d.contact.webOrLinkedin = u.value; else notes.push(`Web: ${u.value}`); }
    else if (DIGITAL_CARD_HOSTS.test(u.value)) { d.digitalCardUrl ??= u.value; notes.push(`Tarjeta digital: ${u.value}`); }
    else if (!d.company.web) d.company.web = u.value;
    else notes.push(`Web: ${u.value}`);
  }
  if (!d.contact.webOrLinkedin && d.digitalCardUrl) d.contact.webOrLinkedin = d.digitalCardUrl; // enlace visible (LinkedIn tiene prioridad)
  if (sourceUrl && !notes.some((n) => n.includes(sourceUrl))) {
    d.digitalCardUrl ??= sourceUrl;
    notes.push(`${DIGITAL_CARD_HOSTS.test(sourceUrl) ? 'Tarjeta digital' : 'Enlace QR'}: ${sourceUrl}`);
    if (!d.contact.webOrLinkedin) d.contact.webOrLinkedin = sourceUrl; // enlace visible en el contacto
  }
  // direcciones: de trabajo → empresa; personales → sólo notas (nunca en la ficha de empresa)
  const addrs: Addr[] = c.addresses?.length ? c.addresses : c.address ? [{ text: c.address, type: 'work' }] : [];
  for (const a of addrs) {
    if (a.type === 'home') { notes.push(`Dirección personal: ${a.text}`); continue; }
    if (!d.company.address) {
      d.company.address = a.text; d.company.city = a.city ?? '';
      if (a.country) d.company.country = normalizeCountry(a.country) ?? a.country;
    } else if (!d.company.operationalAddress) d.company.operationalAddress = a.text;
    else notes.push(`Dirección: ${a.text}`);
  }
  if (!d.company.country) {
    const inf = countryFromPhone(d.contact.phone || d.contact.mobile);
    if (inf) { d.company.country = inf; d.companyFlags.push('country'); }
  }
  if (c.notes) notes.unshift(c.notes);
  for (const e of c.extras) if (!notes.includes(e) && !/^(Email|Tel|Web|Fax):/.test(e)) notes.push(e);
  d.contact.notes = notes.join('\n');
  return d;
}
