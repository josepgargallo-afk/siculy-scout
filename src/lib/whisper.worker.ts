/// <reference lib="webworker" />
// Motor de transcripción local (Whisper vía Transformers.js + ONNX Runtime WASM). Corre en un Web Worker para no
// bloquear la interfaz. Los pesos del modelo se descargan UNA vez de Hugging Face (sólo el modelo, nunca datos del usuario)
// y quedan en la caché del navegador; el runtime WASM se sirve desde esta misma app (/ort/).
import { env, pipeline } from '@huggingface/transformers';
import { WHISPER_LANG_NAME, maxTokensFor } from './audioPrep';

const MODELS: Record<string, string> = { tiny: 'onnx-community/whisper-tiny', base: 'onnx-community/whisper-base' };

type Req =
  | { type: 'load'; model: string; ortBase: string }
  | { type: 'transcribe'; id: number; pcm: Float32Array; language: string };

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
      const seconds = m.pcm.length / 16000;
      const lang = WHISPER_LANG_NAME[m.language];
      if (!lang) throw new Error('Idioma no soportado: ' + m.language); // nunca «auto»: con idioma automático el modelo traduce o entra en bucle
      const out = (await asr(m.pcm, { language: lang, task: 'transcribe', chunk_length_s: 30, max_new_tokens: maxTokensFor(Math.min(seconds, 30)), return_timestamps: false })) as { text: string };
      (self as unknown as Worker).postMessage({ type: 'result', id: m.id, text: out.text, model: 'whisper-' + loaded + '-q8' });
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: 'error', id: (m as { id?: number }).id, message: (err as Error).message ?? String(err) });
  }
};
