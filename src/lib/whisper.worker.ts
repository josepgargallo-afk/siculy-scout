/// <reference lib="webworker" />
// Motor de transcripción local (Whisper vía Transformers.js + ONNX Runtime WASM). Corre en un Web Worker para no
// bloquear la interfaz. Los pesos del modelo se descargan UNA vez de Hugging Face (sólo el modelo, nunca datos del usuario)
// y quedan en la caché del navegador; el runtime WASM se sirve desde esta misma app (/ort/).
import { env, pipeline } from '@huggingface/transformers';
import { decodeAudio } from './whisperCore';

const MODELS: Record<string, string> = { tiny: 'onnx-community/whisper-tiny', base: 'onnx-community/whisper-base', small: 'onnx-community/whisper-small' };

type Req =
  | { type: 'load'; model: string; ortBase: string }
  | { type: 'transcribe'; id: number; pcm: Float32Array; language: string; prompt?: string; noVad?: boolean };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let asr: any = null;
let loaded = '';

function configure(ortBase: string) {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  const wasm = env.backends.onnx.wasm!;
  wasm.wasmPaths = { mjs: ortBase + 'ort-wasm-simd-threaded.mjs', wasm: ortBase + 'ort-wasm-simd-threaded.wasm' };
  // Sin cabeceras COOP/COEP (GitHub Pages) no hay hilos WASM: un solo hilo.
  wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
}

self.onmessage = async (e: MessageEvent<Req>) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      configure(m.ortBase);
      const bytes: Record<string, { loaded: number; total: number }> = {};
      asr = await pipeline('automatic-speech-recognition', MODELS[m.model], {
        dtype: 'q8', device: 'wasm',
        progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
          if (p.status === 'progress' && p.file) {
            bytes[p.file] = { loaded: p.loaded ?? 0, total: p.total ?? 0 };
            const t = Object.values(bytes).reduce((a, b) => a + b.total, 0);
            const l = Object.values(bytes).reduce((a, b) => a + b.loaded, 0);
            (self as unknown as Worker).postMessage({ type: 'progress', loaded: l, total: t });
          }
        },
      });
      loaded = m.model;
      (self as unknown as Worker).postMessage({ type: 'loaded', model: m.model });
    } else {
      if (!asr) throw new Error('El modelo no está cargado');
      // Segmentación por voz + normalización + vocabulario opcional (ver whisperCore.ts). Nunca idioma automático ni «translate».
      const r = await decodeAudio(asr, m.pcm, {
        language: m.language, prompt: m.prompt, numBeams: 1, normalize: true, vad: !m.noVad,
        onSegment: (done, total) => (self as unknown as Worker).postMessage({ type: 'segment', id: m.id, done, total }),
      });
      (self as unknown as Worker).postMessage({
        type: 'result', id: m.id, text: r.text, language: r.language, langProb: r.langProb, model: 'whisper-' + loaded + '-q8', speechSeconds: r.speechSeconds, trimmed: r.trimmed,
        config: `${loaded}-q8 · voraz · ${m.noVad ? 'sin vad' : 'vad'}+norm${m.prompt ? ' · vocabulario' : ''}`,
      });
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: 'error', id: (m as { id?: number }).id, message: (err as Error).message ?? String(err) });
  }
};
