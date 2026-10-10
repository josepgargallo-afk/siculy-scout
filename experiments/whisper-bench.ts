// Experimento aislado (NO forma parte de la app): mide Whisper local con Transformers.js en el navegador.
import { pipeline, env } from '@huggingface/transformers';

env.backends.onnx.wasm!.numThreads = 1; // GitHub Pages no permite COOP/COEP: sin hilos WASM

export async function decode16k(buf: ArrayBuffer): Promise<Float32Array> {
  const ac = new AudioContext();
  const a = await ac.decodeAudioData(buf.slice(0));
  const off = new OfflineAudioContext(1, Math.ceil(a.duration * 16000), 16000);
  const src = off.createBufferSource(); src.buffer = a; src.connect(off.destination); src.start();
  const r = await off.startRendering();
  await ac.close();
  return r.getChannelData(0);
}

/** Pasa un WAV por MediaRecorder (webm/opus) como haría la app al grabar, y lo devuelve como Blob. */
export async function viaMediaRecorder(wav: ArrayBuffer): Promise<{ blob: Blob; mime: string }> {
  const ac = new AudioContext();
  const a = await ac.decodeAudioData(wav.slice(0));
  const dest = ac.createMediaStreamDestination();
  const src = ac.createBufferSource(); src.buffer = a; src.connect(dest);
  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/mp4';
  const rec = new MediaRecorder(dest.stream, { mimeType: mime });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise<void>((r) => { rec.onstop = () => r(); });
  rec.start(500); src.start(); src.onended = () => setTimeout(() => rec.stop(), 300);
  await done; await ac.close();
  return { blob: new Blob(chunks, { type: mime }), mime };
}

export async function load(model: string, dtype: string | Record<string, string>, device: 'wasm' | 'webgpu' = 'wasm') {
  const bytes: Record<string, number> = {};
  const t0 = performance.now();
  const asr = await pipeline('automatic-speech-recognition', model, {
    dtype: dtype as never, device,
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === 'progress' && p.file) bytes[p.file] = p.total ?? 0;
    },
  });
  const mb = Object.values(bytes).reduce((a, b) => a + b, 0) / 1048576;
  return { asr, loadMs: Math.round(performance.now() - t0), downloadedMB: Math.round(mb * 10) / 10, files: Object.fromEntries(Object.entries(bytes).map(([k, v]) => [k.split('/').pop(), Math.round(v / 1048576 * 10) / 10])) };
}

export async function transcribe(asr: any, audio: Float32Array, language?: string) {
  const t = performance.now();
  const out = await asr(audio, { language, task: 'transcribe', chunk_length_s: 30, return_timestamps: false });
  const ms = performance.now() - t;
  return { text: (out as { text: string }).text.trim(), ms: Math.round(ms), audioS: Math.round((audio.length / 16000) * 10) / 10, rtf: Math.round((ms / 1000 / (audio.length / 16000)) * 100) / 100 };
}
