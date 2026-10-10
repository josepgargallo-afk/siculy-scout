// Perfil de tiempos por etapa (escribe en tiempo real a node_modules/.cache/profile.log).
import { it } from 'vitest';
import fs from 'node:fs';
import { CARDS, renderPhoto } from './cards';
import { decodeToRaster, makeNodeWorker } from './engine';
import { downscale, enhanceForOcr, rotateRaster } from '../../lib/raster';

const log = (s: string) => { fs.appendFileSync('node_modules/.cache/profile.log', s + '\n'); };
const time = async <T>(label: string, f: () => Promise<T> | T): Promise<T> => { const t = performance.now(); const r = await f(); log(`${label}: ${Math.round(performance.now() - t)} ms`); return r; };

it('perfil', async () => {
  fs.mkdirSync('node_modules/.cache', { recursive: true }); fs.writeFileSync('node_modules/.cache/profile.log', '');
  const langs = process.env.OCR_LANGS ?? 'eng';
  const eng = await time('crear worker ' + langs, () => makeNodeWorker(langs));
  const card = CARDS[0];
  const buf = await time('renderizar foto', () => renderPhoto(card, { rotate: 90, skew: 2, blur: 0.6 }));
  const raster = await time('decodificar', () => decodeToRaster(buf));
  log(`raster ${raster.width}x${raster.height}`);
  const work = await time('downscale 2600', () => downscale(raster, 2600));
  const small = await time('downscale 1400', () => downscale(work, 1400));
  for (const rot of [0, 90, 270] as const) {
    const r = await time(`rotar+enhance ${rot}`, () => enhanceForOcr(rotateRaster(small, rot)));
    const p = await time(`OCR sonda ${rot} psm11 (${r.width}x${r.height})`, () => eng.recognize(r, { psm: 11 }));
    log(`   palabras=${p.lines.reduce((s, l) => s + l.words.length, 0)} texto="${p.text.replace(/\s+/g, ' ').slice(0, 80)}"`);
  }
  const fin = await time('enhance final', () => enhanceForOcr(rotateRaster(work, 270)));
  for (const psm of [11, 3, 6]) {
    const p = await time(`OCR final psm${psm} (${fin.width}x${fin.height})`, () => eng.recognize(fin, { psm }));
    log(`   conf=${Math.round(p.conf)} lineas=${p.lines.length}`);
  }
  await eng.close();
}, 600_000);
