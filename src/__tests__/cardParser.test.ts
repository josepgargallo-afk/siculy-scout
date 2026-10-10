import { describe, expect, it } from 'vitest';
import { hasLegalSuffix, parseCard, parseCardText, plausibility, repairAtSign } from '../lib/ocrParse';

const L = (...rows: (string | [string, number])[]) => rows.map((r) => (Array.isArray(r) ? { text: r[0], conf: r[1] } : { text: r }));

// Todos los datos de estos textos son ficticios.
describe('parser de tarjetas: robustez ante basura de OCR (caso real: empresa «7a 7 sa À»)', () => {
  const noisy = L(
    ['7a 7 sa À', 38], // logotipo mal leído
    ['Dolce Trinacria S.r.l.', 91],
    ['Rosalia Vitale', 93],
    ['Co Founder', 92],
    ['M. +39 338 4417 092', 90],
    ['T. +39 091 6140 552', 90],
    ['rosalia.vitale@dolcetrinacria.it', 89],
    ['rosalia.vitale76@gmail.com', 88],
    ['www.dolcetrinacria.it', 90],
    ['Via Libertà 114', 90], ['90143 Palermo (PA)', 90],
    ['Zona Industriale, Lotto 7', 85], ['90044 Carini (PA)', 85],
    ['P.IVA 06123450821', 80],
  );
  const f = parseCard(noisy);

  it('no elige una cadena ilegible como empresa', () => {
    expect(f.company).toBe('Dolce Trinacria S.r.l.');
    expect(f.company).not.toMatch(/7a/);
    expect(f.extras.join('|')).not.toContain('7a 7 sa');
  });
  it('persona y cargo', () => {
    expect(f.fullName).toBe('Rosalia Vitale');
    expect(f.role).toBe('Co Founder');
  });
  it('todos los emails, con el corporativo (coincide con el nombre) como principal', () => {
    expect(f.emails.map((e) => e.address)).toEqual(['rosalia.vitale@dolcetrinacria.it', 'rosalia.vitale76@gmail.com']);
    expect(f.email).toBe('rosalia.vitale@dolcetrinacria.it');
    expect(f.emails[1].kind).toBe('personal');
    expect(f.extras.some((e) => /personal: rosalia.vitale76@gmail.com/.test(e))).toBe(true);
  });
  it('móvil y teléfono de empresa distintos; el IVA no es un teléfono', () => {
    expect(f.mobile).toBe('+39 338 4417 092');
    expect(f.phone).toBe('+39 091 6140 552');
    expect(JSON.stringify(f)).not.toContain('06123450821'.slice(0, 0) + 'Teléfono sin etiqueta');
    expect(f.extras.some((e) => /IVA/.test(e))).toBe(true); // se conserva como dato adicional
  });
  it('web y las DOS direcciones', () => {
    expect(f.web).toBe('www.dolcetrinacria.it');
    expect(f.addresses).toHaveLength(2);
    expect(f.addresses[0]).toContain('Via Libertà 114');
    expect(f.addresses[1]).toContain('Zona Industriale');
  });
  it('los campos fiables llevan confianza alta', () => {
    expect(f.info.company?.level).toBe('high');
    expect(f.info.fullName?.level).toBe('high');
    expect(f.uncertain).not.toContain('email');
  });
});

describe('parser: texto sin sentido (foto girada leída sin corregir) no rellena nada', () => {
  const rotatedGarbage = L(
    ['0 0 VAId (vd) 1u1eD', 41], ['pp00e £0107', 35], ["*sjeuisnpu) euoz 1'1d/0peLD_ULY", 30], ['MMM ojuawinqers', 38],
    ['7a 7 sa À', 33], ['£ a ¢', 20], ['i , ; -', 22], ['SOA0|a | Q', 28],
  );
  it('deja vacíos empresa, persona, cargo y contactos', () => {
    const f = parseCard(rotatedGarbage);
    expect(f.company).toBeUndefined();
    expect(f.fullName).toBeUndefined();
    expect(f.role).toBeUndefined();
    expect(f.email).toBeUndefined();
    expect(f.mobile).toBeUndefined();
    expect(f.phone).toBeUndefined();
    expect(f.addresses).toHaveLength(0);
    expect(f.extras).toHaveLength(0); // ni siquiera conserva basura como «datos adicionales»
  });
  it('plausibilidad', () => {
    expect(plausibility('7a 7 sa À')).toBeLessThan(0.45);
    expect(plausibility("*sjeuisnpu) euoz 1'1d/0peLD_ULY")).toBeLessThan(0.45);
    expect(plausibility('Dolce Trinacria S.r.l.')).toBeGreaterThan(0.8);
  });
});

describe('parser: formas jurídicas y empresa vs persona', () => {
  it('reconoce formas jurídicas reales y rechaza falsos positivos', () => {
    for (const ok of ['Pastificio Vesuvio S.p.A.', 'Congelados del Sur S.L.', 'Maison Lefèvre SARL', 'Tiefkühl GmbH', 'Highland Foods Ltd', 'Mare Surgelati Srl', 'Delice Surgelés S.A.S.', 'Frutas Norte S.A.', 'Alfa Beta B.V.']) {
      expect(hasLegalSuffix(ok), ok).toBe(true);
    }
    for (const bad of ['7a 7 sa À', 'casa sa', 'Via Roma 8', 'Quality since 1980', 'Rosalia Vitale', 'sa']) {
      expect(hasLegalSuffix(bad), bad).toBe(false);
    }
  });
  it('empresa sin forma jurídica se acepta si coincide con el dominio del email/web', () => {
    const f = parseCard(L('Antica Trinacria', 'Calogero Rizzo', 'Co Founder', 'calogero@anticatrinacria.it', 'www.anticatrinacria.it', '+39 0924 111 222'));
    expect(f.company).toBe('Antica Trinacria');
    expect(f.fullName).toBe('Calogero Rizzo');
  });
  it('sin forma jurídica ni dominio coincidente: no inventa empresa, ofrece alternativas', () => {
    const f = parseCard(L('SAPORI ANTICHI', 'Calogero Rizzo', 'Titolare', 'calogero@gmail.com', '+39 333 123 4567'));
    expect(f.company).toBeUndefined();
    expect(f.info.company?.alternatives).toContain('SAPORI ANTICHI');
  });
  it('una línea de persona no se confunde con empresa y el nombre se apoya en el email', () => {
    const f = parseCard(L('GRECO SALVATORE', 'Sapori di Trinacria S.r.l.', 'CEO & Co Founder', 's.greco@saporiditrinacria.com'));
    expect(f.company).toBe('Sapori di Trinacria S.r.l.');
    expect(f.fullName).toBe('Greco Salvatore'); // mayúsculas → Title Case
    expect(f.role).toBe('CEO & Co Founder');
  });
  it('dos posibles nombres: elige uno y lo marca como dudoso con alternativa', () => {
    const f = parseCard(L('Anna Verdi', 'Paolo Neri', 'Sales Manager', 'info@empresa.com'));
    expect(f.fullName).toBeTruthy();
    expect(f.info.fullName?.alternatives.length).toBeGreaterThan(0);
  });
});

describe('parser: idiomas (es / it / fr / en)', () => {
  it('español: apellido compuesto, móvil y fijo por etiqueta, calle', () => {
    const f = parseCard(L('Congelados del Sur S.L.', 'Alejandro Fernández Ruiz', 'Director Comercial', 'Móvil: +34 612 345 678', 'Tel.: +34 955 120 340', 'afernandez@congeladosdelsur.es', 'Calle Sierpes 25, 2º', '41004 Sevilla'));
    expect(f.fullName).toBe('Alejandro Fernández Ruiz');
    expect(f.firstName).toBeUndefined(); // 3 palabras: no se inventa la división
    expect(f.role).toBe('Director Comercial');
    expect(f.mobile).toBe('+34 612 345 678');
    expect(f.phone).toBe('+34 955 120 340');
    expect(f.address).toContain('Calle Sierpes 25');
  });
  it('francés: Portable / Tél., rue y código postal', () => {
    const f = parseCard(L('Maison Lefèvre SARL', 'Camille Lefèvre', 'Directrice des Achats', 'Portable : +33 6 12 34 56 78', 'Tél. : +33 1 42 60 30 30', 'c.lefevre@maison-lefevre.fr', '12 rue de la Paix', '75002 Paris'));
    expect(f.role).toBe('Directrice des Achats');
    expect(f.mobile).toBe('+33 6 12 34 56 78');
    expect(f.phone).toBe('+33 1 42 60 30 30');
    expect(f.address).toBe('12 rue de la Paix, 75002 Paris');
  });
  it('inglés: Mob / Tel, Ltd', () => {
    const f = parseCard(L('Highland Frozen Foods Ltd', 'James Whitmore', 'Sales Director', 'Mob: +44 7700 900 123', 'Tel: +44 131 496 0123', 'james.whitmore@highlandfrozen.co.uk', 'www.highlandfrozen.co.uk'));
    expect(f.company).toBe('Highland Frozen Foods Ltd');
    expect(f.mobile).toBe('+44 7700 900 123');
    expect(f.phone).toBe('+44 131 496 0123');
    expect(f.web).toBe('www.highlandfrozen.co.uk');
  });
  it('italiano: Cell. / Tel., Amministratore Delegato, varias líneas de dirección', () => {
    const f = parseCard(L('Pastificio Vesuvio S.p.A.', 'Gennaro Esposito', 'Amministratore Delegato', 'Cell. +39 347 889 2210', 'Tel. +39 081 553 7742', 'Via Roma 8', '80132 Napoli (NA)'));
    expect(f.role).toBe('Amministratore Delegato');
    expect(f.mobile).toBe('+39 347 889 2210');
    expect(f.phone).toBe('+39 081 553 7742');
  });
  it('dos teléfonos en la misma línea se separan por etiqueta', () => {
    const f = parseCard(L('T. +39 091 6140 552 - M. +39 338 4417 092'));
    expect(f.phone).toBe('+39 091 6140 552');
    expect(f.mobile).toBe('+39 338 4417 092');
  });
  it('fax no se confunde con teléfono', () => {
    const f = parseCard(L('Tel +39 02 1234 5678', 'Fax +39 02 1234 9999'));
    expect(f.phone).toBe('+39 02 1234 5678');
    expect(f.extras.some((e) => e.startsWith('Fax'))).toBe(true);
  });
});

describe('parser: reparación conservadora de emails/webs mal leídos', () => {
  it('«@» leída como «Q» sobre fondo oscuro se repara y se marca «revisar»', () => {
    expect(repairAtSign('salvatoreQsaporiditrinacria.com')).toBe('salvatore@saporiditrinacria.com');
    const f = parseCard(L('Salvatore Greco', 'salvatoreQsaporiditrinacria.com', 'www.saporiditrinacria.com'));
    expect(f.email).toBe('salvatore@saporiditrinacria.com');
    expect(f.info.email?.level).toBe('review');
    expect(f.web).toBe('www.saporiditrinacria.com');
  });
  it('punto perdido antes del TLD', () => {
    expect(repairAtSign('c.lefevre@maison-lefevre fr')).toBe('c.lefevre@maison-lefevre.fr');
    expect(repairAtSign('www.maison-lefevre fr')).toBe('www.maison-lefevre.fr');
  });
  it('no toca texto normal ni emails correctos', () => {
    for (const s of ['Quality Q1 report', 'Rosalia Vitale', 'a@b.com', 'Qatar Airways']) expect(repairAtSign(s)).toBe(s);
  });
  it('email que difiere ligeramente del dominio de la web queda marcado «revisar»', () => {
    const f = parseCard(L('Mario Rossi', 'mario@rossifrozen.it', 'www.rossifrozeri.it'));
    expect(f.info.email?.level).toBe('review');
  });
});

describe('parser: compatibilidad con texto plano', () => {
  it('parseCardText equivale a parseCard sin confianzas', () => {
    const a = parseCardText('Marco Bianchi\nExport Manager\nSURGELATI MARE S.r.l.\nmarco.bianchi@surgelatimare.it');
    expect(a.company).toBe('SURGELATI MARE S.r.l.');
    expect(a.fullName).toBe('Marco Bianchi');
    expect(parseCardText('')).toMatchObject({ emails: [], extras: [], uncertain: [] });
  });
});

describe('parser: datos de la EMPRESA (para rellenar la ficha)', () => {
  const card = L(
    'DOLCE TRINACRIA S.r.l.', 'Rosalia Vitale', 'Co Founder', 'Dipartimento Export',
    'M. +39 338 4417 092', 'T. +39 091 6140 552',
    'rosalia.vitale@dolcetrinacria.it', 'info@dolcetrinacria.it', 'rosalia.vitale76@gmail.com', 'www.dolcetrinacria.it',
    'Sede legale', 'Via Libertà 114', '90143 Palermo (PA)',
    'Sede operativa', 'Zona Industriale, Lotto 7', '90044 Carini (PA)',
    'P.IVA 06123450821',
  );
  const f = parseCard(card);

  it('nombre comercial (sin forma jurídica) y nombre legal (con ella)', () => {
    expect(f.org.commercialName).toBe('DOLCE TRINACRIA');
    expect(f.org.legalName).toBe('DOLCE TRINACRIA S.r.l.');
  });
  it('dirección legal y operativa según las etiquetas de la tarjeta', () => {
    expect(f.org.legalAddress).toBe('Via Libertà 114, 90143 Palermo (PA)');
    expect(f.org.operationalAddress).toBe('Zona Industriale, Lotto 7, 90044 Carini (PA)');
    expect(f.org.city).toBe('Palermo');
  });
  it('país deducido del prefijo telefónico se marca como deducido (revisar), nunca como seguro', () => {
    expect(f.org.country).toBe('Italia');
    expect(f.org.inferred).toContain('country');
  });
  it('país explícito en la tarjeta no se marca como deducido', () => {
    const g = parseCard(L('Mare Srl', 'Via Po 3', '10100 Torino (TO)', 'Italy'));
    expect(g.org.country).toBe('Italia');
    expect(g.org.inferred).not.toContain('country');
  });
  it('buzón genérico (info@) → empresa; email nominal → persona; personal → conservado', () => {
    expect(f.org.email).toBe('info@dolcetrinacria.it');
    expect(f.email).toBe('rosalia.vitale@dolcetrinacria.it');
    expect(f.extras.some((e) => /personal: rosalia.vitale76@gmail.com/.test(e))).toBe(true);
  });
  it('teléfono fijo → empresa (y persona); móvil → sólo persona', () => {
    expect(f.org.phone).toBe('+39 091 6140 552');
    expect(f.mobile).toBe('+39 338 4417 092');
    expect(f.org.phone).not.toBe(f.mobile);
  });
  it('departamento sólo con palabra clave explícita; un cargo con «ufficio» sigue siendo cargo', () => {
    expect(f.department).toBe('Export');
    const g = parseCard(L('Mario Rossi', 'Responsabile Ufficio Acquisti', 'mario.rossi@x-foods.it'));
    expect(g.department).toBeUndefined();
    expect(g.role).toBe('Responsabile Ufficio Acquisti');
  });
  it('si sólo hay un buzón genérico, no se asigna como email de la persona', () => {
    const g = parseCard(L('Mare Surgelati S.r.l.', 'Luca Neri', 'Titolare', 'info@maresurgelati.it', 'www.maresurgelati.it'));
    expect(g.email).toBeUndefined();
    expect(g.org.email).toBe('info@maresurgelati.it');
  });
  it('dirección con etiqueta en la misma línea', () => {
    const g = parseCard(L('Alfa Srl', 'Sede legale: Via Roma 1, 00100 Roma (RM)', 'Magazzino: Via Appia 20, 04100 Latina (LT)'));
    expect(g.org.legalAddress).toContain('Via Roma 1');
    expect(g.org.operationalAddress).toContain('Via Appia 20');
  });
  it('sin evidencia no inventa: sin ciudad, país ni forma jurídica queda vacío', () => {
    const g = parseCard(L('Luca Neri', 'luca@gmail.com'));
    expect(g.org.country).toBeUndefined();
    expect(g.org.city).toBeUndefined();
    expect(g.org.legalName).toBeUndefined();
    expect(g.org.commercialName).toBeUndefined();
  });
});
