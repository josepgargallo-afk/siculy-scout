import { describe, expect, it } from 'vitest';
import { GOOD_ORIENTATION, orientationScore, scanCard, type OcrPass, type Recognizer } from '../lib/cardOcr';
import { cropRaster, downscale, enhanceForOcr, makeRaster, rotateRaster, type Raster, type Rotation } from '../lib/raster';

function marked(w: number, h: number): Raster {
  // lienzo blanco con un bloque oscuro en la esquina (0,0): sirve para saber cómo está girada la imagen
  const r = makeRaster(w, h);
  r.data.fill(255);
  const bs = Math.max(2, Math.floor(Math.min(w, h) / 4)); // bloque de ≥ 2 % del área (el realce ignora píxeles aislados)
  for (let y = 0; y < bs; y++) for (let x = 0; x < bs; x++) { const i = (y * w + x) * 4; r.data[i] = r.data[i + 1] = r.data[i + 2] = 0; }
  return r;
}
function darkCorner(r: Raster): 'tl' | 'tr' | 'br' | 'bl' {
  let best = 255; let idx = 0;
  for (let i = 0; i < r.width * r.height; i++) if (r.data[i * 4] < best) { best = r.data[i * 4]; idx = i; }
  const x = idx % r.width; const y = Math.floor(idx / r.width);
  return `${y < r.height / 2 ? 't' : 'b'}${x < r.width / 2 ? 'l' : 'r'}` as 'tl';
}

const wordsPass = (n: number, conf: number): OcrPass => ({
  text: 'x', conf, lines: [{ text: 'l', conf, words: Array.from({ length: n }, () => ({ text: 'Palabra', conf })) }],
});

/** Motor simulado: sólo "lee bien" cuando la esquina marcada está arriba a la izquierda (imagen derecha). */
function mockEngine() {
  const calls: { psm: number; w: number; h: number; deskew: boolean }[] = [];
  const recognize: Recognizer = async (img, o) => {
    calls.push({ psm: o.psm, w: img.width, h: img.height, deskew: !!o.deskew });
    return darkCorner(img) === 'tl' ? wordsPass(12, 92) : wordsPass(1, 35);
  };
  return { recognize, calls };
}

describe('raster: operaciones de imagen', () => {
  it('rotar 90 y luego 270 devuelve la imagen original; 180 dos veces también', () => {
    const r = makeRaster(7, 4);
    for (let i = 0; i < r.data.length; i++) r.data[i] = (i * 31) % 256;
    expect(Array.from(rotateRaster(rotateRaster(r, 90), 270).data)).toEqual(Array.from(r.data));
    expect(Array.from(rotateRaster(rotateRaster(r, 180), 180).data)).toEqual(Array.from(r.data));
    const q = rotateRaster(r, 90);
    expect([q.width, q.height]).toEqual([4, 7]);
  });
  it('el giro es horario: la esquina superior izquierda pasa a la superior derecha', () => {
    const m = marked(20, 10);
    expect(darkCorner(rotateRaster(m, 90))).toBe('tr');
    expect(darkCorner(rotateRaster(m, 180))).toBe('br');
    expect(darkCorner(rotateRaster(m, 270))).toBe('bl');
  });
  it('recorte y reducción respetan dimensiones', () => {
    const m = makeRaster(100, 60); m.data.fill(200);
    const c = cropRaster(m, { x: 10, y: 10, w: 50, h: 30 });
    expect([c.width, c.height]).toEqual([50, 30]);
    const d = downscale(m, 50);
    expect([d.width, d.height]).toEqual([50, 30]);
    expect(downscale(m, 500)).toBe(m); // no amplía
  });
  it('realce de contraste: estira el rango y deja texto oscuro sobre fondo claro (invierte fondos oscuros)', () => {
    const grey = makeRaster(10, 10);
    for (let i = 0; i < 100; i++) { const v = i < 50 ? 100 : 140; grey.data.set([v, v, v, 255], i * 4); }
    const e = enhanceForOcr(grey);
    const vals = new Set(Array.from({ length: 100 }, (_, i) => e.data[i * 4]));
    expect(Math.min(...vals)).toBeLessThan(10);
    expect(Math.max(...vals)).toBeGreaterThan(245);
    const dark = makeRaster(10, 10);
    for (let i = 0; i < 100; i++) { const v = i === 0 ? 230 : 20; dark.data.set([v, v, v, 255], i * 4); }
    const ed = enhanceForOcr(dark);
    expect(ed.data[4 * 50]).toBeGreaterThan(200); // fondo oscuro → claro
  });
});

describe('orientación adaptativa', () => {
  it('la puntuación premia palabras claras y largas, no el ruido', () => {
    expect(orientationScore(wordsPass(12, 92))).toBeGreaterThan(GOOD_ORIENTATION);
    expect(orientationScore(wordsPass(50, 40))).toBe(0);
    expect(orientationScore({ text: '', conf: 0, lines: [{ text: '', conf: 0, words: [{ text: '7a', conf: 95 }, { text: '£0', conf: 95 }] }] })).toBe(0);
  });

  it('imagen derecha: UNA sola sonda y lectura final (no se hacen 4 reconocimientos)', async () => {
    const { recognize, calls } = mockEngine();
    const r = await scanCard(marked(60, 40), recognize);
    expect(r.rotation).toBe(0);
    expect(r.timings.probes).toBe(1);
    expect(calls).toHaveLength(2);
    expect(calls[1].deskew).toBe(true);
  });

  it.each<[Rotation, Rotation, number]>([[90, 270, 3], [270, 90, 2], [180, 180, 4]])(
    'foto girada %i°: detecta que hay que girar %i° (sondas: %i)', async (shot, fix, probes) => {
      const { recognize } = mockEngine();
      const photo = rotateRaster(marked(60, 40), shot);
      const r = await scanCard(photo, recognize);
      expect(r.rotation).toBe(fix);
      expect(r.timings.probes).toBe(probes);
      expect(r.orientationConfident).toBe(true);
    });

  it('giro manual: no se evalúan orientaciones, sólo la lectura final', async () => {
    const { recognize, calls } = mockEngine();
    const r = await scanCard(rotateRaster(marked(60, 40), 90), recognize, { rotation: 270 });
    expect(r.rotation).toBe(270);
    expect(r.timings.probes).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it('si ninguna orientación da texto legible: no inventa, cae a 0° y avisa de poca fiabilidad', async () => {
    const recognize: Recognizer = async () => wordsPass(1, 30);
    const r = await scanCard(marked(60, 40), recognize);
    expect(r.orientationConfident).toBe(false);
    expect(r.rotation).toBe(0);
    expect(r.timings.probes).toBe(4);
  });

  it('el recorte se aplica antes de leer', async () => {
    const seen: number[] = [];
    const recognize: Recognizer = async (img) => { seen.push(img.width); return wordsPass(12, 92); };
    await scanCard(marked(100, 60), recognize, { rotation: 0, crop: { x: 0, y: 0, w: 40, h: 30 } });
    expect(seen).toEqual([40]);
  });

  it('limita el tamaño de la lectura final y de las sondas', async () => {
    const seen: number[] = [];
    const recognize: Recognizer = async (img) => { seen.push(Math.max(img.width, img.height)); return wordsPass(12, 92); };
    await scanCard(makeRaster(4000, 3000), recognize, { finalSide: 2000, probeSide: 800 });
    expect(seen).toEqual([800, 2000]);
  });
});
