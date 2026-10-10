export class RecorderError extends Error {}

export function describeMediaError(e: unknown, what: 'micrófono' | 'cámara'): string {
  const name = (e as { name?: string })?.name;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return `Permiso de ${what} denegado. Actívalo en Ajustes de Chrome > Configuración del sitio, o en Ajustes de Android > Apps > Chrome > Permisos.`;
    case 'NotFoundError':
    case 'OverconstrainedError':
      return `No se encontró ${what === 'cámara' ? 'ninguna cámara' : 'ningún micrófono'} en el dispositivo.`;
    case 'NotReadableError':
    case 'AbortError':
      return `El ${what} está siendo usado por otra aplicación. Ciérrala e inténtalo de nuevo.`;
    default:
      return `No se pudo acceder al ${what}: ${(e as Error)?.message ?? 'error desconocido'}`;
  }
}

export interface Recording { blob: Blob; mime: string; durationMs: number }

export interface ActiveRecorder {
  stop(): Promise<Recording>;
  cancel(): void;
}

function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return undefined;
}

export function recordingSupported() {
  return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/** Graba audio con el micrófono. Funciona sin conexión. */
export async function startRecording(): Promise<ActiveRecorder> {
  if (!recordingSupported()) throw new RecorderError('Este navegador no permite grabar audio.');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    throw new RecorderError(describeMediaError(e, 'micrófono'));
  }
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  const t0 = Date.now();
  rec.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
  rec.start(1000);
  const release = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stop: () => new Promise<Recording>((resolve, reject) => {
      rec.onerror = () => { release(); reject(new RecorderError('Error durante la grabación')); };
      rec.onstop = () => {
        release();
        const type = rec.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunks, { type });
        if (!blob.size) reject(new RecorderError('La grabación está vacía'));
        else resolve({ blob, mime: type, durationMs: Date.now() - t0 });
      };
      if (rec.state !== 'inactive') rec.stop(); else rec.onstop?.(new Event('stop'));
    }),
    cancel: () => { rec.onstop = null; try { if (rec.state !== 'inactive') rec.stop(); } catch { /* ya parado */ } release(); },
  };
}
