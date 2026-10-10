import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import { extractEmails, extractPhones, extractUrls, parseCardText } from '../lib/ocrParse';
import { classifyQr, parseMeCard, parseVCard, safeHttpUrl } from '../lib/qrParse';
import { decodeQrFromImageData } from '../lib/qrDecode';
import { csvCell, toCsv } from '../lib/csv';

describe('OCR: extracción de emails, teléfonos y webs', () => {
  const text = `Marco Bianchi
Export Manager
SURGELATI MARE S.r.l.
Via Roma 25
20121 Milano (MI)
Tel. +39 02 1234 5678
Mob: +39 333 123 4567
Fax +39 02 1234 9999
marco.bianchi@surgelatimare.it
www.surgelatimare.it`;

  it('emails (en minúsculas, sin duplicados, sin signos finales)', () => {
    expect(extractEmails('E-mail: Marco.Bianchi@SurgelatiMare.IT, otro: a@b.fr.\nmarco.bianchi@surgelatimare.it'))
      .toEqual(['marco.bianchi@surgelatimare.it', 'a@b.fr']);
  });
  it('teléfonos con etiqueta móvil/fijo/fax y sin fechas', () => {
    const p = extractPhones(text + '\n12/05/2026');
    expect(p.find((x) => x.kind === 'mobile')!.normalized).toBe('+393331234567');
    expect(p.find((x) => x.kind === 'phone')!.normalized).toBe('+390212345678');
    expect(p.find((x) => x.kind === 'fax')).toBeTruthy();
    expect(p.some((x) => x.raw.includes('2026'))).toBe(false);
  });
  it('urls sin confundir dominios de email', () => {
    expect(extractUrls('info@acme.com  www.acme.com')).toEqual(['www.acme.com']);
  });
  it('parsea una tarjeta completa en italiano', () => {
    const f = parseCardText(text);
    expect(f.fullName).toBe('Marco Bianchi');
    expect(f.firstName).toBe('Marco');
    expect(f.lastName).toBe('Bianchi');
    expect(f.role).toBe('Export Manager');
    expect(f.company).toBe('SURGELATI MARE S.r.l.');
    expect(f.email).toBe('marco.bianchi@surgelatimare.it');
    expect(f.phone).toBe('+39 02 1234 5678');
    expect(f.mobile).toBe('+39 333 123 4567');
    expect(f.web).toBe('www.surgelatimare.it');
    expect(f.address).toContain('Via Roma 25');
    expect(f.extras.some((e) => e.startsWith('Fax'))).toBe(true);
  });
  it('tarjeta en francés', () => {
    const f = parseCardText(`Sophie Dubois\nResponsable Achats\nDelice Surgelés SAS\n12 rue de la Paix\n75002 Paris\nTél : 01 42 60 30 30\nsophie.dubois@delice.fr`);
    expect(f.fullName).toBe('Sophie Dubois');
    expect(f.role).toBe('Responsable Achats');
    expect(f.company).toBe('Delice Surgelés SAS');
    expect(f.address).toContain('rue de la Paix');
  });
  it('tarjeta en español con apellido compuesto: no inventa la división nombre/apellidos', () => {
    const f = parseCardText(`José Luis García Pérez\nDirector Comercial\nCongelados del Sur S.L.\nT: +34 955 123 456\njl@congeladosdelsur.es`);
    expect(f.fullName).toBe('José Luis García Pérez');
    expect(f.firstName).toBeUndefined();
    expect(f.lastName).toBeUndefined();
    expect(f.role).toBe('Director Comercial');
  });
  it('texto OCR ambiguo/ruidoso: no asigna lo incierto', () => {
    const f = parseCardText(`~~ l1 .. \n### \nQuality since 1980\n333 | 44\n02 99\nxx`);
    expect(f.fullName).toBeUndefined();
    expect(f.role).toBeUndefined();
    expect(f.email).toBeUndefined();
    expect(f.phone).toBeUndefined();
    expect(f.company).toBeUndefined();
    expect(f.address).toBeUndefined();
  });
  it('un único teléfono sin etiqueta se propone pero se marca como incierto', () => {
    const f = parseCardText('Ana Gil\n+34 600 111 222');
    expect(f.phone).toBe('+34 600 111 222');
    expect(f.uncertain).toContain('phone');
  });
  it('no confunde un email con una web ni una línea de teléfono con un nombre', () => {
    const f = parseCardText('info@empresa.com\nTel +34 911 222 333');
    expect(f.fullName).toBeUndefined();
    expect(f.web).toBeUndefined();
  });
  it('texto vacío no rompe', () => {
    expect(parseCardText('')).toMatchObject({ extras: [], uncertain: [] });
  });
});

describe('QR: vCard / MECARD / URL / email / teléfono', () => {
  const vcard = `BEGIN:VCARD
VERSION:3.0
N:Müller;Hans;;;
FN:Hans Müller
ORG:Tiefkühl GmbH;Einkauf
TITLE:Einkaufsleiter
TEL;TYPE=WORK,VOICE:+49 30 1234567
TEL;TYPE=CELL:+49 170 1234567
EMAIL;TYPE=INTERNET:hans@tiefkuehl.de
URL:https://www.tiefkuehl.de
ADR;TYPE=WORK:;;Hauptstr. 1;Berlin;;10115;Germany
NOTE:Conocido en SIAL\\nvolver a llamar
END:VCARD`;

  it('parsea vCard', () => {
    const r = classifyQr(vcard);
    expect(r.kind).toBe('vcard');
    expect(r.contact).toMatchObject({
      fullName: 'Hans Müller', firstName: 'Hans', lastName: 'Müller', company: 'Tiefkühl GmbH', department: 'Einkauf',
      role: 'Einkaufsleiter', phone: '+49 30 1234567', mobile: '+49 170 1234567', email: 'hans@tiefkuehl.de', web: 'https://www.tiefkuehl.de',
    });
    expect(r.contact!.address).toContain('Hauptstr. 1');
    expect(r.contact!.notes).toBe('Conocido en SIAL\nvolver a llamar');
  });
  it('vCard con líneas plegadas, CRLF y quoted-printable', () => {
    const c = parseVCard('BEGIN:VCARD\r\nVERSION:2.1\r\nFN;ENCODING=QUOTED-PRINTABLE:Jos=C3=A9 Garc=C3=ADa\r\nNOTE:linea larga\r\n  continuada\r\nEND:VCARD');
    expect(c.fullName).toBe('José García');
    expect(c.notes).toBe('linea larga continuada');
  });
  it('vCard sin FN usa N', () => {
    expect(parseVCard('BEGIN:VCARD\nN:Rossi;Luca\nEND:VCARD').fullName).toBe('Luca Rossi');
  });
  it('parsea MECARD', () => {
    const r = classifyQr('MECARD:N:Rossi,Luca;ORG:Pasta Fresca SRL;TITLE:Titolare;TEL:+390212345678;TEL-AV:+393331112222;EMAIL:luca@pasta.it;URL:https\\://pasta.it;ADR:Via Po 3,Torino,,,;NOTE:ciao\\; fine;;');
    expect(r.kind).toBe('mecard');
    expect(r.contact).toMatchObject({ fullName: 'Luca Rossi', company: 'Pasta Fresca SRL', role: 'Titolare', phone: '+390212345678', mobile: '+393331112222', email: 'luca@pasta.it' });
    expect(r.contact!.web).toBe('https://pasta.it');
    expect(r.contact!.notes).toBe('ciao; fine');
    expect(parseMeCard('MECARD:N:Solo;').fullName).toBe('Solo');
  });
  it('URL, email, teléfono y texto', () => {
    expect(classifyQr('https://acme.com/cat?id=1')).toMatchObject({ kind: 'url', url: 'https://acme.com/cat?id=1' });
    expect(classifyQr('www.acme.com')).toMatchObject({ kind: 'url', url: 'https://www.acme.com/' });
    expect(classifyQr('mailto:Ventas@Acme.com?subject=Hola')).toMatchObject({ kind: 'email', email: 'ventas@acme.com' });
    expect(classifyQr('tel:+34911222333')).toMatchObject({ kind: 'phone', phone: '+34911222333' });
    expect(classifyQr('hola mundo').kind).toBe('text');
  });
  it('no trata como enlace nada que no sea http(s): jamás se ejecuta contenido', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'intent://x#Intent;end']) {
      expect(classifyQr(bad).kind).toBe('text');
      expect(safeHttpUrl(bad)).toBeNull();
    }
  });
  it('contenido vCard con HTML se conserva como texto inerte', () => {
    const r = classifyQr('BEGIN:VCARD\nFN:<img src=x onerror=alert(1)>\nEND:VCARD');
    expect(r.contact!.fullName).toBe('<img src=x onerror=alert(1)>'); // React lo escapa al pintar
  });
});

describe('QR: lectura real de imágenes (decodificación de píxeles)', () => {
  function render(text: string, scale = 6, invert = false) {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size; const quiet = 4; const size = (n + quiet * 2) * scale;
    const px = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const mx = Math.floor(x / scale) - quiet; const my = Math.floor(y / scale) - quiet;
      const dark = mx >= 0 && my >= 0 && mx < n && my < n && !!qr.modules.get(my, mx);
      const v = dark !== invert ? 0 : 255;
      const i = (y * size + x) * 4; px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255;
    }
    return { px, size };
  }
  it('lee QR vCard, MECARD y URL', () => {
    const cases: [string, string][] = [
      ['BEGIN:VCARD\nVERSION:3.0\nFN:Ana Ruiz\nORG:Frío SL\nTEL:+34600111222\nEMAIL:ana@frio.es\nEND:VCARD', 'vcard'],
      ['MECARD:N:Rossi,Luca;EMAIL:l@x.it;;', 'mecard'],
      ['https://siculyfood.com', 'url'],
      ['mailto:a@b.com', 'email'],
    ];
    for (const [text, kind] of cases) {
      const { px, size } = render(text);
      const res = decodeQrFromImageData(px, size, size);
      expect(res?.kind).toBe(kind);
    }
  });
  it('lee QR con colores invertidos y devuelve null si no hay QR', () => {
    const { px, size } = render('https://x.com', 5, true);
    expect(decodeQrFromImageData(px, size, size)?.kind).toBe('url');
    expect(decodeQrFromImageData(new Uint8ClampedArray(100 * 100 * 4).fill(200), 100, 100)).toBeNull();
  });
});

describe('CSV', () => {
  it('escapa comillas/separadores y neutraliza fórmulas', () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('di "hola"')).toBe('"di ""hola"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+34 600')).toBe("'+34 600");
    expect(csvCell(undefined)).toBe('');
  });
  it('lleva BOM UTF-8 y saltos CRLF', () => {
    const out = toCsv(['a', 'b'], [['ñ', 1]]);
    expect(out.startsWith('﻿a;b\r\n')).toBe(true);
    expect(out).toContain('ñ;1');
  });
});
