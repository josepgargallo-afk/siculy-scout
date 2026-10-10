// Preparación y saneado de audio / texto para la transcripción local. Funciones puras salvo decodeTo16k (usa Web Audio).

/** Decodifica cualquier audio del navegador (webm/opus, mp4/aac…) a PCM mono 16 kHz, el formato que espera Whisper. */
export async function decodeTo16k(blob: Blob): Promise<Float32Array> {
  const buf = await blob.arrayBuffer();
  const ac = new AudioContext();
  try {
    const a = await ac.decodeAudioData(buf);
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(a.duration * 16000)), 16000);
    const src = off.createBufferSource(); src.buffer = a; src.connect(off.destination); src.start();
    return (await off.startRendering()).getChannelData(0).slice();
  } finally { void ac.close(); }
}

/**
 * ¿Hay voz? Whisper "inventa" frases con silencio o ruido («Gracias por ver el vídeo…»), así que no se transcribe
 * un audio sin energía suficiente durante al menos ~0,4 s.
 */
export function hasSpeech(pcm: Float32Array, sampleRate = 16000): boolean {
  const frame = Math.round(sampleRate * 0.03);
  const frames = Math.floor(pcm.length / frame);
  if (frames < 10) return false;
  const rms = new Float32Array(frames);
  let peak = 0;
  for (let i = 0; i < frames; i++) {
    let s = 0; for (let j = 0; j < frame; j++) { const v = pcm[i * frame + j]; s += v * v; }
    rms[i] = Math.sqrt(s / frame); if (rms[i] > peak) peak = rms[i];
  }
  if (peak < 0.01) return false; // prácticamente silencio digital
  const sorted = [...rms].sort((a, b) => a - b);
  const floor = sorted[Math.floor(frames * 0.2)]; // nivel de ruido de fondo
  const thr = Math.max(0.012, Math.min(floor * 3, peak * 0.5));
  let loud = 0; for (const r of rms) if (r > thr) loud++;
  return loud * 0.03 >= 0.4;
}

/**
 * Whisper puede entrar en bucle repitiendo una frase. Recorta repeticiones consecutivas de n-gramas (n=1..6)
 * que se repiten más de `maxRepeats` veces y devuelve si hubo recorte (para avisar al usuario).
 */
export function collapseRepeats(text: string, maxRepeats = 3): { text: string; trimmed: boolean } {
  const words = text.split(/\s+/).filter(Boolean);
  let trimmed = false;
  for (let n = 1; n <= 6; n++) {
    let i = 0;
    while (i + n * (maxRepeats + 1) <= words.length) {
      const gram = words.slice(i, i + n).join(' ').toLowerCase();
      let reps = 1;
      while (words.slice(i + reps * n, i + (reps + 1) * n).join(' ').toLowerCase() === gram) reps++;
      if (reps > maxRepeats) { words.splice(i + maxRepeats * n, (reps - maxRepeats) * n); trimmed = true; i += maxRepeats * n; }
      else i++;
    }
  }
  return { text: words.join(' '), trimmed };
}

/** Tope de tokens de salida según la duración (≈ 4-5 tokens/s de habla), para cortar bucles. */
export function maxTokensFor(seconds: number): number {
  return Math.min(448, Math.max(40, Math.round(seconds * 6 + 30)));
}

export const WHISPER_LANGS: Record<string, string> = { es: 'Español', it: 'Italiano', en: 'Inglés', fr: 'Francés' };
/** Opciones del selector: «auto» detecta entre los cuatro idiomas de trabajo. */
export const WHISPER_LANG_CHOICES: Record<string, string> = { auto: 'Auto', ...WHISPER_LANGS };
export const WHISPER_LANG_NAME: Record<string, string> = { es: 'spanish', it: 'italian', en: 'english', fr: 'french' };

// ------------------------------------------------------------------ segmentación por voz y nivel
export interface SpeechSegment { start: number; end: number } // en muestras

/** Quita la componente continua y sube el nivel hasta un pico de ~0,9 (ganancia máx. +24 dB). No recorta nunca. */
export function normalizeLevel(pcm: Float32Array, maxGainDb = 24): Float32Array {
  let mean = 0; for (let i = 0; i < pcm.length; i++) mean += pcm[i]; mean /= Math.max(1, pcm.length);
  let peak = 0; for (let i = 0; i < pcm.length; i++) { const v = Math.abs(pcm[i] - mean); if (v > peak) peak = v; }
  const out = new Float32Array(pcm.length);
  if (peak < 1e-4) return out;
  const gain = Math.min(0.9 / peak, 10 ** (maxGainDb / 20));
  for (let i = 0; i < pcm.length; i++) out[i] = (pcm[i] - mean) * gain;
  return out;
}

/**
 * Detecta regiones con voz por energía (umbral adaptativo sobre el ruido de fondo) y las agrupa en segmentos de como
 * máximo `maxLen` segundos, cortando siempre en pausas. Lo que no es voz NO se envía al modelo: es lo que provoca
 * las «alucinaciones» (frases inventadas sobre silencio o ruido). Un audio sin voz devuelve [].
 */
export function segmentSpeech(pcm: Float32Array, o: { sampleRate?: number; maxLen?: number; minSpeech?: number; mergeGap?: number; pad?: number; thresholdDb?: number } = {}): SpeechSegment[] {
  const sr = o.sampleRate ?? 16000;
  const maxLen = (o.maxLen ?? 28) * sr;
  const minSpeech = (o.minSpeech ?? 0.3) * sr;
  const mergeGap = Math.round((o.mergeGap ?? 0.6) * sr);
  const pad = Math.round((o.pad ?? 0.25) * sr);
  const frame = Math.round(sr * 0.02);
  const n = Math.floor(pcm.length / frame);
  if (n < 10) return [];
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < frame; j++) { const v = pcm[i * frame + j]; s += v * v; } e[i] = Math.sqrt(s / frame); }
  const sorted = [...e].sort((a, b) => a - b);
  const floor = sorted[Math.floor(n * 0.15)] || 1e-5; // ruido de fondo
  const top = sorted[Math.floor(n * 0.95)];
  if (top < 0.004) return [];
  // umbral: por encima del ruido de fondo y a una fracción del nivel de voz
  const thr = Math.max(floor * (10 ** ((o.thresholdDb ?? 10) / 20)), top * 0.08, 0.003);
  const on = new Uint8Array(n);
  for (let i = 0; i < n; i++) on[i] = e[i] > thr ? 1 : 0;
  // suavizado: una trama cuenta como voz si ≥ 2 de 3 vecinas superan el umbral
  const voiced = new Uint8Array(n);
  for (let i = 0; i < n; i++) voiced[i] = (on[i - 1] ?? 0) + on[i] + (on[i + 1] ?? 0) >= 2 ? 1 : 0;
  const regions: SpeechSegment[] = [];
  let st = -1;
  for (let i = 0; i <= n; i++) {
    if (i < n && voiced[i]) { if (st < 0) st = i; }
    else if (st >= 0) { regions.push({ start: st * frame, end: i * frame }); st = -1; }
  }
  // unir regiones separadas por pausas cortas
  const merged: SpeechSegment[] = [];
  for (const r of regions) {
    const last = merged[merged.length - 1];
    if (last && r.start - last.end <= mergeGap) last.end = r.end; else merged.push({ ...r });
  }
  const kept = merged.filter((r) => r.end - r.start >= minSpeech);
  // empaquetar en ventanas ≤ maxLen cortando en pausas; una región > maxLen se parte por la trama más silenciosa cercana
  const out: SpeechSegment[] = [];
  const clampS = (v: number) => Math.max(0, Math.min(pcm.length, v));
  let cur: SpeechSegment | null = null;
  const flush = () => { if (cur) { out.push({ start: clampS(cur.start - pad), end: clampS(cur.end + pad) }); cur = null; } };
  const splitLong = (r: SpeechSegment): SpeechSegment[] => {
    const parts: SpeechSegment[] = []; let a = r.start;
    while (r.end - a > maxLen) {
      const lo = Math.floor((a + maxLen * 0.6) / frame); const hi = Math.floor((a + maxLen) / frame);
      let best = hi; let bv = Infinity;
      for (let f = lo; f < hi && f < n; f++) if (e[f] < bv) { bv = e[f]; best = f; }
      parts.push({ start: a, end: best * frame }); a = best * frame;
    }
    parts.push({ start: a, end: r.end });
    return parts;
  };
  for (const r0 of kept) for (const r of splitLong(r0)) {
    if (cur && r.end - cur.start + 2 * pad <= maxLen) cur.end = r.end;
    else { flush(); cur = { ...r }; }
  }
  flush();
  return out;
}

/** Frases que Whisper suele INVENTAR sobre silencio o ruido (subtítulos, despedidas, «suscríbete»…). */
const HALLUCINATIONS = [
  /subt[ií]tulos? (realizados? |creados? )?por/i, /amara\.org/i, /sottotitoli (creati|e revisione|a cura)/i, /grazie (a tutti )?per (aver )?(guardato|l'attenzione)/i,
  /gracias por (ver|vernos|su atenci)/i, /suscr[ií]bete/i, /iscriviti al canale/i, /thanks for watching/i, /please subscribe/i,
  /sous-titr(age|es)/i, /merci d'avoir regard/i, /qtss/i, /transcribed by/i,
];

export function looksHallucinated(text: string): boolean {
  const t = text.trim();
  return !!t && t.length < 120 && HALLUCINATIONS.some((re) => re.test(t));
}

const STOP: Record<string, string[]> = {
  es: ['el', 'la', 'los', 'las', 'de', 'del', 'que', 'y', 'en', 'un', 'una', 'con', 'por', 'para', 'es', 'se', 'no', 'al', 'lo', 'su', 'más', 'pero', 'como', 'muy'],
  it: ['il', 'lo', 'la', 'gli', 'le', 'di', 'del', 'che', 'e', 'in', 'un', 'una', 'con', 'per', 'è', 'si', 'non', 'al', 'della', 'più', 'ma', 'come', 'molto', 'sono', 'ho'],
  en: ['the', 'of', 'and', 'to', 'in', 'a', 'is', 'that', 'for', 'it', 'with', 'as', 'was', 'on', 'are', 'we', 'you', 'they', 'have', 'will'],
  fr: ['le', 'la', 'les', 'de', 'des', 'du', 'et', 'en', 'un', 'une', 'que', 'est', 'pour', 'dans', 'qui', 'pas', 'au', 'sur', 'avec', 'nous'],
};
const LANG_NAME: Record<string, string> = { es: 'español', it: 'italiano', en: 'inglés', fr: 'francés' };

/** Idioma probable de un texto por palabras funcionales (sólo para AVISAR de un posible idioma equivocado). */
export function guessLanguage(text: string): { lang: string; score: number } | null {
  const words = text.toLowerCase().replace(/[^\p{L}\s']/gu, ' ').split(/\s+/).filter(Boolean);
  if (words.length < 6) return null;
  let best: string | null = null; let bs = 0; let second = 0;
  for (const [l, list] of Object.entries(STOP)) {
    const set = new Set(list);
    const s = words.filter((w) => set.has(w)).length / words.length;
    if (s > bs) { second = bs; bs = s; best = l; } else if (s > second) second = s;
  }
  return best && bs >= 0.12 && bs > second * 1.4 ? { lang: best, score: bs } : null;
}

export interface QualityReport { warnings: string[]; suspicious: boolean }

/** Avisos de revisión (no corrige nada): idioma, repeticiones, frases típicas inventadas, ritmo de habla imposible. */
export function assessTranscript(text: string, o: { language: string; speechSeconds: number; trimmed?: boolean; glossary?: string }): QualityReport {
  const warnings: string[] = [];
  // Con vocabulario propio el modelo puede «colar» esos términos aunque no se dijeran: se avisa siempre que aparezcan.
  if (o.glossary?.trim()) {
    const flat = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const hay = flat(text);
    const hits = o.glossary.split(/[,;\n]/).map((t) => t.trim()).filter((t) => t.length >= 4 && hay.includes(flat(t)));
    if (hits.length) warnings.push(`Aparecen términos de tu vocabulario (${hits.slice(0, 4).join(', ')}): comprueba en el audio que se dijeron de verdad.`);
  }
  const words = text.split(/\s+/).filter(Boolean);
  if (looksHallucinated(text)) warnings.push('Parece una frase inventada por el modelo (típica de silencio o ruido).');
  const g = guessLanguage(text);
  if (g && g.lang !== o.language) warnings.push(`El texto parece estar en ${LANG_NAME[g.lang]}, pero se pidió ${LANG_NAME[o.language] ?? o.language}. ¿Idioma equivocado?`);
  if (o.trimmed) warnings.push('El modelo repetía una frase; se recortó la repetición.');
  const wps = o.speechSeconds > 0 ? words.length / o.speechSeconds : 0;
  if (o.speechSeconds >= 3 && wps > 6) warnings.push('Demasiadas palabras para la duración: posible invención.');
  if (o.speechSeconds >= 5 && wps < 0.35) warnings.push('Muy poco texto para la duración del audio: puede faltar contenido.');
  if (/\d/.test(text)) warnings.push('Contiene cifras: comprueba cantidades, pesos y precios con el audio.');
  return { warnings, suspicious: warnings.some((w) => !w.startsWith('Contiene cifras') && !w.startsWith('Aparecen términos')) };
}
