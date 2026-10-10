// Generador de tarjetas de visita SINTÉTICAS (datos ficticios) para medir el OCR.
// Se renderizan con sharp (SVG) y se componen como una foto de móvil: tarjeta sobre una mesa,
// ligero giro, sombra, desenfoque y JPEG. Nada de esto contiene datos reales.
import sharp, { type OverlayOptions } from 'sharp';

export interface Expected {
  company: string;
  name: string;
  role: string;
  /** el primero es el email que debería quedar como principal */
  emails: string[];
  mobile?: string;
  phone?: string;
  web?: string;
  address: string; // primera línea de la primera dirección
}

export interface CardSpec {
  id: string;
  lang: 'it' | 'es' | 'fr' | 'en';
  portrait?: boolean;
  dark?: boolean; // fondo oscuro con texto claro
  expected: Expected;
  svg: (w: number, h: number) => string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const t = (x: number, y: number, s: string, size: number, o: { w?: string; fill?: string; font?: string; style?: string; anchor?: string; ls?: number } = {}) =>
  `<text x="${x}" y="${y}" font-family="${o.font ?? 'Arial, Helvetica, sans-serif'}" font-size="${size}" font-weight="${o.w ?? 'normal'}" fill="${o.fill ?? '#111'}" font-style="${o.style ?? 'normal'}" text-anchor="${o.anchor ?? 'start'}" letter-spacing="${o.ls ?? 0}">${esc(s)}</text>`;

/** Logotipo ficticio: formas + texto estilizado que genera "basura" típica de OCR. */
const logo = (x: number, y: number, r: number, color: string, word: string) => `
  <circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>
  <path d="M${x - r * 0.6} ${y + r * 0.3} L${x} ${y - r * 0.7} L${x + r * 0.6} ${y + r * 0.3} Z" fill="#fff" opacity="0.9"/>
  ${t(x, y + r + 26, word, 20, { fill: color, font: 'Georgia, serif', style: 'italic', anchor: 'middle', ls: 3 })}`;

export const CARDS: CardSpec[] = [
  {
    id: 'it-horizontal-2tel-2email-2addr', lang: 'it',
    expected: {
      company: 'Trinacria Dolci S.r.l.', name: 'Rosalia Vitale', role: 'Co Founder',
      emails: ['rosalia.vitale@trinacriadolci.it', 'rosalia.vitale76@gmail.com'],
      mobile: '+39 338 4417 092', phone: '+39 091 6140 552', web: 'www.trinacriadolci.it', address: 'Via Libertà 114',
    },
    svg: (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 1050 600">
      <rect width="1050" height="600" fill="#fbf7ef"/><rect x="0" y="0" width="22" height="600" fill="#9b2335"/>
      ${logo(120, 110, 52, '#9b2335', 'DAL 1962')}
      ${t(210, 100, 'TRINACRIA DOLCI S.r.l.', 44, { w: 'bold', fill: '#9b2335' })}
      ${t(210, 138, 'Pasticceria e conserve siciliane', 22, { fill: '#555', style: 'italic' })}
      ${t(60, 270, 'Rosalia Vitale', 46, { w: 'bold' })}
      ${t(60, 312, 'Co Founder', 28, { fill: '#444' })}
      ${t(60, 380, 'M. +39 338 4417 092', 26)}
      ${t(60, 416, 'T. +39 091 6140 552', 26)}
      ${t(60, 452, 'rosalia.vitale@trinacriadolci.it', 26)}
      ${t(60, 488, 'rosalia.vitale76@gmail.com', 26)}
      ${t(60, 524, 'www.trinacriadolci.it', 26)}
      ${t(600, 380, 'Sede legale', 20, { w: 'bold', fill: '#9b2335' })}
      ${t(600, 410, 'Via Libertà 114', 22)}${t(600, 438, '90143 Palermo (PA)', 22)}
      ${t(600, 480, 'Stabilimento', 20, { w: 'bold', fill: '#9b2335' })}
      ${t(600, 510, 'Zona Industriale, Lotto 7', 22)}${t(600, 538, '90044 Carini (PA)', 22)}
      ${t(60, 575, 'P.IVA 06123450821', 18, { fill: '#777' })}
    </svg>`,
  },
  {
    id: 'es-horizontal-movil', lang: 'es',
    expected: {
      company: 'Congelados del Sur S.L.', name: 'Alejandro Fernández Ruiz', role: 'Director Comercial',
      emails: ['afernandez@congeladosdelsur.es'], mobile: '+34 612 345 678', phone: '+34 955 120 340',
      web: 'www.congeladosdelsur.es', address: 'Calle Sierpes 25',
    },
    svg: (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 1050 600">
      <rect width="1050" height="600" fill="#ffffff"/><rect x="0" y="0" width="1050" height="120" fill="#12466b"/>
      ${t(60, 78, 'CONGELADOS DEL SUR S.L.', 46, { w: 'bold', fill: '#fff' })}
      ${t(60, 230, 'Alejandro Fernández Ruiz', 44, { w: 'bold' })}
      ${t(60, 272, 'Director Comercial', 28, { fill: '#12466b' })}
      ${t(60, 350, 'Móvil: +34 612 345 678', 26)}
      ${t(60, 388, 'Tel.: +34 955 120 340', 26)}
      ${t(60, 426, 'afernandez@congeladosdelsur.es', 26)}
      ${t(60, 464, 'www.congeladosdelsur.es', 26)}
      ${t(60, 530, 'Calle Sierpes 25, 2º', 24)}${t(60, 560, '41004 Sevilla', 24)}
      ${logo(900, 330, 60, '#12466b', 'FRÍO Y SABOR')}
    </svg>`,
  },
  {
    id: 'fr-horizontal-portable', lang: 'fr',
    expected: {
      company: 'Maison Lefèvre SARL', name: 'Camille Lefèvre', role: 'Directrice des Achats',
      emails: ['c.lefevre@maison-lefevre.fr'], mobile: '+33 6 12 34 56 78', phone: '+33 1 42 60 30 30',
      web: 'www.maison-lefevre.fr', address: '12 rue de la Paix',
    },
    svg: (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 1050 600">
      <rect width="1050" height="600" fill="#f4f1ea"/>
      ${logo(900, 110, 55, '#2d5a3d', 'EPICERIE FINE')}
      ${t(60, 100, 'MAISON LEFÈVRE SARL', 46, { w: 'bold', fill: '#2d5a3d' })}
      ${t(60, 240, 'Camille Lefèvre', 46, { w: 'bold' })}
      ${t(60, 282, 'Directrice des Achats', 28, { fill: '#2d5a3d' })}
      ${t(60, 360, 'Portable : +33 6 12 34 56 78', 26)}
      ${t(60, 396, 'Tél. : +33 1 42 60 30 30', 26)}
      ${t(60, 432, 'c.lefevre@maison-lefevre.fr', 26)}
      ${t(60, 468, 'www.maison-lefevre.fr', 26)}
      ${t(60, 530, '12 rue de la Paix', 24)}${t(60, 560, '75002 Paris', 24)}
    </svg>`,
  },
  {
    id: 'en-horizontal-ltd', lang: 'en',
    expected: {
      company: 'Highland Frozen Foods Ltd', name: 'James Whitmore', role: 'Sales Director',
      emails: ['james.whitmore@highlandfrozen.co.uk'], mobile: '+44 7700 900 123', phone: '+44 131 496 0123',
      web: 'www.highlandfrozen.co.uk', address: '45 George Street',
    },
    svg: (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 1050 600">
      <rect width="1050" height="600" fill="#ffffff"/><rect x="0" y="540" width="1050" height="60" fill="#1b2a49"/>
      ${logo(120, 100, 50, '#1b2a49', 'EST. 1994')}
      ${t(200, 108, 'Highland Frozen Foods Ltd', 42, { w: 'bold', fill: '#1b2a49' })}
      ${t(60, 250, 'James Whitmore', 46, { w: 'bold' })}
      ${t(60, 292, 'Sales Director', 28, { fill: '#555' })}
      ${t(60, 360, 'Mob: +44 7700 900 123', 26)}
      ${t(60, 396, 'Tel: +44 131 496 0123', 26)}
      ${t(60, 432, 'james.whitmore@highlandfrozen.co.uk', 26)}
      ${t(60, 468, 'www.highlandfrozen.co.uk', 26)}
      ${t(560, 360, '45 George Street', 24)}${t(560, 390, 'Edinburgh EH2 2PF', 24)}
    </svg>`,
  },
  {
    id: 'it-vertical-logos', lang: 'it', portrait: true,
    expected: {
      company: 'Pastificio Vesuvio S.p.A.', name: 'Gennaro Esposito', role: 'Amministratore Delegato',
      emails: ['g.esposito@pastificiovesuvio.it'], mobile: '+39 347 889 2210', phone: '+39 081 553 7742',
      web: 'www.pastificiovesuvio.it', address: 'Via Roma 8',
    },
    svg: (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 600 1050">
      <rect width="600" height="1050" fill="#fffdf6"/><rect x="0" y="0" width="600" height="230" fill="#c8102e"/>
      ${logo(300, 90, 55, '#ffffff', 'NAPOLI')}
      ${t(300, 205, 'PASTIFICIO VESUVIO S.p.A.', 30, { w: 'bold', fill: '#fff', anchor: 'middle' })}
      ${t(300, 340, 'Gennaro Esposito', 40, { w: 'bold', anchor: 'middle' })}
      ${t(300, 380, 'Amministratore Delegato', 24, { fill: '#c8102e', anchor: 'middle' })}
      ${t(300, 470, 'Cell. +39 347 889 2210', 24, { anchor: 'middle' })}
      ${t(300, 506, 'Tel. +39 081 553 7742', 24, { anchor: 'middle' })}
      ${t(300, 542, 'g.esposito@pastificiovesuvio.it', 22, { anchor: 'middle' })}
      ${t(300, 578, 'www.pastificiovesuvio.it', 22, { anchor: 'middle' })}
      ${t(300, 700, 'Via Roma 8', 22, { anchor: 'middle' })}${t(300, 728, '80132 Napoli (NA)', 22, { anchor: 'middle' })}
      ${t(300, 790, 'IT • DE • FR • UK • US', 18, { fill: '#888', anchor: 'middle' })}
      ${t(300, 960, 'P.IVA 01234567890 - REA NA-445566', 16, { fill: '#999', anchor: 'middle' })}
    </svg>`,
  },
  {
    id: 'it-dark-sidebar-cofounder', lang: 'it', dark: true,
    expected: {
      company: 'Sapori di Trinacria S.r.l.', name: 'Salvatore Greco', role: 'CEO & Co Founder',
      emails: ['salvatore@saporiditrinacria.com', 'salvo.greco@libero.it'], mobile: '+39 320 556 1189',
      phone: '+39 0924 531 207', web: 'www.saporiditrinacria.com', address: 'Contrada Fiumelato 5',
    },
    svg: (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 1050 600">
      <rect width="1050" height="600" fill="#1c1c1c"/><rect x="0" y="0" width="300" height="600" fill="#8a1c1c"/>
      ${logo(150, 190, 70, '#f2c14e', 'ANTICHI GUSTI')}
      ${t(150, 420, 'S.r.l.', 24, { fill: '#f2c14e', anchor: 'middle', font: 'Georgia, serif' })}
      ${t(340, 90, 'SAPORI DI TRINACRIA S.r.l.', 40, { w: 'bold', fill: '#f2c14e' })}
      ${t(340, 220, 'Salvatore Greco', 44, { w: 'bold', fill: '#fff' })}
      ${t(340, 260, 'CEO & Co Founder', 26, { fill: '#ccc' })}
      ${t(340, 330, 'M: +39 320 556 1189', 24, { fill: '#fff' })}
      ${t(340, 364, 'T: +39 0924 531 207', 24, { fill: '#fff' })}
      ${t(340, 398, 'salvatore@saporiditrinacria.com', 24, { fill: '#fff' })}
      ${t(340, 432, 'salvo.greco@libero.it', 24, { fill: '#fff' })}
      ${t(340, 466, 'www.saporiditrinacria.com', 24, { fill: '#fff' })}
      ${t(340, 520, 'Contrada Fiumelato 5', 22, { fill: '#ccc' })}${t(340, 548, '91011 Alcamo (TP)', 22, { fill: '#ccc' })}
    </svg>`,
  },
];

export interface PhotoOpts {
  rotate?: 0 | 90 | 180 | 270;
  /** giro pequeño (grados) como si la tarjeta estuviera torcida sobre la mesa */
  skew?: number;
  blur?: number;
  shadow?: boolean;
  /** lado largo de la "foto" en px */
  size?: number;
  jpeg?: number;
  /** tamaño de la mesa respecto a la tarjeta (1.35 = tarjeta grande en el encuadre; 2.4 = pequeña) */
  margin?: number;
  /** cizalla horizontal que imita una perspectiva leve */
  shear?: number;
}

/** Compone la tarjeta sobre una mesa y devuelve un JPEG como el de una cámara de móvil. */
export async function renderPhoto(spec: CardSpec, o: PhotoOpts = {}): Promise<Buffer> {
  const cw = spec.portrait ? 600 : 1050; const ch = spec.portrait ? 1050 : 600;
  const scale = 2; // tarjeta a 2x → texto ≈ 50-90 px de alto, como una foto de cerca
  let card = sharp(Buffer.from(spec.svg(cw * scale, ch * scale))).png();
  if (o.skew) card = sharp(await card.rotate(o.skew, { background: '#00000000' }).toBuffer()).png();
  let cardBuf = await card.toBuffer();
  if (o.shear) cardBuf = await sharp(cardBuf).affine([[1, o.shear], [0, 1]], { background: "#00000000" }).png().toBuffer();
  const meta = await sharp(cardBuf).metadata();
  const W = Math.round((meta.width ?? 2100) * (o.margin ?? 1.35)); const H = Math.round((meta.height ?? 1200) * (o.margin ?? 1.35));
  const layers: OverlayOptions[] = [];
  if (o.shadow !== false) {
    // degradado de luz irregular sobre toda la foto
    const grad = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.38"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`);
    layers.push({ input: cardBuf, gravity: 'centre' }, { input: grad, top: 0, left: 0 });
  } else layers.push({ input: cardBuf, gravity: 'centre' });
  let img = sharp({ create: { width: W, height: H, channels: 3, background: '#6b4f3a' } }).composite(layers);
  let buf = await img.png().toBuffer();
  let p = sharp(buf);
  if (o.rotate) p = p.rotate(o.rotate);
  const long = o.size ?? 3000;
  p = p.resize({ width: long, height: long, fit: 'inside' });
  if (o.blur) p = p.blur(o.blur);
  buf = await p.jpeg({ quality: o.jpeg ?? 88 }).toBuffer();
  return buf;
}
