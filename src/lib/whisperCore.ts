// Núcleo de decodificación de Whisper, compartido por la app (Web Worker) y por el banco de pruebas (Node):
// lo que se mide es exactamente lo que se despliega.
//
// Por qué no se usa `asr(audio, {chunk_length_s})` tal cual (Transformers.js 4.x, comprobado en el código instalado):
//  · procesa UNA ventana de 30 s: el audio posterior se descarta en silencio (`chunk_length_s` se ignora en Whisper);
//  · no admite prompt/vocabulario;
//  · no tiene umbral de «no hay voz»: sobre silencio o ruido el modelo inventa texto.
// Aquí el audio se normaliza, se divide por pausas en segmentos de voz ≤ 28 s y sólo éstos llegan al modelo.
import { Tensor } from '@huggingface/transformers';
import { collapseRepeats, normalizeLevel, segmentSpeech, WHISPER_LANG_NAME, type SpeechSegment } from './audioPrep';

export interface DecodeOptions {
  /** 'es' | 'it' | 'en' | 'fr', o 'auto' = detectar SÓLO entre esos cuatro (nunca el modo libre de Whisper). */
  language: string;
  /** Vocabulario/glosario para orientar la ortografía de nombres de producto (no corrige nada por sí solo). */
  prompt?: string;
  /** 1 = voraz. >1 = búsqueda por haces (más precisa, más lenta). */
  numBeams?: number;
  /** Subir el nivel de volumen antes de transcribir. */
  normalize?: boolean;
  /** Dividir por voz y descartar lo que no es voz. false = comportamiento original (todo el audio, truncado a 30 s). */
  vad?: boolean;
  /** Tope de tokens de salida por segundo de audio del segmento. */
  tokensPerSecond?: number;
  noRepeatNgramSize?: number;
  onSegment?: (done: number, total: number) => void;
}

export interface SegmentResult { startS: number; endS: number; text: string }
export interface DecodeResult {
  /** idioma realmente usado (el detectado si se pidió 'auto') */
  language?: string;
  /** probabilidad del idioma detectado (sólo en 'auto') */
  langProb?: number;
  text: string;
  segments: SegmentResult[];
  speechSeconds: number;
  totalSeconds: number;
  trimmed: boolean;
  ms: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Asr = any;

export const DEFAULTS: Required<Pick<DecodeOptions, 'numBeams' | 'normalize' | 'vad' | 'tokensPerSecond'>> = {
  numBeams: 1, normalize: true, vad: true, tokensPerSecond: 12,
};

async function decodeSegment(asr: Asr, seg: Float32Array, o: DecodeOptions): Promise<string> {
  const inputs = await asr.processor(seg);
  const gc = asr.model.generation_config;
  const tok = asr.tokenizer;
  const name = WHISPER_LANG_NAME[o.language];
  if (!name) throw new Error('Idioma no soportado: ' + o.language);
  const sot = gc.decoder_start_token_id;
  const langId = gc.lang_to_id[`<|${o.language}|>`];
  const taskId = gc.task_to_id.transcribe; // SIEMPRE transcribir, nunca traducir
  const noTs = gc.no_timestamps_token_id;
  let init: number[] = [sot, langId, taskId, noTs];
  if (o.prompt?.trim()) {
    const prev = tok.convert_tokens_to_ids(['<|startofprev|>'])[0];
    const ids: number[] = tok.encode(' ' + o.prompt.trim(), { add_special_tokens: false }).map(Number).slice(-200);
    if (prev !== undefined && ids.length) init = [Number(prev), ...ids, ...init];
  }
  const seconds = seg.length / 16000;
  const tps = o.tokensPerSecond ?? DEFAULTS.tokensPerSecond;
  const maxNew = Math.max(24, Math.min(440 - init.length, Math.round(seconds * tps) + 24));
  const out = await asr.model.generate({
    ...inputs, decoder_input_ids: init, max_new_tokens: maxNew, num_beams: o.numBeams ?? DEFAULTS.numBeams, do_sample: false,
    ...(o.noRepeatNgramSize ? { no_repeat_ngram_size: o.noRepeatNgramSize } : {}),
  });
  const all: number[] = (out.tolist ? out.tolist()[0] : out[0]).map(Number);
  // el resultado incluye los tokens iniciales (y el prompt): se descartan antes de decodificar
  const body = all.slice(init.length);
  return tok.decode(body, { skip_special_tokens: true }).trim();
}

/** Transcribe un audio completo (PCM 16 kHz mono). */
export async function decodeAudio(asr: Asr, pcmIn: Float32Array, opt: DecodeOptions): Promise<DecodeResult> {
  const t0 = performance.now();
  const o = { ...DEFAULTS, ...opt };
  const pcm = o.normalize ? normalizeLevel(pcmIn) : pcmIn;
  const segs: SpeechSegment[] = o.vad ? segmentSpeech(pcm) : [{ start: 0, end: Math.min(pcm.length, 30 * 16000) }];
  const results: SegmentResult[] = [];
  let speech = 0; let i = 0;
  let language = o.language; let langProb: number | undefined;
  if (o.language === 'auto' && segs.length) {
    const longest = segs.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
    const d = await detectLanguage(asr, pcm.slice(longest.start, longest.end));
    language = d.lang; langProb = d.probs[d.lang];
  }
  for (const s of segs) {
    const text = await decodeSegment(asr, pcm.slice(s.start, s.end), { ...o, language: language === 'auto' ? 'es' : language });
    speech += (s.end - s.start) / 16000;
    if (text) results.push({ startS: s.start / 16000, endS: s.end / 16000, text });
    opt.onSegment?.(++i, segs.length);
  }
  const joined = results.map((r) => r.text).join(' ').replace(/\s+/g, ' ').trim();
  const { text, trimmed } = collapseRepeats(joined);
  return { language: language === 'auto' ? undefined : language, langProb, text, segments: results, speechSeconds: speech, totalSeconds: pcmIn.length / 16000, trimmed, ms: performance.now() - t0 };
}

/** Configuración ORIGINAL (v0.2.0), conservada sólo para comparar en el banco de pruebas. */
export async function decodeLegacy(asr: Asr, pcm: Float32Array, language: string): Promise<DecodeResult> {
  const t0 = performance.now();
  const seconds = pcm.length / 16000;
  const maxNew = Math.min(448, Math.max(40, Math.round(Math.min(seconds, 30) * 6 + 30)));
  const out = await asr(pcm, { language: WHISPER_LANG_NAME[language], task: 'transcribe', chunk_length_s: 30, max_new_tokens: maxNew, return_timestamps: false });
  const { text, trimmed } = collapseRepeats(String(out.text).trim());
  return { text, segments: [], speechSeconds: seconds, totalSeconds: seconds, trimmed, ms: performance.now() - t0 };
}

/**
 * Detecta el idioma entre los candidatos con UN paso del decodificador (logits de los tokens de idioma), sin generar
 * texto. Restringido a los idiomas de trabajo: el modo automático libre de Whisper traduce o se confunde.
 * Devuelve la probabilidad relativa de cada candidato.
 */
export async function detectLanguage(asr: Asr, seg: Float32Array, candidates: string[] = ['es', 'it', 'en', 'fr']): Promise<{ lang: string; probs: Record<string, number> }> {
  const inputs = await asr.processor(seg);
  const gc = asr.model.generation_config;
  const ids = candidates.map((l) => Number(gc.lang_to_id[`<|${l}|>`]));
  const start = new Tensor('int64', BigInt64Array.from([BigInt(gc.decoder_start_token_id)]), [1, 1]);
  const out = await asr.model({ ...inputs, decoder_input_ids: start });
  const logits: Float32Array = out.logits.data as Float32Array;
  const vocab = out.logits.dims[out.logits.dims.length - 1] as number;
  const last = logits.subarray(logits.length - vocab);
  const sel = ids.map((i) => last[i]);
  const mx = Math.max(...sel);
  const ex = sel.map((v) => Math.exp(v - mx));
  const z = ex.reduce((a, b) => a + b, 0);
  const probs = Object.fromEntries(candidates.map((l, i) => [l, ex[i] / z]));
  const lang = candidates[ex.indexOf(Math.max(...ex))];
  return { lang, probs };
}
