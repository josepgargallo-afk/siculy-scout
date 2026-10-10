import { it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { env, pipeline } from '@huggingface/transformers';
import { readWav16k, degrade } from './audioutil.ts';
import { ES, IT } from './corpus.ts';
import { detectLanguage } from '../../src/lib/whisperCore.ts';
import { normalizeLevel, segmentSpeech } from '../../src/lib/audioPrep.ts';

env.cacheDir = path.resolve('node_modules/.cache/hf');
const L = (s: string) => fs.appendFileSync('bench/asr/results/langdetect.txt', s + '\n');

it('detección de idioma', async () => {
  fs.writeFileSync('bench/asr/results/langdetect.txt', '');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asr: any = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-base', { dtype: 'q8' });
  const sets: [string, string, 'es' | 'it'][] = [['sapi-es', 'es', 'es'], ['espeak-es', 'es', 'es'], ['espeak-it', 'it', 'it']];
  let ok = 0, tot = 0;
  for (const [dir, , want] of sets) for (const cond of ['clean', 'phone']) {
    let okg = 0, n = 0; const wrong: string[] = [];
    for (const s of (want === 'es' ? ES : IT)) {
      const x0 = readWav16k(path.resolve('bench/asr/audio', dir, `${s.id}.wav`));
      const x = normalizeLevel(cond === 'clean' ? degrade(x0, { padS: 0.6 }) : degrade(x0, { peak: 0.05, snrDb: 14, padS: 1.5, seed: 11 }));
      const seg = segmentSpeech(x)[0];
      const r = await detectLanguage(asr, x.slice(seg.start, seg.end));
      n++; if (r.lang === want) okg++; else wrong.push(`${s.id}->${r.lang}(${Object.entries(r.probs).map(([k, v]) => k + ':' + v.toFixed(2)).join(',')})`);
    }
    ok += okg; tot += n;
    L(`${dir}/${cond}: ${okg}/${n} ${wrong.join(' ')}`);
  }
  L(`TOTAL ${ok}/${tot}`);
}, 900000);
