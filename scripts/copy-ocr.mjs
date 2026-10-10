// Copia los recursos OCR (worker, núcleo WASM y datos de idioma) a public/ocr
// para servirlos desde la propia app: ninguna petición a CDNs externos.
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const out = 'public/ocr';
mkdirSync(out, { recursive: true });
cpSync('node_modules/tesseract.js/dist/worker.min.js', join(out, 'worker.min.js'));
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  cpSync(join('node_modules/tesseract.js-core', f), join(out, f));
}
for (const l of ['eng', 'spa', 'ita', 'fra']) {
  const src = join('node_modules/@tesseract.js-data', l, '4.0.0_best_int', `${l}.traineddata.gz`);
  if (!existsSync(src)) throw new Error('Falta ' + src);
  cpSync(src, join(out, `${l}.traineddata.gz`));
}
console.log('OCR resources copied to', out);
