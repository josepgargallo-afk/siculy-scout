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

export interface OcrOutcome { text: string; confidence: number }

export async function runOcr(
  image: Blob, langs: string[], onProgress?: (label: string, pct: number) => void, timeoutMs = 120_000,
): Promise<OcrOutcome> {
  const { createWorker } = await import('tesseract.js');
  const b = base();
  const worker = await createWorker(langs.join('+'), 1, {
    workerPath: b + 'worker.min.js',
    corePath: b.replace(/\/$/, ''),
    langPath: b.replace(/\/$/, ''),
    gzip: true,
    logger: (m: { status: string; progress: number }) => {
      if (typeof m.progress === 'number') onProgress?.(m.status, m.progress);
    },
  });
  try {
    const job = worker.recognize(image);
    const timer = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('El OCR tardó demasiado')), timeoutMs));
    const res = await Promise.race([job, timer]);
    return { text: res.data.text ?? '', confidence: res.data.confidence ?? 0 };
  } finally {
    worker.terminate().catch(() => undefined);
  }
}
