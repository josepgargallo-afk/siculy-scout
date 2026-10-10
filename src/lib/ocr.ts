// OCR local con Tesseract.js. Worker, núcleo WASM y datos de idioma se sirven desde /ocr/ (la propia app):
// no se contacta con ningún servicio externo y, una vez descargados, funciona sin conexión.
// Se importa de forma perezosa para no afectar al arranque ni a las funciones P0.

const OCR_CACHE = 'scout-ocr';
const CORE_FILES = ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'];

const base = () => new URL('ocr/', document.baseURI).href;

export const OCR_LANG_LABEL: Record<string, string> = { eng: 'Inglés', spa: 'Español', ita: 'Italiano', fra: 'Francés' };

export function ocrFiles(langs: string[]): string[] {
  const b = base();
  return [b + 'worker.min.js', ...CORE_FILES.map((f) => b + f), ...langs.map((l) => `${b}${l}.traineddata.gz`)];
}

export async function isOcrCached(langs: string[]): Promise<boolean> {
  try {
    if (!('caches' in window)) return false;
    const c = await caches.open(OCR_CACHE);
    const checks = await Promise.all(ocrFiles(langs).map((u) => c.match(u)));
    // basta con que exista al menos un núcleo (la app elige el adecuado según el procesador)
    const [worker, ...rest] = checks;
    const cores = rest.slice(0, CORE_FILES.length);
    const langsOk = rest.slice(CORE_FILES.length).every(Boolean);
    return !!worker && cores.some(Boolean) && langsOk;
  } catch { return false; }
}

/** Descarga (una sola vez, con Internet) los recursos OCR a la caché del dispositivo. */
export async function prepareOcrOffline(langs: string[], onProgress?: (done: number, total: number) => void): Promise<void> {
  if (!('caches' in window)) throw new Error('Este navegador no permite caché sin conexión');
  const urls = ocrFiles(langs);
  const cache = await caches.open(OCR_CACHE);
  let done = 0;
  for (const u of urls) {
    if (!(await cache.match(u))) {
      const r = await fetch(u, { cache: 'reload' });
      if (!r.ok) throw new Error(`No se pudo descargar ${u.split('/').pop()} (${r.status})`);
      await cache.put(u, r);
    }
    onProgress?.(++done, urls.length);
  }
}

// ---- motor del navegador para el pipeline de tarjetas ----
import { scanCard, type OcrLine, type OcrPass, type Recognizer, type ScanOptions, type ScanResult } from "./cardOcr";
import { rotateRaster, downscale, type Raster, type Rotation } from "./raster";

/** Decodifica respetando EXIF y limita el lado largo (una foto de 50 MP no cabe cómodamente en memoria). */
export async function decodeRaster(blob: Blob, maxSide = 3200): Promise<Raster> {
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(blob, { imageOrientation: "from-image" }); }
  catch { throw new Error("Formato de imagen no compatible (prueba con JPG o PNG)"); }
  try {
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)); const h = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas no disponible");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, w, h);
    const id = ctx.getImageData(0, 0, w, h);
    return { data: id.data, width: w, height: h };
  } finally { bmp.close(); }
}

export function rasterToCanvas(r: Raster): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = r.width; c.height = r.height;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
  return c;
}

/** JPEG de la tarjeta ya orientada (lado largo ≤ 2400 px). */
export async function rasterToJpeg(r: Raster, rotation: Rotation = 0, maxSide = 2400, quality = 0.9): Promise<Blob> {
  const c = rasterToCanvas(downscale(rotateRaster(r, rotation), maxSide));
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo codificar la imagen"))), "image/jpeg", quality));
}

interface TBlock { paragraphs: { lines: { text: string; confidence: number; words: { text: string; confidence: number }[] }[] }[] }

let cached: { key: string; worker: import("tesseract.js").Worker; psm: number; timer?: number } | null = null;

async function getWorker(langs: string[], onProgress?: (label: string, pct: number) => void) {
  const key = langs.join("+");
  if (cached && cached.key === key) { window.clearTimeout(cached.timer); return cached; }
  if (cached) { void cached.worker.terminate().catch(() => undefined); cached = null; }
  const { createWorker } = await import("tesseract.js");
  const b = base();
  const worker = await createWorker(key, 1, {
    workerPath: b + "worker.min.js", corePath: b.replace(/\/$/, ''), langPath: b.replace(/\/$/, ''), gzip: true,
    logger: (m: { status: string; progress: number }) => { if (typeof m.progress === "number") onProgress?.(m.status, m.progress); },
  });
  cached = { key, worker, psm: -1 };
  return cached;
}

/** Libera la memoria del OCR pasado un rato sin usarlo. */
function scheduleIdleRelease() {
  if (!cached) return;
  window.clearTimeout(cached.timer);
  cached.timer = window.setTimeout(() => { void cached?.worker.terminate().catch(() => undefined); cached = null; }, 120_000);
}

export function releaseOcrWorker() { window.clearTimeout(cached?.timer); void cached?.worker.terminate().catch(() => undefined); cached = null; }

export interface CardScan extends ScanResult { raster: Raster }

/** Escanea una tarjeta: orientación automática (o forzada), preprocesado y OCR 100 % local. */
export async function scanCardBlob(
  input: Blob | Raster, langs: string[], opts: ScanOptions & { onProgress?: (label: string, pct: number) => void } = {},
): Promise<CardScan> {
  const raster = "data" in input ? input : await decodeRaster(input);
  const w = await getWorker(langs, opts.onProgress);
  const recognize: Recognizer = async (img, o) => {
    if (w.psm !== o.psm) {
      await w.worker.setParameters({ tessedit_pageseg_mode: String(o.psm) as never, preserve_interword_spaces: "1", user_defined_dpi: "300" });
      w.psm = o.psm;
    }
    const { data } = await w.worker.recognize(rasterToCanvas(img), { rotateAuto: !!o.deskew }, { text: true, blocks: true });
    const lines: OcrLine[] = [];
    for (const bl of ((data as unknown as { blocks?: TBlock[] }).blocks ?? [])) for (const p of bl.paragraphs) for (const l of p.lines) {
      if (l.text.trim()) lines.push({ text: l.text.replace(/\s+$/, ''), conf: l.confidence, words: l.words.map((x) => ({ text: x.text, conf: x.confidence })) });
    }
    const pass: OcrPass = { text: data.text ?? "", lines, conf: data.confidence ?? 0 };
    return pass;
  };
  try {
    const res = await scanCard(raster, recognize, opts);
    return { ...res, raster };
  } finally { scheduleIdleRelease(); }
}

