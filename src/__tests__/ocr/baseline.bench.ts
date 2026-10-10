// LÍNEA BASE: pipeline original (imagen entera, 4 idiomas, PSM por defecto, parser antiguo).
// Sólo sirve para documentar las causas del mal resultado. Ejecutar: npm run test:ocr
import { describe, it } from 'vitest';
import path from 'node:path';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { CARDS, renderPhoto } from './cards';
import { addTally, formatTally, newTally, scoreCard } from './score';
import { parseCardText } from '../../lib/ocrParse';

const LANG_PATH = path.resolve('public/ocr');

describe('baseline (pipeline original)', () => {
  it('mide precisión y tiempo', async () => {
    const worker = await createWorker('eng+spa+ita+fra', 1, { langPath: LANG_PATH, gzip: true, cachePath: path.resolve('node_modules/.cache/tess') });
    for (const rot of [0, 90] as const) {
      const tally = newTally(); const ms: number[] = [];
      for (const c of CARDS) {
        const photo = await renderPhoto(c, { rotate: rot, skew: 2, blur: 0.6 });
        const img = await sharp(photo).resize({ width: 2400, height: 2400, fit: 'inside' }).jpeg({ quality: 90 }).toBuffer();
        const t0 = performance.now();
        const { data } = await worker.recognize(img);
        ms.push(performance.now() - t0);
        const f = parseCardText(data.text);
        addTally(tally, scoreCard(c.expected, {
          company: f.company, name: f.fullName, role: f.role, primaryEmail: f.email, emails: [f.email, ...f.extras.filter((e) => e.startsWith('Email')).map((e) => e.slice(7))].filter(Boolean) as string[],
          mobile: f.mobile, phone: f.phone, web: f.web, address: f.address,
        }));
      }
      console.log(formatTally(`BASELINE rot=${rot}`, tally, CARDS.length, ms));
    }
    await worker.terminate();
  }, 600_000);
});
