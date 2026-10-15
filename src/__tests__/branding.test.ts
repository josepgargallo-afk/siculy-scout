// Rebranding OCCASORIO: la marca visible cambia, pero la identidad técnica de la PWA instalada
// y de sus datos NO debe cambiar (nombre de IndexedDB, formato de copia, cachés, claves locales,
// start_url/scope y ausencia de «id» en el manifest). Si alguna de estas pruebas falla, el cambio
// podría hacer que el móvil trate la app como otra instalación o que no reconozca sus copias.
import 'fake-indexeddb/auto';
import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { ScoutDB } from '../lib/db';
import { FORMAT } from '../lib/backup';
import { SCHEMA_VERSION } from '../lib/types';

const read = (p: string) => readFileSync(p, 'utf8');

describe('identidad técnica conservada', () => {
  it('IndexedDB conserva su nombre y su versión de esquema', async () => {
    const d = new ScoutDB();
    expect(d.name).toBe('siculy-scout');
    expect(d.verno).toBe(2);
    d.close();
  });

  it('el formato de copia ZIP no cambia (las copias antiguas y nuevas son compatibles)', () => {
    expect(FORMAT).toBe('siculy-scout-backup');
    expect(SCHEMA_VERSION).toBe(4);
  });

  it('cachés y claves de almacenamiento local no cambian', () => {
    expect(read('src/lib/ocr.ts')).toContain("'scout-ocr'");
    expect(read('src/lib/settings.ts')).toContain("'scout:settings'");
    expect(read('src/lib/settings.ts')).toContain("'scout:draft:'");
    expect(read('vite.config.ts')).toContain("cacheName: 'scout-ort'");
    expect(read('public/share-target-sw.js')).toContain("'scout-share'");
  });

  it('manifest: mismo start_url y scope, sin «id» nuevo, share target intacto', () => {
    const v = read('vite.config.ts');
    expect(v).toContain("start_url: './'");
    expect(v).toContain("scope: './'");
    expect(v).toContain("action: './share-target'");
    expect(v).not.toMatch(/^\s*id\s*:/m);
    expect(v).toContain("base: './'");
  });
});

describe('marca visible OCCASORIO (Brand Kit v2)', () => {
  it('manifest e index.html usan el nombre y los colores del tablero', () => {
    const v = read('vite.config.ts');
    expect(v).toContain("name: 'OCCASORIO'");
    expect(v).toContain("short_name: 'OCCASORIO'");
    expect(v).toContain("background_color: '#faf8f4'");
    const h = read('index.html');
    expect(h).toContain('<title>OCCASORIO</title>');
    expect(h).toContain('href="favicon.svg"');
    expect(h).toContain('icons/apple-touch-icon.png');
  });

  it('los recursos del kit v2 y los iconos generados existen con su tamaño', async () => {
    for (const f of ['favicon.svg', 'brand/simbolo.svg', 'brand/app_icon.svg', 'brand/app_icon_maskable.svg', 'brand/logo_horizontal_claro.svg', 'brand/logo_horizontal_oscuro.svg', 'brand/logo_horizontal_sin_lema_claro.svg']) {
      expect(existsSync('public/' + f), f).toBe(true);
    }
    const sizes: Record<string, number> = { 'icon-192.png': 192, 'icon-512.png': 512, 'maskable-512.png': 512, 'apple-touch-icon.png': 180, 'favicon-32.png': 32 };
    for (const [f, n] of Object.entries(sizes)) {
      const m = await sharp('public/icons/' + f).metadata();
      expect([m.width, m.height], f).toEqual([n, n]);
    }
  });

  it('no queda nada del kit v1 descartado (punto coral, trazo blanco, anillo turquesa)', () => {
    for (const f of ['public/brand/simbolo.svg', 'public/brand/app_icon.svg', 'public/brand/logo_horizontal_claro.svg', 'src/ui/Brand.tsx', 'src/styles.css']) {
      const s = read(f).toLowerCase();
      expect(s, f).not.toContain('#ff816c');
      expect(s, f).not.toContain('#f9ffff');
      expect(s, f).not.toContain('#1c8ead');
    }
    expect(existsSync('public/brand/simbolo_color.svg')).toBe(false);
  });

  it('el icono maskable mantiene corona y punto dentro de la zona segura (círculo de radio 0,4)', async () => {
    const { data, info } = await sharp('public/icons/maskable-512.png').raw().toBuffer({ resolveWithObject: true });
    let outside = 0, inside = 0;
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      const i = (y * 512 + x) * info.channels; const sat = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
      if (sat < 45) continue; // fondo blanco/gris claro
      if (Math.hypot(x - 256, y - 256) > 0.4 * 512) outside++; else inside++;
    }
    expect(inside).toBeGreaterThan(20000);
    expect(outside).toBe(0);
  });

  it('el icono instalable no contiene naranja/coral', async () => {
    const { data, info } = await sharp('public/icons/icon-512.png').raw().toBuffer({ resolveWithObject: true });
    let warm = 0;
    for (let i = 0; i < data.length; i += info.channels) if (data[i] > 200 && data[i + 1] < 150 && data[i + 2] < 130) warm++;
    expect(warm).toBe(0);
  });

  const BOARD = 'docs/marca/tablero-original.webp';
  it('el símbolo reconstruido coincide visualmente con el tablero original', async () => {
    const d = JSON.parse(read('scripts/brand/symbol-data.json'));
    const N = 900;
    const ref = await sharp(BOARD).extract({ left: 80, top: 50, width: 180, height: 180 }).resize(N, N).raw().toBuffer({ resolveWithObject: true });
    const svg = read('public/brand/simbolo.svg').replace(/viewBox="[^"]*"/, 'viewBox="0 0 900 900"');
    const out = await sharp(Buffer.from(svg), { density: 72 }).resize(N, N).flatten({ background: { r: 250, g: 248, b: 244 } }).raw().toBuffer({ resolveWithObject: true });
    let sum = 0, n = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const r = Math.hypot(x - d.CX, y - d.CY), dd = Math.hypot(x - d.dot.cx, y - d.dot.cy);
      if (!((r < d.R - 12 && r > d.RH + 12) || dd < d.dot.r - 12)) continue;
      let e = 0; for (let k = 0; k < 3; k++) e += Math.abs(ref.data[(y * N + x) * ref.info.channels + k] - out.data[(y * N + x) * out.info.channels + k]);
      sum += e / 3; n++;
    }
    expect(sum / n).toBeLessThan(6); // 0-255 por canal; medido ≈ 4,3 (el tablero está desenfocado)
  });

  it('el logotipo (palabra) coincide con la palabra del tablero', async () => {
    const [L, T, W, H, Z] = [270, 80, 470, 85, 4];
    const ref = await sharp(BOARD).extract({ left: L, top: T, width: W, height: H }).resize(W * Z, H * Z).raw().toBuffer({ resolveWithObject: true });
    const svg = read('public/brand/logo_horizontal_sin_lema_claro.svg').replace(/viewBox="[^"]*"/, `viewBox="${L} ${T} ${W} ${H}"`);
    const out = await sharp(Buffer.from(svg), { density: 72 }).resize(W * Z, H * Z).flatten({ background: '#ffffff' }).raw().toBuffer({ resolveWithObject: true });
    let diff = 0, union = 0;
    for (let i = 0; i < W * Z * H * Z; i++) {
      const a = ref.data[i * ref.info.channels] < 110, b = out.data[i * out.info.channels] < 128;
      if (a !== b) diff++; if (a || b) union++;
    }
    expect(diff / union).toBeLessThan(0.16); // medido ≈ 0,08-0,10 (la «r» se adapta al tablero)
  });
});
