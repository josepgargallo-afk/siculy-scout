// Banco reproducible de precisión de Whisper (Node, mismos pesos q8 que en el móvil).
// Uso:  npm run asr:bench            (todas las configuraciones, modelo base)
//       ASR_MODEL=small ASR_CONFIG=c3_normvad npm run asr:bench
// Primero: node bench/asr/make-audio.mts
import { it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { env, pipeline } from '@huggingface/transformers';
import { ES, IT, GLOSSARY_ES, GLOSSARY_IT, type Sentence } from './corpus.ts';
import { concat, degrade, readWav16k, silence, rng } from './audioutil.ts';
import { pct, scoreClip, sum, norm, wordEdit, type ClipScore } from './metrics.ts';
import { decodeAudio, decodeLegacy, type DecodeOptions } from '../../src/lib/whisperCore.ts';
import { looksHallucinated } from '../../src/lib/audioPrep.ts';

const MODEL = process.env.ASR_MODEL ?? 'base';
const ONLY = process.env.ASR_CONFIG;
const OUT = path.resolve('bench/asr/results');
fs.mkdirSync(OUT, { recursive: true });
env.cacheDir = path.resolve('node_modules/.cache/hf');

type Cfg = { name: string; legacy?: boolean; o?: Partial<DecodeOptions>; gloss?: boolean; /** forzar un idioma distinto al del audio (error de usuario: audio en italiano con «Español» elegido) */ forceLang?: 'es' | 'it'; /** usar el MISMO glosario (italiano) para todos los audios, como haría la app con un único vocabulario */ glossOnly?: 'it' };
const CONFIGS: Cfg[] = [
  { name: 'c0_legacy_v0.2.0', legacy: true },
  { name: 'c1_vad', o: { normalize: false, vad: true } },
  { name: 'c2_norm', o: { normalize: true, vad: false } },
  { name: 'c3_normvad', o: { normalize: true, vad: true } },
  { name: 'c4_normvad_gloss', o: { normalize: true, vad: true }, gloss: true },
  { name: 'c5_normvad_beam3', o: { normalize: true, vad: true, numBeams: 3 } },
  { name: 'c6_normvad_gloss_beam3', o: { normalize: true, vad: true, numBeams: 3 }, gloss: true },
  { name: 'c7_gloss_single_it', o: { normalize: true, vad: true }, gloss: true, glossOnly: 'it' },
  // Error de usuario: italiano decodificado como español (¿explica «frases italianas deformadas»?)
  { name: 'x_wronglang_it_as_es', o: { normalize: true, vad: true }, forceLang: 'es' },
];

const VOICES: { dir: string; lang: 'es' | 'it'; set: Sentence[]; label: string }[] = [
  { dir: 'sapi-es', lang: 'es', set: ES, label: 'es-SAPI' },
  { dir: 'espeak-es', lang: 'es', set: ES, label: 'es-eSpeak' },
  { dir: 'espeak-it', lang: 'it', set: IT, label: 'it-eSpeak' },
];
const COND = [
  { name: 'clean', f: (x: Float32Array) => degrade(x, { padS: 0.6 }) },
  { name: 'phone', f: (x: Float32Array) => degrade(x, { peak: 0.05, snrDb: 14, padS: 1.5, seed: 11 }) },
];

it(`ASR bench (${MODEL})`, async () => {
  const asr = await pipeline('automatic-speech-recognition', `onnx-community/whisper-${MODEL}`, { dtype: 'q8' });
  const log: string[] = [];
  const P = (s: string) => { log.push(s); fs.appendFileSync(path.join(OUT, `log-${MODEL}.txt`), s + '\n'); };
  fs.writeFileSync(path.join(OUT, `log-${MODEL}.txt`), '');
  let peakRss = 0;

  for (const cfg of CONFIGS.filter((c) => !ONLY || c.name === ONLY)) {
    const rows: Record<string, { score: ClipScore[]; ms: number; audioS: number }> = {};
    const detail: unknown[] = [];
    const run = async (x: Float32Array, lang: 'es' | 'it') => {
      const gl = cfg.glossOnly === 'it' || lang === 'it' ? GLOSSARY_IT : GLOSSARY_ES;
      const r = cfg.legacy ? await decodeLegacy(asr, x, lang) : await decodeAudio(asr, x, { language: cfg.forceLang && lang === 'it' ? cfg.forceLang : lang, ...(cfg.o ?? {}), prompt: cfg.gloss ? gl : undefined });
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
      return r;
    };
    for (const v of VOICES) for (const c of COND) {
      const key = `${v.label}|${c.name}`; rows[key] = { score: [], ms: 0, audioS: 0 };
      for (const s of v.set) {
        const x = c.f(readWav16k(path.resolve('bench/asr/audio', v.dir, `${s.id}.wav`)));
        const r = await run(x, v.lang);
        rows[key].score.push(scoreClip(s, r.text, v.lang === 'es' ? GLOSSARY_ES : GLOSSARY_IT));
        rows[key].ms += r.ms; rows[key].audioS += x.length / 16000;
        detail.push({ key, id: s.id, hyp: r.text });
      }
    }
    // grabaciones largas (> 30 s): 6 frases seguidas con pausas de 1 s
    for (const v of VOICES) {
      const key = `${v.label}|long`; rows[key] = { score: [], ms: 0, audioS: 0 };
      const parts: Float32Array[] = []; const refs: string[] = [];
      for (const s of v.set.slice(0, 6)) { parts.push(readWav16k(path.resolve('bench/asr/audio', v.dir, `${s.id}.wav`)), silence(1, 0.0004)); refs.push(s.ref); }
      const x = degrade(concat(...parts), { padS: 0.6 });
      const r = await run(x, v.lang);
      const fake: Sentence = { id: 'long', lang: v.lang, spoken: '', ref: refs.join(' '), nums: v.set.slice(0, 6).flatMap((s) => s.nums), terms: v.set.slice(0, 6).flatMap((s) => s.terms) };
      rows[key].score.push(scoreClip(fake, r.text, v.lang === 'es' ? GLOSSARY_ES : GLOSSARY_IT));
      rows[key].ms = r.ms; rows[key].audioS = x.length / 16000;
      detail.push({ key, id: 'long', secs: Math.round(x.length / 16000), hyp: r.text });
    }
    // controles sin voz: ¿se inventa texto?
    const rn = rng(5);
    const controls: [string, Float32Array][] = [
      ['silencio', silence(8, 0.0003)],
      ['ruido blanco bajo', silence(10, 0.02, 3)],
      ['zumbido 50 Hz', Float32Array.from({ length: 16000 * 8 }, (_, i) => 0.03 * Math.sin((2 * Math.PI * 50 * i) / 16000) + (rn() - 0.5) * 0.004)],
      ['ruido de tecleo', Float32Array.from({ length: 16000 * 8 }, (_, i) => ((i % 8000) < 200 ? (rn() - 0.5) * 0.3 : (rn() - 0.5) * 0.002))],
    ];
    let halluc = 0; const hallucTexts: string[] = [];
    for (const lang of ['es', 'it'] as const) for (const [name, x] of controls) {
      const r = await run(x, lang);
      if (r.text.trim()) { halluc++; hallucTexts.push(`${lang}/${name}: «${r.text.slice(0, 80)}»${looksHallucinated(r.text) ? ' [frase típica inventada]' : ''}`); }
    }

    P(`\n=== ${MODEL} · ${cfg.name} ===`);
    const groups: Record<string, ClipScore[]> = {};
    let ms = 0; let audio = 0;
    for (const [key, r] of Object.entries(rows)) {
      const t = sum(r.score); ms += r.ms; audio += r.audioS;
      const [voice, cond] = key.split('|');
      (groups[voice] ??= []).push(...r.score);
      (groups[cond] ??= []).push(...r.score);
      P(`  ${key.padEnd(18)} WER ${String(pct(t.err, t.words)).padStart(5)}%  números ${String(pct(t.numsOk, t.numsTotal)).padStart(5)}%  términos(glosario) ${String(pct(t.termsGlossOk, t.termsGlossTotal)).padStart(5)}%  términos(otros) ${String(pct(t.termsOk, t.termsTotal)).padStart(5)}%  ins ${t.ins}`);
    }
    const all = sum(Object.values(rows).flatMap((r) => r.score));
    P(`  TOTAL  WER ${pct(all.err, all.words)}%  (sub ${all.sub} del ${all.del} ins ${all.ins} / ${all.words})  números ${pct(all.numsOk, all.numsTotal)}%  términos glosario ${pct(all.termsGlossOk, all.termsGlossTotal)}%  otros ${pct(all.termsOk, all.termsTotal)}%`);
    for (const k of ['es-SAPI', 'es-eSpeak', 'it-eSpeak']) { const t = sum(groups[k]); P(`   ${k.padEnd(10)} WER ${pct(t.err, t.words)}%  números ${pct(t.numsOk, t.numsTotal)}%`); }
    P(`  controles sin voz (8 clips es+it): con texto inventado ${halluc}/8 ${hallucTexts.length ? '\n    ' + hallucTexts.join('\n    ') : ''}`);
    P(`  tiempo: ${(ms / 1000 / audio).toFixed(2)} s de cálculo por s de audio · RSS máx ${Math.round(peakRss / 1048576)} MB`);
    fs.writeFileSync(path.join(OUT, `${MODEL}-${cfg.name}.json`), JSON.stringify(detail, null, 1));
    fs.writeFileSync(path.join(OUT, `${MODEL}-${cfg.name}.controls.txt`), `controles con texto: ${halluc}/8\n${hallucTexts.join('\n')}\nRSS máx ${Math.round(peakRss / 1048576)} MB · ${(ms / 1000 / audio).toFixed(2)} s/s\n`);
    void norm; void wordEdit;
  }
}, 3_600_000);
