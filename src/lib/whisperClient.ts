import { decodeTo16k } from './audioPrep';
import { getSettings, saveSettings } from './settings';
import { pendingCount, processQueue, recoverInterrupted, type Engine } from './transcribe';

const ortBase = () => new URL('ort/', document.baseURI).href;

let worker: Worker | null = null;
let loadedModel: string | null = null;
let idleTimer: number | undefined;
let seq = 0;
type Result = { text: string; model: string; speechSeconds?: number; trimmed?: boolean; config?: string; language?: string; langProb?: number };
const pending = new Map<number, { ok: (v: Result) => void; err: (e: Error) => void }>();
let loadWaiter: { ok: () => void; err: (e: Error) => void; progress?: (l: number, t: number) => void } | null = null;

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data as { type: string; id?: number; text?: string; model?: string; message?: string; loaded?: number; total?: number; speechSeconds?: number; trimmed?: boolean; config?: string; language?: string; langProb?: number };
    if (m.type === 'progress') loadWaiter?.progress?.(m.loaded ?? 0, m.total ?? 0);
    else if (m.type === 'loaded') { loadedModel = m.model ?? null; loadWaiter?.ok(); loadWaiter = null; }
    else if (m.type === 'result' && m.id !== undefined) { pending.get(m.id)?.ok({ text: m.text ?? '', model: m.model ?? '', speechSeconds: m.speechSeconds, trimmed: m.trimmed, config: m.config, language: m.language, langProb: m.langProb }); pending.delete(m.id); }
    else if (m.type === 'error') {
      const err = new Error(m.message);
      if (m.id !== undefined) { pending.get(m.id)?.err(err); pending.delete(m.id); } else { loadWaiter?.err(err); loadWaiter = null; }
    }
  };
  worker.onerror = (e) => {
    const err = new Error(e.message || 'Fallo del motor de transcripción');
    loadWaiter?.err(err); loadWaiter = null;
    pending.forEach((p) => p.err(err)); pending.clear();
    worker = null; loadedModel = null;
  };
  return worker;
}

export function releaseWhisper() {
  window.clearTimeout(idleTimer);
  worker?.terminate(); worker = null; loadedModel = null;
}

/** Carga (y, la primera vez, DESCARGA) el modelo. */
export function loadWhisper(model: 'tiny' | 'base' | 'small', onProgress?: (loaded: number, total: number) => void): Promise<void> {
  window.clearTimeout(idleTimer);
  if (loadedModel === model && worker) return Promise.resolve();
  if (worker && loadedModel && loadedModel !== model) releaseWhisper();
  return new Promise((ok, err) => {
    loadWaiter = { ok, err, progress: onProgress };
    ensureWorker().postMessage({ type: 'load', model, ortBase: ortBase() });
  });
}

/** Descarga el runtime WASM (propio) y el modelo; sólo marca «instalado» si la carga termina bien. */
export async function installWhisper(model: 'tiny' | 'base' | 'small', onProgress?: (loaded: number, total: number) => void): Promise<void> {
  // El runtime se sirve desde la propia app: se pide ahora para que quede en la caché del Service Worker (uso sin conexión).
  for (const f of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
    const r = await fetch(ortBase() + f, { cache: 'reload' });
    if (!r.ok) throw new Error(`No se pudo descargar el runtime (${f}: ${r.status})`);
  }
  await loadWhisper(model, onProgress);
  saveSettings({ whisperInstalled: model });
}

export async function removeWhisperModel() {
  releaseWhisper();
  for (const k of await caches.keys()) if (k === 'transformers-cache' || k === 'scout-ort') await caches.delete(k);
  saveSettings({ whisperInstalled: null, transcriptionEnabled: false });
}

function scheduleIdle() {
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(releaseWhisper, 5 * 60_000); // libera memoria si no se usa
}

const engine = (): Promise<Engine> => {
  const s = getSettings();
  const model = s.whisperInstalled;
  if (!model) return Promise.reject(new Error('Modelo de transcripción no instalado (Ajustes → Transcripción).'));
  return loadWhisper(model).then(() => ({
    transcribe: (pcm, language, opts) => new Promise((ok, err) => {
      const id = ++seq;
      pending.set(id, { ok, err });
      const st = getSettings();
      ensureWorker().postMessage({ type: 'transcribe', id, pcm, language, prompt: st.transcriptionGlossary?.trim() || undefined, noVad: !!opts?.noVad }, [pcm.buffer]);
    }),
  }));
};

let kicking = false;

/** Procesa la cola si la función está activa y el modelo instalado. Segura de llamar en cualquier momento. */
export async function kickTranscription(opts: { force?: boolean } = {}): Promise<void> {
  const s = getSettings();
  // `force`: acción explícita del usuario (botón «Transcribir» / «Procesar ahora»); no depende del interruptor automático.
  if (kicking || !(s.transcriptionEnabled || opts.force) || !s.whisperInstalled) return;
  kicking = true;
  try {
    if ((await pendingCount()) === 0) return;
    await processQueue({ decode: decodeTo16k, engine, glossary: () => getSettings().transcriptionGlossary ?? '' });
  } finally { kicking = false; scheduleIdle(); }
}

/** Al abrir la app: recupera lo interrumpido y retoma la cola. */
export async function resumeTranscriptionOnStart() {
  await recoverInterrupted();
  void kickTranscription();
}
