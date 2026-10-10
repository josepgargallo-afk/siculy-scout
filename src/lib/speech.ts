// Dictado con el reconocimiento de voz del navegador. IMPORTANTE: en Chrome/Android el audio se envía a los
// servidores de Google (gratis, pero NO local ni offline). Por eso está desactivado por defecto y requiere
// activarlo expresamente en Ajustes. La alternativa recomendada es el micrófono del teclado del móvil.

type SR = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
};

function ctor(): (new () => SR) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechSupported = () => !!ctor();

export function startDictation(
  lang: string, onText: (finalChunk: string) => void, onEnd: (err?: string) => void,
): { stop(): void } {
  const C = ctor();
  if (!C) { onEnd('Dictado no disponible en este navegador'); return { stop() { /* nada */ } }; }
  const r = new C();
  r.lang = lang; r.interimResults = false; r.continuous = true;
  let err: string | undefined;
  r.onresult = (e) => {
    for (let i = 0; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) onText(res[0].transcript.trim());
    }
  };
  r.onerror = (e) => {
    err = e.error === 'not-allowed' ? 'Permiso de micrófono denegado'
      : e.error === 'network' ? 'Sin conexión: el dictado del navegador necesita Internet'
      : e.error === 'no-speech' ? undefined : `Error de dictado (${e.error})`;
  };
  r.onend = () => onEnd(err);
  try { r.start(); } catch { onEnd('No se pudo iniciar el dictado'); }
  return { stop: () => { try { r.stop(); } catch { /* ya parado */ } } };
}
