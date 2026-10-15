// Genera los iconos instalables a partir de los SVG originales del kit OCCASORIO (public/brand/).
// - icon-192/512: app_icon.svg tal cual (cuadrado redondeado sobre azul noche).
// - maskable-512 y apple-touch-icon: el mismo dibujo a sangre (sin esquinas redondeadas), porque
//   Android e iOS aplican su propia máscara; el símbolo ya cae dentro de la zona segura (círculo del 80 %).
// - favicon-32/64: app_icon.svg (el icono completo): el símbolo suelto (favicon.svg del kit) pierde su trazo blanco
//   sobre pestañas claras. public/favicon.svg conserva el original del kit.
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const appIcon = readFileSync('public/brand/app_icon.svg', 'utf8');
const fullBleed = appIcon.replace(/rx="114"/, 'rx="0"');
if (fullBleed === appIcon) throw new Error('app_icon.svg ha cambiado: no se encontró rx="114"');

const out = async (svg, size, file) => {
  await sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
  console.log('✓', file, `${size}×${size}`);
};

await out(appIcon, 512, 'public/icons/icon-512.png');
await out(appIcon, 192, 'public/icons/icon-192.png');
await out(fullBleed, 512, 'public/icons/maskable-512.png');
await out(fullBleed, 180, 'public/icons/apple-touch-icon.png');
await out(appIcon, 64, 'public/icons/favicon-64.png');
await out(appIcon, 32, 'public/icons/favicon-32.png');
