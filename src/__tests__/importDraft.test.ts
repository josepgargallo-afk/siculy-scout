import { describe, expect, it } from 'vitest';
import { parseCard } from '../lib/ocrParse';
import { classifyQr, parseVCards } from '../lib/qrParse';
import { draftFromCard, draftFromVcard } from '../lib/importDraft';
import { buildCompanyPatch, companyInputFromDraft, companyNameMismatch, diffCompany, sameValue } from '../lib/companyMerge';
import type { Company } from '../lib/types';

// Datos ficticios. El vCard imita la estructura típica de plataformas de tarjeta digital (tipos, item1., URL de la tarjeta).
const VCF = `BEGIN:VCARD
VERSION:3.0
PRODID:-//Fake Digital Card//ES
N:Vitale;Rosalia;;;
FN:Rosalia Vitale
ORG:Dolce Trinacria S.r.l.;Export
TITLE:Co Founder
TEL;type=CELL;type=VOICE;type=pref:+39 338 4417 092
TEL;type=WORK;type=VOICE:+39 091 6140 552
TEL;type=WORK;type=FAX:+39 091 6140 553
EMAIL;type=INTERNET;type=WORK;type=pref:rosalia.vitale@dolcetrinacria.it
EMAIL;type=INTERNET;type=HOME:rosalia.vitale76@gmail.com
EMAIL;type=INTERNET;type=WORK:info@dolcetrinacria.it
item1.URL:https://www.dolcetrinacria.it
item1.X-ABLabel:Web
URL:https://avacard.example/rosalia-vitale
URL:https://www.linkedin.com/in/rosalia-vitale-test
ADR;type=WORK:;;Via Libertà 114;Palermo;PA;90143;Italia
ADR;type=HOME:;;Via Privata 5;Palermo;PA;90100;Italia
NOTE:Conocida en SIAL
END:VCARD`;

describe('vCard → borrador de importación', () => {
  const c = classifyQr(VCF);
  const d = draftFromVcard(c.contact!);

  it('persona: nombre, cargo, departamento', () => {
    expect(d.contact).toMatchObject({ fullName: 'Rosalia Vitale', role: 'Co Founder', department: 'Export' });
  });
  it('empresa: nombre comercial y legal separados, dirección de TRABAJO, ciudad y país', () => {
    expect(d.company).toMatchObject({
      name: 'Dolce Trinacria', legalName: 'Dolce Trinacria S.r.l.', address: 'Via Libertà 114, Palermo, PA, 90143, Italia',
      city: 'Palermo', country: 'Italia', web: 'https://www.dolcetrinacria.it', email: 'info@dolcetrinacria.it', phone: '+39 091 6140 552',
    });
  });
  it('emails: nominal → persona; genérico → empresa; personal → notas; no se pierde ninguno', () => {
    expect(d.contact.email).toBe('rosalia.vitale@dolcetrinacria.it');
    expect(d.contact.notes).toContain('Email personal: rosalia.vitale76@gmail.com');
  });
  it('teléfonos: móvil a persona; fijo a persona y empresa; fax conservado en notas', () => {
    expect(d.contact.mobile).toBe('+39 338 4417 092');
    expect(d.contact.phone).toBe('+39 091 6140 552');
    expect(d.contact.notes).toContain('Fax: +39 091 6140 553');
  });
  it('la dirección PERSONAL no entra en la ficha de empresa; va a las notas', () => {
    expect(d.company.address).not.toContain('Privata');
    expect(d.company.operationalAddress).toBe('');
    expect(d.contact.notes).toContain('Dirección personal: Via Privata 5');
  });
  it('la URL de tarjeta digital identifica a la persona (no es la web de la empresa) y se conserva', () => {
    expect(d.company.web).toBe('https://www.dolcetrinacria.it');
    expect(d.digitalCardUrl).toBe('https://avacard.example/rosalia-vitale'.replace('avacard.example', 'avacard.example'));
    expect(d.contact.webOrLinkedin).toContain('linkedin.com');
    expect(d.contact.notes).toContain('Conocida en SIAL');
  });
  it('país deducido por el prefijo telefónico se marca «revisar» si el vCard no lo trae', () => {
    const e = draftFromVcard(classifyQr('BEGIN:VCARD\nFN:Luca Neri\nTEL;TYPE=CELL:+34 612 345 678\nEND:VCARD').contact!);
    expect(e.company.country).toBe('España');
    expect(e.companyFlags).toContain('country');
  });
  it('QR con URL de tarjeta digital: la URL se conserva como enlace del contacto', () => {
    const e = draftFromVcard({ extras: [], fullName: 'X' }, 'https://avacard.example/x');
    expect(e.digitalCardUrl).toBe('https://avacard.example/x');
    expect(e.contact.notes).toContain('Tarjeta digital: https://avacard.example/x');
  });
});

describe('archivos .vcf con varios contactos y formatos reales', () => {
  it('lee varios contactos, CRLF y vCard 2.1', () => {
    const text = 'BEGIN:VCARD\r\nVERSION:2.1\r\nFN:Ana Gil\r\nTEL;CELL:+34600111222\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:3.0\r\nFN:Pablo Ruiz\r\nORG:Frío SL\r\nEND:VCARD\r\n';
    const list = parseVCards(text);
    expect(list.map((x) => x.fullName)).toEqual(['Ana Gil', 'Pablo Ruiz']);
    expect(list[0].phones![0]).toMatchObject({ type: 'cell', value: '+34600111222' });
  });
  it('ignora bloques vacíos o corruptos sin romper', () => {
    expect(parseVCards('')).toEqual([]);
    expect(parseVCards('hola mundo')).toEqual([]);
    expect(parseVCards('BEGIN:VCARD\nEND:VCARD')).toEqual([]);
  });
  it('contenido malicioso en campos se conserva como texto inerte', () => {
    const [c] = parseVCards('BEGIN:VCARD\nFN:<script>alert(1)</script>\nURL:javascript:alert(1)\nEND:VCARD');
    expect(c.fullName).toBe('<script>alert(1)</script>');
  });
});

describe('tarjeta OCR → borrador (empresa + contacto)', () => {
  const f = parseCard([
    'DOLCE TRINACRIA S.r.l.', 'Rosalia Vitale', 'Co Founder', 'M. +39 338 4417 092', 'T. +39 091 6140 552',
    'rosalia.vitale@dolcetrinacria.it', 'info@dolcetrinacria.it', 'www.dolcetrinacria.it',
    'Sede legale', 'Via Libertà 114', '90143 Palermo (PA)', 'Sede operativa', 'Zona Industriale, Lotto 7', '90044 Carini (PA)', 'P.IVA 06123450821',
  ].map((text) => ({ text, conf: 90 })));
  const d = draftFromCard(f);
  it('rellena empresa y contacto con lo que hay en la tarjeta', () => {
    expect(d.company).toMatchObject({
      name: 'DOLCE TRINACRIA', legalName: 'DOLCE TRINACRIA S.r.l.', city: 'Palermo', country: 'Italia',
      address: 'Via Libertà 114, 90143 Palermo (PA)', operationalAddress: 'Zona Industriale, Lotto 7, 90044 Carini (PA)',
      web: 'www.dolcetrinacria.it', email: 'info@dolcetrinacria.it', phone: '+39 091 6140 552',
    });
    expect(d.contact).toMatchObject({ fullName: 'Rosalia Vitale', role: 'Co Founder', email: 'rosalia.vitale@dolcetrinacria.it', mobile: '+39 338 4417 092', phone: '+39 091 6140 552' });
  });
  it('país deducido → revisar; datos no clasificados (IVA) conservados en notas', () => {
    expect(d.companyFlags).toContain('country');
    expect(d.contact.notes).toContain('IVA');
  });
  it('NO deduce productos ni categorías', () => {
    expect(Object.keys(companyInputFromDraft(d.company))).not.toContain('categories');
    expect(Object.keys(companyInputFromDraft(d.company))).not.toContain('productsOfInterest');
  });
});

describe('empresa existente: sin duplicar, sin sobrescribir, con conflictos elegibles', () => {
  const existing: Company = {
    id: 'c1', name: 'Dolce Trinacria', type: 'supplier', categories: ['Dulces'], productsOfInterest: ['Cannoli'], priority: 'high',
    createdAt: 't', updatedAt: 't', country: 'Italia', web: 'https://dolcetrinacria.it/', phone: '091 614 0552', address: 'Via Roma 1, Palermo',
  };
  const draft = { name: 'Dolce Trinacria', legalName: 'Dolce Trinacria S.r.l.', country: 'Italia', city: 'Palermo', address: 'Via Libertà 114, 90143 Palermo', operationalAddress: '', web: 'www.dolcetrinacria.it', email: 'info@dolcetrinacria.it', phone: '+39 091 6140 552' };
  const diffs = diffCompany(existing, draft);
  const st = (k: string) => diffs.find((d) => d.key === k)?.status;

  it('clasifica cada campo: nuevo / igual / conflicto', () => {
    expect(st('legalName')).toBe('new');
    expect(st('email')).toBe('new');
    expect(st('city')).toBe('new');
    expect(st('country')).toBe('same');
    expect(st('web')).toBe('same'); // www. y barra final no son un conflicto
    expect(st('phone')).toBe('same'); // distinto formato, mismo número
    expect(st('address')).toBe('conflict');
    expect(diffs.find((d) => d.key === 'operationalAddress')).toBeUndefined(); // lo no detectado no aparece
  });
  it('por defecto SÓLO rellena huecos; el conflicto conserva el dato actual', () => {
    const patch = buildCompanyPatch(diffs, {});
    expect(patch).toEqual({ legalName: 'Dolce Trinacria S.r.l.', city: 'Palermo', email: 'info@dolcetrinacria.it' });
    expect(patch).not.toHaveProperty('address');
  });
  it('el usuario puede elegir el valor detectado en un conflicto, o descartar un hueco', () => {
    const patch = buildCompanyPatch(diffs, { address: true, email: false });
    expect(patch.address).toBe('Via Libertà 114, 90143 Palermo');
    expect(patch).not.toHaveProperty('email');
  });
  it('nunca toca categorías, productos, prioridad ni notas', () => {
    const patch = buildCompanyPatch(diffs, { address: true });
    for (const k of ['categories', 'productsOfInterest', 'priority', 'notes', 'name', 'id', 'type']) expect(patch).not.toHaveProperty(k);
  });
  it('discrepancia de nombre entre la tarjeta y la empresa elegida', () => {
    expect(companyNameMismatch('Dolce Trinacria', 'DOLCE TRINACRIA')).toBe(false);
    expect(companyNameMismatch('Dolce Trinacria', 'Dolce Trinacria Export')).toBe(false);
    expect(companyNameMismatch('Dolce Trinacria', 'Surgelati Mare')).toBe(true);
    expect(companyNameMismatch('Dolce Trinacria', '')).toBe(false);
  });
  it('comparación tolerante de valores', () => {
    expect(sameValue('email', 'INFO@X.IT', 'info@x.it')).toBe(true);
    expect(sameValue('phone', '+39 02 1234 5678', '0039 02 12345678')).toBe(true);
    expect(sameValue('web', 'http://www.a.it/x', 'https://a.it')).toBe(true);
    expect(sameValue('city', 'Palermo', 'Palerme')).toBe(false);
  });
});

describe('vCard sin tipos declarados (QR mínimos)', () => {
  it('un número sin tipo con formato de móvil va a «Móvil», no al teléfono corporativo', () => {
    const d = draftFromVcard(classifyQr('BEGIN:VCARD\nFN:Ana Gil\nORG:Frio SL\nTEL:+34600111222\nEND:VCARD').contact!);
    expect(d.contact.mobile).toBe('+34600111222');
    expect(d.contact.phone).toBe('');
    expect(d.company.phone).toBe('');
  });
  it('un fijo sin tipo sigue siendo teléfono de contacto y de empresa', () => {
    const d = draftFromVcard(classifyQr('BEGIN:VCARD\nFN:Ana Gil\nTEL:+34955120340\nEND:VCARD').contact!);
    expect(d.contact.phone).toBe('+34955120340');
    expect(d.company.phone).toBe('+34955120340');
  });
});
