import fs from 'node:fs';

/** Lee un WAV PCM16 (cualquier frecuencia, mono/estéreo) y lo devuelve mono a 16 kHz. */
export function readWav16k(file: string): Float32Array {
  const b = fs.readFileSync(file);
  let p = 12; let fmt: { ch: number; rate: number; bits: number } | null = null; let data: Buffer | null = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4); let size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(p + 10), rate: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') { if (p + 8 + size > b.length) size = b.length - p - 8; data = b.subarray(p + 8, p + 8 + size); break; }
    p += 8 + size + (size % 2);
  }
  if (!fmt || !data || fmt.bits !== 16) throw new Error('WAV no soportado: ' + file);
  const n = Math.floor(data.length / 2 / fmt.ch);
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < fmt.ch; c++) s += data.readInt16LE((i * fmt.ch + c) * 2); mono[i] = s / fmt.ch / 32768; }
  if (fmt.rate === 16000) return mono;
  const k = fmt.rate / 16000; const m = Math.floor(n / k); const out = new Float32Array(m);
  for (let i = 0; i < m; i++) { const x = i * k; const i0 = Math.floor(x); const f = x - i0; out[i] = mono[i0] * (1 - f) + (mono[i0 + 1] ?? mono[i0]) * f; }
  return out;
}

/** PRNG determinista (los experimentos deben ser reproducibles). */
export function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export const rms = (a: Float32Array) => { let s = 0; for (const v of a) s += v * v; return Math.sqrt(s / Math.max(1, a.length)); };
const peak = (a: Float32Array) => { let p = 0; for (const v of a) if (Math.abs(v) > p) p = Math.abs(v); return p; };

export function silence(seconds: number, noise = 0, seed = 1): Float32Array {
  const r = rng(seed); const o = new Float32Array(Math.round(seconds * 16000));
  if (noise) for (let i = 0; i < o.length; i++) o[i] = (r() * 2 - 1) * noise;
  return o;
}

export function concat(...parts: Float32Array[]): Float32Array {
  const o = new Float32Array(parts.reduce((a, p) => a + p.length, 0)); let k = 0;
  for (const p of parts) { o.set(p, k); k += p.length; }
  return o;
}

/** Condiciones de grabación: nivel bajo (micro lejano / voz suave) y ruido ambiente a una relación señal/ruido dada. */
export function degrade(x: Float32Array, o: { peak?: number; snrDb?: number; padS?: number; seed?: number }): Float32Array {
  const p = peak(x) || 1;
  const g = (o.peak ?? p) / p;
  const speech = x.map((v) => v * g);
  const noiseRms = o.snrDb === undefined ? 0 : rms(speech) / 10 ** (o.snrDb / 20);
  const pad = Math.round((o.padS ?? 0) * 16000);
  const full = concat(new Float32Array(pad), speech, new Float32Array(pad));
  if (noiseRms) { const r = rng(o.seed ?? 7); let lp = 0; for (let i = 0; i < full.length; i++) { const w = (r() * 2 - 1) * Math.sqrt(3) * noiseRms; lp = 0.7 * lp + 0.3 * w; full[i] += lp * 1.6; } }
  return full;
}
