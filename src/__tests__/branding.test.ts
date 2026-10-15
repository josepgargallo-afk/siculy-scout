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

describe('marca visible OCCASORIO', () => {
  it('manifest e index.html usan el nombre y los colores de la marca', () => {
    const v = read('vite.config.ts');
    expect(v).toContain("name: 'OCCASORIO'");
    expect(v).toContain("short_name: 'OCCASORIO'");
    expect(v).toContain("background_color: '#0e1b34'");
    const h = read('index.html');
    expect(h).toContain('<title>OCCASORIO</title>');
    expect(h).toContain('href="brand/app_icon.svg"');
    expect(h).toContain('icons/apple-touch-icon.png');
  });

  it('los recursos del kit y los iconos generados existen con su tamaño', async () => {
    for (const f of ['favicon.svg', 'brand/app_icon.svg', 'brand/simbolo_color.svg', 'brand/logo_horizontal_claro.svg', 'brand/logo_horizontal_oscuro.svg']) {
      expect(existsSync('public/' + f), f).toBe(true);
    }
    const sizes: Record<string, number> = { 'icon-192.png': 192, 'icon-512.png': 512, 'maskable-512.png': 512, 'apple-touch-icon.png': 180, 'favicon-32.png': 32 };
    for (const [f, n] of Object.entries(sizes)) {
      const m = await sharp('public/icons/' + f).metadata();
      expect([m.width, m.height], f).toEqual([n, n]);
    }
  });

  it('el icono maskable no tiene nada fuera de la zona segura (círculo del 80 %)', async () => {
    const { data, info } = await sharp('public/icons/maskable-512.png').raw().toBuffer({ resolveWithObject: true });
    let outside = 0;
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      if (Math.hypot(x - 256, y - 256) <= 0.4 * 512) continue;
      const i = (y * 512 + x) * info.channels;
      if (Math.abs(data[i] - 0x0e) + Math.abs(data[i + 1] - 0x1b) + Math.abs(data[i + 2] - 0x34) > 12) outside++;
    }
    expect(outside).toBe(0);
  });

  it('no quedan textos visibles «Siculy Scout» salvo la mención «antes Siculy Scout»', () => {
    const files = ['src/ui/Directory.tsx', 'src/ui/SettingsScreen.tsx', 'src/ui/ImportVcf.tsx', 'src/ui/QrCapture.tsx', 'src/ui/BackupScreen.tsx', 'index.html'];
    for (const f of files) {
      const t = read(f).replace(/antes Siculy Scout/g, '');
      expect(t, f).not.toMatch(/Siculy Scout/);
    }
  });

  it('el logotipo de la app usa los MISMOS trazados que los SVG aprobados del kit', () => {
    const tsx = read('src/ui/Brand.tsx');
    const pathsOf = (svg: string) => [...svg.matchAll(/<(?:path|circle)[^>]*>/g)].map((m) => m[0]);
    const attr = (el: string, a: string) => (el.match(new RegExp(a + '="([^"]*)"')) ?? [])[1];
    const kit = pathsOf(read('public/brand/app_icon.svg'));
    expect(kit.length).toBe(4);
    for (const el of kit) {
      const d = attr(el, 'd'), r = attr(el, 'r');
      if (d) expect(tsx, 'trazado ' + d.slice(0, 20)).toContain('d="' + d + '"');
      else expect(tsx).toContain('cx="' + attr(el, 'cx') + '" cy="' + attr(el, 'cy') + '" r="' + r + '"');
      const sw = attr(el, 'stroke-width');
      if (sw) expect(tsx).toContain('strokeWidth="' + sw + '"');
    }
    // El icono instalable y el símbolo en línea parten de la misma geometría (símbolo suelto del kit).
    const sym = pathsOf(read('public/brand/simbolo_color.svg')).map((e) => attr(e, 'd')).filter(Boolean);
    for (const d of sym) expect(tsx).toContain('d="' + d + '"');
  });

  it('el icono instalable muestra el trazo blanco interior (no es solo un anillo)', async () => {
    const { data, info } = await sharp('public/icons/icon-512.png').raw().toBuffer({ resolveWithObject: true });
    // Punto del trazo blanco del kit: (47..82, 80..61) en el símbolo => ×3,25 + 48 en el icono de 512.
    const px = (x: number, y: number) => { const i = (y * 512 + x) * info.channels; return [data[i], data[i + 1], data[i + 2]]; };
    const [r, g, b] = px(Math.round(48 + 65 * 3.25), Math.round(48 + 72 * 3.25));
    expect(Math.min(r, g, b)).toBeGreaterThan(200);
    // y el coral del punto de oportunidad
    const [cr, cg, cb] = px(Math.round(48 + 107 * 3.25), Math.round(48 + 83 * 3.25));
    expect([cr > 230, cg > 100 && cg < 160, cb > 90 && cb < 130]).toEqual([true, true, true]);
  });
});
