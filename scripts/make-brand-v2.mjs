// OCCASORIO — Brand Kit v2. Genera símbolo, logotipos, iconos de app, favicons, PNG, tokens y el ZIP del kit.
//
// Fuente de verdad visual: docs/marca/tablero-original.webp (imagen raster; NO se dispone del vector original).
// El símbolo es una RECONSTRUCCIÓN vectorial: geometría y colores medidos sobre el tablero
// (scripts/brand/symbol-data.json). El logotipo usa Outfit Medium y el lema Outfit Regular (SIL OFL 1.1),
// convertidos a contornos y colocados en las posiciones medidas (scripts/brand/wordmark-data.json).
//
// Uso: node scripts/make-brand-v2.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { zipSync, strToU8 } from 'fflate';

const S = JSON.parse(fs.readFileSync('scripts/brand/symbol-data.json', 'utf8'));
const WM = JSON.parse(fs.readFileSync('scripts/brand/wordmark-data.json', 'utf8'));
const { CX, CY, R, RH } = S;
const f = (n) => (Math.round(n * 10) / 10).toString();
const pol = (a, r) => [CX + r * Math.cos((a * Math.PI) / 180), CY + r * Math.sin((a * Math.PI) / 180)];

export const COLOR = {
  indigo: '#6366F1', violeta: '#8B5CF6', turquesa: '#06B6D4', azulOscuro: '#0F172A', grisNeutro: '#64748B', grisClaro: '#E2E8F0',
  fondo: '#FAF8F4', lemaOscuro: '#CBD5E1',
};

// ---------------------------------------------------------------- símbolo (coordenadas del recorte del tablero)
const ringPath = `M${f(CX - R)} ${f(CY)}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0ZM${f(CX - RH)} ${f(CY)}a${RH} ${RH} 0 1 0 ${2 * RH} 0a${RH} ${RH} 0 1 0 ${-2 * RH} 0Z`;
const catmull = (pts) => {
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
};
const stops = (arr) => arr.map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}"${op !== undefined ? ` stop-opacity="${op}"` : ''}/>`).join('');

/** Símbolo a color. `p` = prefijo de ids (para poder incrustar varios en una misma página). */
function symbolColor(p) {
  let defs = '', body = '';
  const n = S.colors.length - 1;
  for (let i = 0; i < n; i++) {
    const a0 = S.tipAngle + i * S.step, a1 = a0 + S.step, e = 0.7;
    const [x0, y0] = pol(a0, (R + RH) / 2), [x1, y1] = pol(a1, (R + RH) / 2);
    defs += `<linearGradient id="${p}s${i}" gradientUnits="userSpaceOnUse" x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}"><stop offset="0" stop-color="${S.colors[i]}"/><stop offset="1" stop-color="${S.colors[i + 1]}"/></linearGradient>`;
    const [ox0, oy0] = pol(a0, R + 6), [ox1, oy1] = pol(a1 + e, R + 6), [ix1, iy1] = pol(a1 + e, RH - 6), [ix0, iy0] = pol(a0, RH - 6);
    body += `<path d="M${f(ox0)} ${f(oy0)}A${R + 6} ${R + 6} 0 0 1 ${f(ox1)} ${f(oy1)}L${f(ix1)} ${f(iy1)}A${RH - 6} ${RH - 6} 0 0 0 ${f(ix0)} ${f(iy0)}Z" fill="url(#${p}s${i})"/>`;
  }
  S.unders.forEach((u, k) => {
    defs += `<linearGradient id="${p}u${k}" gradientUnits="userSpaceOnUse" x1="${u.grad[0][0]}" y1="${u.grad[0][1]}" x2="${u.grad[1][0]}" y2="${u.grad[1][1]}">${stops(u.stops)}</linearGradient>`;
    const d = catmull(u.edge) + (u.edge2 ? catmull([u.edge[u.edge.length - 1], ...u.edge2]).replace(/^M[^C]*/, '') : '');
    body += `<path d="${d}${u.close}" fill="url(#${p}u${k})"/>`;
  });
  const sh = S.shadow;
  defs += `<radialGradient id="${p}sh" gradientUnits="userSpaceOnUse" cx="${CX}" cy="${CY}" r="${sh.r1}"><stop offset="${RH / sh.r1}" stop-color="${sh.color}" stop-opacity="${sh.o0}"/><stop offset="${sh.mid / sh.r1}" stop-color="${sh.color}" stop-opacity="${sh.o1}"/><stop offset="1" stop-color="${sh.color}" stop-opacity="0"/></radialGradient>`;
  body += `<circle cx="${CX}" cy="${CY}" r="${sh.r1}" fill="url(#${p}sh)"/>`;
  const d = S.dot;
  defs += `<clipPath id="${p}ring"><path d="${ringPath}" clip-rule="evenodd"/></clipPath><linearGradient id="${p}dot" gradientUnits="userSpaceOnUse" x1="${d.g[0][0]}" y1="${d.g[0][1]}" x2="${d.g[1][0]}" y2="${d.g[1][1]}"><stop offset="0" stop-color="${d.c0}"/><stop offset="1" stop-color="${d.c1}"/></linearGradient>`;
  return { defs, body: `<g clip-path="url(#${p}ring)">${body}</g><circle cx="${d.cx}" cy="${d.cy}" r="${d.r}" fill="url(#${p}dot)"/>` };
}
/** Símbolo monocolor: corona plana + punto (sin pliegue), como la «versión monocroma» del tablero. */
function symbolMono(fill) {
  return { defs: '', body: `<path d="${ringPath}" fill="${fill}" fill-rule="evenodd"/><circle cx="${S.dot.cx}" cy="${S.dot.cy}" r="${S.dot.r}" fill="${fill}"/>` };
}
const SYM_VIEWBOX = '41 39 800 800'; // símbolo + 20/15 px de margen
const svgWrap = (vb, inner, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${extra}>${inner}</svg>\n`;
const withDefs = (s, inner) => `<defs>${s.defs}</defs>${inner}`;

// ---------------------------------------------------------------- logotipos (coordenadas del tablero: x = 80 + cx/5, y = 50 + cy/5)
const LOGO_VB = '86 56 644 164';
function logo({ dark = false, mono = null, claim = true }) {
  const s = mono ? symbolMono(mono) : symbolColor('occ');
  const word = mono ?? (dark ? '#FFFFFF' : COLOR.azulOscuro);
  const tag = mono ? mono : dark ? COLOR.lemaOscuro : COLOR.grisNeutro;
  const vb = LOGO_VB; // el símbolo mide 154 de alto: la caja es la misma con y sin lema
  return svgWrap(vb,
    `<title>OCCASORIO</title><defs>${s.defs}</defs><g transform="translate(80 50) scale(0.2)">${s.body}</g><path d="${WM.word}" fill="${word}"/>${claim ? `<path d="${WM.tag}" fill="${tag}"/>` : ''}`);
}

// ---------------------------------------------------------------- icono de app (lienzo de 512)
// Pieza normal (propósito «any»): baldosa blanca redondeada con la corona centrada (≈ 64,5 % del ancho), como el tablero.
// Pieza maskable/apple: sangrado completo; el conjunto corona+punto cabe en el círculo seguro (radio 0,39·512).
function iconSvg({ maskable = false, appleFull = false }) {
  const s = symbolColor('ico');
  let sc, ox, oy;
  if (maskable) {
    sc = 0.44;
    const dx = S.dot.cx - CX, dy = S.dot.cy - CY, dist = Math.hypot(dx, dy);
    const shift = (dist + S.dot.r - R) / 2; // distancia del centro del círculo mínimo respecto al centro de la corona
    ox = 256 - (CX + (dx / dist) * shift) * sc; oy = 256 - (CY + (dy / dist) * shift) * sc;
  } else {
    sc = (0.6451 * 512) / (2 * R);
    ox = 256 - CX * sc; oy = 256 - CY * sc;
  }
  const rx = maskable || appleFull ? 0 : 114;
  return svgWrap('0 0 512 512',
    `<title>OCCASORIO</title><defs><linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F1F4FA"/></linearGradient>${s.defs}</defs>` +
    `<rect width="512" height="512" rx="${rx}" fill="url(#tile)"/><g transform="translate(${f(ox)} ${f(oy)}) scale(${sc})">${s.body}</g>`);
}

// ---------------------------------------------------------------- escritura
const write = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const png = async (svg, w, h, file, flatten) => {
  let img = sharp(Buffer.from(svg), { density: 384 }).resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
  if (flatten) img = img.flatten({ background: flatten });
  await img.png({ compressionLevel: 9 }).toFile(file);
};

const sym = symbolColor('occ');
const files = {
  'simbolo.svg': svgWrap(SYM_VIEWBOX, `<title>OCCASORIO</title>${withDefs(sym, sym.body)}`),
  'simbolo_monocromo.svg': svgWrap(SYM_VIEWBOX, `<title>OCCASORIO</title>${symbolMono(COLOR.azulOscuro).body}`),
  'simbolo_blanco.svg': svgWrap(SYM_VIEWBOX, `<title>OCCASORIO</title>${symbolMono('#FFFFFF').body}`),
  'logo_horizontal_claro.svg': logo({ dark: false }),
  'logo_horizontal_oscuro.svg': logo({ dark: true }),
  'logo_horizontal_sin_lema_claro.svg': logo({ dark: false, claim: false }),
  'logo_horizontal_sin_lema_oscuro.svg': logo({ dark: true, claim: false }),
  'logo_monocromo.svg': logo({ mono: COLOR.azulOscuro }),
  'logo_blanco.svg': logo({ mono: '#FFFFFF' }),
  'app_icon.svg': iconSvg({}),
  'app_icon_maskable.svg': iconSvg({ maskable: true }),
  'favicon.svg': svgWrap(SYM_VIEWBOX, `<title>OCCASORIO</title>${withDefs(sym, sym.body)}`),
};

const KIT = 'docs/marca/v2';
const PUB = 'public/brand';
for (const [name, svg] of Object.entries(files)) { write(`${KIT}/${name}`, svg); write(`${PUB}/${name}`, svg); }
write('public/favicon.svg', files['favicon.svg']);

// PNG del kit
const pngs = {};
const P = async (name, svg, w, h, flat) => { const file = `${KIT}/${name}`; await png(svg, w, h, file, flat); pngs[name] = fs.readFileSync(file); };
await P('app_icon_192.png', files['app_icon.svg'], 192, 192);
await P('app_icon_512.png', files['app_icon.svg'], 512, 512);
await P('app_icon_1024.png', files['app_icon.svg'], 1024, 1024);
await P('app_icon_maskable_512.png', files['app_icon_maskable.svg'], 512, 512);
await P('favicon_32.png', files['favicon.svg'], 32, 32);
await P('favicon_64.png', files['favicon.svg'], 64, 64);
await P('simbolo_1024.png', files['simbolo.svg'], 1024, 1024);
await P('logo_horizontal_claro.png', files['logo_horizontal_claro.svg'], 1932, 492);
await P('logo_horizontal_oscuro.png', files['logo_horizontal_oscuro.svg'], 1932, 492);

// PWA / app (public/icons)
const apple = iconSvg({ appleFull: true });
await png(files['app_icon.svg'], 192, 192, 'public/icons/icon-192.png');
await png(files['app_icon.svg'], 512, 512, 'public/icons/icon-512.png');
await png(files['app_icon_maskable.svg'], 512, 512, 'public/icons/maskable-512.png');
await png(apple, 180, 180, 'public/icons/apple-touch-icon.png');
await png(files['favicon.svg'], 64, 64, 'public/icons/favicon-64.png');
await png(files['favicon.svg'], 32, 32, 'public/icons/favicon-32.png');

// tokens
const tokens = `/* OCCASORIO — Brand Kit v2. Valores medidos en el tablero original (paleta del propio tablero). */
:root {
  --occ-indigo: ${COLOR.indigo};
  --occ-violeta: ${COLOR.violeta};
  --occ-turquesa: ${COLOR.turquesa};
  --occ-azul-oscuro: ${COLOR.azulOscuro};
  --occ-gris-neutro: ${COLOR.grisNeutro};
  --occ-gris-claro: ${COLOR.grisClaro};
  --occ-fondo: ${COLOR.fondo}; /* blanco cálido del tablero */
  --occ-font-marca: 'Outfit', system-ui, sans-serif; /* logotipo y lema (ya convertidos a contornos en los SVG) */
  --occ-font-interfaz: 'Inter', system-ui, sans-serif; /* texto de la aplicación (indicado en el tablero) */
}
`;
write(`${KIT}/tokens.css`, tokens);

// ZIP del kit (sin la vista previa si no existe todavía; la guía y la vista previa se añaden con make-brand-v2-docs)
console.log('Kit v2 generado en', KIT, 'y recursos en', PUB, '/ public/icons');
export { files };
