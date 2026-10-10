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
export const WHISPER_LANG_NAME: Record<string, string> = { es: 'spanish', it: 'italian', en: 'english', fr: 'french' };
