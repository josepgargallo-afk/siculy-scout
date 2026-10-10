// Orquestación del OCR de tarjetas: orientación adaptativa, preprocesado y lectura final.
// No depende del navegador ni de Tesseract: el motor se inyecta (`Recognizer`), así se prueba con OCR real en Node
// y con motores simulados en pruebas unitarias.
import { cropRaster, downscale, enhanceForOcr, rotateRaster, type Raster, type Rect, type Rotation } from './raster';

export interface OcrWord { text: string; conf: number }
export interface OcrLine { text: string; conf: number; words: OcrWord[] }
export interface OcrPass { text: string; lines: OcrLine[]; conf: number }

export interface RecognizeOptions {
  /** Modo de segmentación de página de Tesseract (3 auto, 6 bloque, 11 texto disperso). */
  psm: number;
  deskew?: boolean;
}
export type Recognizer = (img: Raster, o: RecognizeOptions) => Promise<OcrPass>;

export interface ScanOptions {
  /** 'auto' evalúa orientaciones; un número fuerza ese giro (botones ⟲ ⟳ de la pantalla). */
  rotation?: Rotation | 'auto';
  crop?: Rect;
  /** Lado largo de la imagen para la lectura final. */
  finalSide?: number;
  /** Lado largo de la imagen para evaluar orientaciones. */
  probeSide?: number;
  onStage?: (stage: string) => void;
}

export interface ScanResult {
  pass: OcrPass;
  rotation: Rotation;
  /** puntuación de cada orientación evaluada (vacío si se forzó el giro o la 0° ya era buena) */
  orientationScores: Partial<Record<Rotation, number>>;
  /** false si ninguna orientación dio un texto claramente legible */
  orientationConfident: boolean;
  timings: { probeMs: number; finalMs: number; totalMs: number; probes: number; /** duración de cada reconocimiento (sondas y lectura final) */ passMs: number[] };
}

/** Palabras "buenas": ≥3 letras, confianza alta. Ponderadas por longitud: el texto girado produce pocas y cortas. */
export function orientationScore(p: OcrPass): number {
  let s = 0;
  for (const l of p.lines) for (const w of l.words) {
    const letters = (w.text.match(/\p{L}/gu) || []).length;
    if (letters >= 3 && w.conf >= 70 && letters >= w.text.length * 0.7) s += Math.min(letters, 10) * (w.conf / 100);
  }
  return s;
}

/** Umbral a partir del cual una orientación se acepta sin evaluar las demás (≈ 6-8 palabras claras). */
export const GOOD_ORIENTATION = 45;
/** Por debajo de esto no se considera que haya texto legible. */
export const MIN_ORIENTATION = 12;

const ORDER: Rotation[] = [0, 90, 270, 180];

export async function scanCard(src: Raster, recognize: Recognizer, opts: ScanOptions = {}): Promise<ScanResult> {
  const t0 = performance.now();
  const stage = opts.onStage ?? (() => undefined);
  let work = opts.crop ? cropRaster(src, opts.crop) : src;
  const finalSide = opts.finalSide ?? 2600;
  const probeSide = opts.probeSide ?? 1000;
  work = downscale(work, finalSide);

  const passMs: number[] = [];
  const timed: Recognizer = async (img, o) => { const t = performance.now(); const r = await recognize(img, o); passMs.push(Math.round(performance.now() - t)); return r; };
  const scores: Partial<Record<Rotation, number>> = {};
  let rotation: Rotation = 0;
  let confident = true;
  let probes = 0;
  const tp0 = performance.now();

  if (opts.rotation !== undefined && opts.rotation !== 'auto') {
    rotation = opts.rotation;
  } else {
    stage('Detectando orientación…');
    const small = downscale(work, probeSide);
    let best = -1;
    for (const rot of ORDER) {
      const pass = await timed(enhanceForOcr(rotateRaster(small, rot)), { psm: 11 });
      probes++;
      const sc = orientationScore(pass);
      scores[rot] = sc;
      if (sc > best) { best = sc; rotation = rot; }
      // Si la primera orientación ya es claramente buena (el caso habitual), no se evalúan las demás.
      if (sc >= GOOD_ORIENTATION) { rotation = rot; best = sc; break; }
    }
    confident = best >= MIN_ORIENTATION;
    if (!confident) rotation = 0;
  }
  const probeMs = performance.now() - tp0;

  stage('Leyendo texto…');
  const tf0 = performance.now();
  const final = enhanceForOcr(rotateRaster(work, rotation));
  const pass = await timed(final, { psm: 11, deskew: true });
  const finalMs = performance.now() - tf0;
  return { pass, rotation, orientationScores: scores, orientationConfident: confident, timings: { probeMs, finalMs, totalMs: performance.now() - t0, probes, passMs } };
}
