import { describe, expect, it } from 'vitest';
import { assessTranscript, guessLanguage, looksHallucinated, normalizeLevel, segmentSpeech } from '../lib/audioPrep';

const SR = 16000;
/** «habla»: ráfaga de señal modulada de `s` segundos a amplitud `amp`. */
const burst = (s: number, amp = 0.3) => Float32Array.from({ length: Math.round(SR * s) }, (_, i) => amp * Math.sin((i / SR) * 2 * Math.PI * 180) * (0.55 + 0.45 * Math.sin(i / 700)) + amp * 0.2 * Math.sin((i / SR) * 2 * Math.PI * 1300));
const gap = (s: number, noise = 0.0008, seed = 3) => { let x = seed; return Float32Array.from({ length: Math.round(SR * s) }, () => { x = (x * 1664525 + 1013904223) >>> 0; return (x / 4294967296 - 0.5) * 2 * noise; }); };
const cat = (...p: Float32Array[]) => { const o = new Float32Array(p.reduce((a, b) => a + b.length, 0)); let k = 0; for (const q of p) { o.set(q, k); k += q.length; } return o; };

describe('segmentación por voz (evita enviar silencio/ruido al modelo)', () => {
  it('silencio, ruido bajo y zumbido NO generan segmentos', () => {
    expect(segmentSpeech(gap(8, 0.0003))).toEqual([]);
    expect(segmentSpeech(gap(10, 0.02))).toEqual([]);
    const hum = Float32Array.from({ length: SR * 8 }, (_, i) => 0.03 * Math.sin((2 * Math.PI * 50 * i) / SR));
    expect(segmentSpeech(hum)).toEqual([]);
  });

  it('un audio con voz y silencios alrededor genera un único segmento ajustado a la voz', () => {
    const s = segmentSpeech(cat(gap(2), burst(3), gap(2)));
    expect(s).toHaveLength(1);
    expect(s[0].start / SR).toBeGreaterThan(1.5); expect(s[0].start / SR).toBeLessThan(2.1);
    expect(s[0].end / SR).toBeGreaterThan(4.9); expect(s[0].end / SR).toBeLessThan(5.6);
  });

  it('las pausas cortas (<0,6 s) no parten una frase; las largas separan segmentos al empaquetar > 28 s', () => {
    expect(segmentSpeech(cat(burst(2), gap(0.4), burst(2)))).toHaveLength(1);
    const long = cat(burst(12), gap(1.2), burst(12), gap(1.2), burst(12)); // 38 s
    const segs = segmentSpeech(long);
    expect(segs.length).toBe(2);
    for (const s of segs) expect((s.end - s.start) / SR).toBeLessThanOrEqual(28.2);
    // la voz del final NO se pierde (el pipeline original truncaba a 30 s)
    expect(segs[segs.length - 1].end / SR).toBeGreaterThan(37);
  });

  it('un tramo de voz continua > 28 s se parte por el punto más silencioso, sin perder nada', () => {
    const x = burst(40);
    const segs = segmentSpeech(x);
    expect(segs.length).toBeGreaterThanOrEqual(2);
    for (const s of segs) expect((s.end - s.start) / SR).toBeLessThanOrEqual(28.2);
    expect(segs[0].start).toBeLessThan(SR * 0.5);
    expect(segs[segs.length - 1].end).toBeGreaterThan(x.length - SR * 0.5);
  });

  it('voz muy baja (micro lejano) sobre ruido de fondo sigue detectándose', () => {
    const quiet = cat(gap(1.5, 0.002), burst(2.5, 0.05), gap(1.5, 0.002));
    expect(segmentSpeech(quiet)).toHaveLength(1);
  });

  it('descarta ráfagas más cortas que 0,3 s (clics, golpes)', () => {
    expect(segmentSpeech(cat(gap(2), burst(0.15), gap(2)))).toEqual([]);
  });
});

describe('normalización de nivel', () => {
  it('sube el volumen de una grabación baja sin recortar y quita la continua', () => {
    const x = burst(2, 0.08).map((v) => v + 0.1);
    const y = normalizeLevel(x);
    let p = 0; for (const v of y) p = Math.max(p, Math.abs(v));
    expect(p).toBeGreaterThan(0.85); expect(p).toBeLessThanOrEqual(0.9001);
    expect(Math.abs(y.reduce((a, b) => a + b, 0) / y.length)).toBeLessThan(0.01);
  });
  it('el silencio digital se queda en silencio (no amplifica ruido inexistente)', () => {
    expect(normalizeLevel(new Float32Array(1000)).every((v) => v === 0)).toBe(true);
  });
  it('ganancia limitada a +24 dB para no disparar el ruido', () => {
    const x = gap(1, 0.0005);
    let p = 0; for (const v of normalizeLevel(x)) p = Math.max(p, Math.abs(v));
    expect(p).toBeLessThan(0.0005 * 17); // 24 dB ≈ ×15,8
  });
});

describe('avisos de calidad (no cambian el texto)', () => {
  it('frases típicas inventadas sobre silencio', () => {
    expect(looksHallucinated('Subtítulos realizados por la comunidad de Amara.org')).toBe(true);
    expect(looksHallucinated('Sottotitoli creati dalla comunità Amara.org')).toBe(true);
    expect(looksHallucinated('Gracias por ver el vídeo.')).toBe(true);
    expect(looksHallucinated('Hemos hablado con el director y quieren cuarenta cajas.')).toBe(false);
  });
  it('idioma equivocado: texto italiano cuando se pidió español', () => {
    expect(guessLanguage('Vorrei quaranta casse di cannoli siciliani e un listino della mozzarella di bufala per il mese di novembre')?.lang).toBe('it');
    expect(guessLanguage('Hemos hablado con el director de la empresa y quieren probar las gambas congeladas para el mes que viene')?.lang).toBe('es');
    const q = assessTranscript('Vorrei quaranta casse di cannoli siciliani e un listino della mozzarella di bufala per il mese di novembre', { language: 'es', speechSeconds: 8 });
    expect(q.suspicious).toBe(true);
    expect(q.warnings.join(' ')).toContain('italiano');
  });
  it('texto normal no es sospechoso; las cifras sólo piden comprobar', () => {
    const q = assessTranscript('Quiero 40 cajas de cannoli sicilianos de 2 kilos a 12,50 euros el kilo.', { language: 'es', speechSeconds: 6 });
    expect(q.suspicious).toBe(false);
    expect(q.warnings.some((w) => w.startsWith('Contiene cifras'))).toBe(true);
  });
  it('ritmo imposible de palabras o casi nada de texto para mucho audio', () => {
    expect(assessTranscript('uno dos tres '.repeat(40), { language: 'es', speechSeconds: 10 }).suspicious).toBe(true);
    expect(assessTranscript('sí', { language: 'es', speechSeconds: 20 }).suspicious).toBe(true);
  });
  it('repetición recortada se avisa', () => {
    expect(assessTranscript('hemos hablado con el director', { language: 'es', speechSeconds: 5, trimmed: true }).suspicious).toBe(true);
  });
});

describe('vocabulario propio: aviso de términos colados', () => {
  it('avisa cuando un término del glosario aparece en el texto, sin marcar la transcripción como sospechosa', () => {
    const q = assessTranscript('Quiero cajas de cannoli de pistacchio de Bronte', { language: 'es', speechSeconds: 5, glossary: 'cannoli, pistacchio di Bronte, arancini' });
    expect(q.warnings.join(' ')).toContain('cannoli');
    expect(q.suspicious).toBe(false);
  });
  it('sin términos coincidentes o sin glosario no hay aviso', () => {
    expect(assessTranscript('Hablé con el director', { language: 'es', speechSeconds: 5, glossary: 'cannoli, arancini' }).warnings).toEqual([]);
    expect(assessTranscript('Cannoli', { language: 'es', speechSeconds: 5 }).warnings.join('')).not.toContain('vocabulario');
  });
});
