// Mide el pipeline NUEVO (orientación adaptativa + preprocesado + parser) con OCR real sobre tarjetas sintéticas.
// Ejecutar: npm run test:ocr   (variables opcionales: OCR_LANGS=eng+ita  OCR_CASE=90  OCR_VERBOSE=1)
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { CARDS, renderPhoto, type PhotoOpts } from './cards';
import { addTally, formatTally, newTally, scoreCard, type Extracted } from './score';
import { decodeToRaster, makeNodeWorker } from './engine';
import { scanCard } from '../../lib/cardOcr';
import { parseCard } from '../../lib/ocrParse';

const LOG = 'node_modules/.cache/pipeline.log';
const plog = (m: string) => { try { fs.appendFileSync(LOG, m + '\n'); } catch { /* sin caché */ } };

export function toExtracted(f: ReturnType<typeof parseCard>): Extracted {
  return { company: f.company, name: f.fullName, role: f.role, primaryEmail: f.email, emails: f.emails.map((e) => e.address), mobile: f.mobile, phone: f.phone, web: f.web, address: f.address };
}

const LANGS = process.env.OCR_LANGS ?? 'eng+ita';
const CASES: { name: string; o: PhotoOpts }[] = [
  { name: 'derecha', o: { rotate: 0, skew: 2, blur: 0.6 } },
  { name: 'girada 90°', o: { rotate: 90, skew: 2, blur: 0.6 } },
  { name: 'girada 270°', o: { rotate: 270, skew: -3, blur: 0.6 } },
  { name: 'girada 180°', o: { rotate: 180, skew: 1, blur: 0.6 } },
  { name: 'foto mala (desenfoque, sombra, JPEG 70)', o: { rotate: 90, skew: 4, blur: 1.4, jpeg: 70 } },
  { name: 'tarjeta pequeña en el encuadre 4000px', o: { rotate: 90, skew: 3, blur: 0.8, margin: 2.4, size: 4000 } },
  { name: 'perspectiva leve + giro 270', o: { rotate: 270, skew: -2, shear: 0.12, blur: 0.8, margin: 1.8 } },
];

describe('pipeline nuevo', () => {
  it('mide precisión y tiempo', async () => {
    fs.mkdirSync('node_modules/.cache', { recursive: true });
    fs.writeFileSync(LOG, '');
    const eng = await makeNodeWorker(LANGS);
    const results: Record<string, number> = {};
    for (const c of CASES.filter((x) => !process.env.OCR_CASE || x.name.includes(process.env.OCR_CASE))) {
      const tally = newTally(); const ms: number[] = []; const rots: string[] = [];
      for (const card of CARDS) {
        plog(`> ${card.id} / ${c.name}`);
        const raster = await decodeToRaster(await renderPhoto(card, c.o));
        const r = await scanCard(raster, eng.recognize, { probeSide: Number(process.env.OCR_PROBE ?? 1000) });
        ms.push(r.timings.totalMs); rots.push(`${r.rotation}`);
        const f = parseCard(r.pass.lines);
        const sc = scoreCard(card.expected, toExtracted(f));
        addTally(tally, sc);
        plog(`  rot=${r.rotation} ${Math.round(r.timings.totalMs)}ms probes=${r.timings.probes} scores=${JSON.stringify(r.orientationScores)} ${JSON.stringify(sc)}`);
        if (process.env.OCR_VERBOSE) plog(`${r.pass.text.slice(0, 900)}\n${JSON.stringify({ ...f, info: undefined })}`);
      }
      plog(formatTally(`NUEVO ${c.name} (giros elegidos: ${rots.join(',')})`, tally, CARDS.length, ms));
      results[c.name] = Object.values(tally).reduce((s, t) => s + t.ok, 0) / (CARDS.length * 9);
    }
    await eng.close();
    if (!process.env.OCR_CASE) expect(results['girada 90°']).toBeGreaterThan(0.5);
  }, 900_000);
});
