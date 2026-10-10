// Motor Node para las pruebas de OCR real: Tesseract.js + sharp para decodificar/codificar.
import path from 'node:path';
import sharp from 'sharp';
import { createWorker, type Worker } from 'tesseract.js';
import type { OcrLine, OcrPass, Recognizer } from '../../lib/cardOcr';
import type { Raster } from '../../lib/raster';

export async function decodeToRaster(buf: Buffer): Promise<Raster> {
  const { data, info } = await sharp(buf).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height };
}

export async function toPng(r: Raster): Promise<Buffer> {
  return sharp(Buffer.from(r.data.buffer, r.data.byteOffset, r.data.byteLength), { raw: { width: r.width, height: r.height, channels: 4 } }).png().toBuffer();
}

interface TBlock { paragraphs: { lines: { text: string; confidence: number; words: { text: string; confidence: number }[] }[] }[] }

export function passFromResult(data: { text: string; confidence: number; blocks?: TBlock[] | null }): OcrPass {
  const lines: OcrLine[] = [];
  for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) {
    const words = l.words.map((w) => ({ text: w.text, conf: w.confidence }));
    if (l.text.trim()) lines.push({ text: l.text.replace(/\s+$/, ''), conf: l.confidence, words });
  }
  return { text: data.text, lines, conf: data.confidence };
}

export async function makeNodeWorker(langs: string): Promise<{ recognize: Recognizer; worker: Worker; close: () => Promise<void> }> {
  const worker = await createWorker(langs, 1, { langPath: path.resolve('public/ocr'), gzip: true, cachePath: path.resolve('node_modules/.cache/tess') });
  let curPsm = -1;
  const recognize: Recognizer = async (img, o) => {
    if (curPsm !== o.psm) {
      await worker.setParameters({ tessedit_pageseg_mode: String(o.psm) as never, preserve_interword_spaces: '1', user_defined_dpi: '300' });
      curPsm = o.psm;
    }
    const { data } = await worker.recognize(await toPng(img), { rotateAuto: !!o.deskew }, { text: true, blocks: true });
    return passFromResult(data as never);
  };
  return { recognize, worker, close: async () => { await worker.terminate(); } };
}
