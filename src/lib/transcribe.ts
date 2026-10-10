// Cola de transcripción de audios (local, gratuita, sin red una vez descargado el modelo).
// El audio original NUNCA se toca: la transcripción es un dato adicional en media.transcript y una nota editable.
import { db } from './db';
import { nowIso } from './ids';
import { assessTranscript, collapseRepeats, hasSpeech } from './audioPrep';
import { saveNote } from './repo';
import type { Transcript } from './types';

export interface EngineResult {
  text: string;
  model: string;
  /** segundos de voz realmente enviados al modelo */
  speechSeconds?: number;
  trimmed?: boolean;
  /** descripción de la configuración usada (haces, vocabulario…) */
  config?: string;
  /** idioma realmente usado y su probabilidad (cuando se pidió «auto») */
  language?: string;
  langProb?: number;
}

export interface Engine {
  /** `pcm` en 16 kHz mono. Debe rechazar con Error si falla. */
  transcribe(pcm: Float32Array, language: string, opts?: { noVad?: boolean }): Promise<EngineResult>;
}

export interface QueueHooks {
  decode: (blob: Blob) => Promise<Float32Array>;
  engine: () => Promise<Engine>;
  onChange?: () => void;
  /** vocabulario propio usado como prompt (para avisar si sus términos aparecen en el texto) */
  glossary?: () => string;
}

const MAX_AUDIO_S = 15 * 60;

async function setTranscript(id: string, patch: Partial<Transcript>) {
  await db.transaction('rw', db.media, async () => {
    const m = await db.media.get(id);
    if (!m) return;
    const cur: Transcript = m.transcript ?? { status: 'pending', updatedAt: nowIso() };
    await db.media.update(id, { transcript: { ...cur, ...patch, updatedAt: nowIso() } });
  });
}

/** Pone un audio en la cola (o lo reencola). No duplica nada: reutiliza la nota ya creada si existe. */
export async function enqueueTranscription(mediaId: string, language: string, opts: { noVad?: boolean } = {}): Promise<void> {
  const m = await db.media.get(mediaId);
  if (!m || m.kind !== 'audio') return;
  await setTranscript(mediaId, { status: 'pending', language, error: undefined, noVad: opts.noVad ? true : undefined });
}

/** Al abrir la app: lo que quedó «procesando» por un cierre vuelve a la cola. */
export async function recoverInterrupted(): Promise<number> {
  const stuck = await db.media.where('transcript.status').equals('processing').toArray();
  for (const m of stuck) await setTranscript(m.id, { status: 'pending' });
  return stuck.length;
}

export async function pendingCount(): Promise<number> {
  return db.media.where('transcript.status').equals('pending').count();
}

let running = false;

/** Procesa los audios pendientes de uno en uno. Es seguro llamarla varias veces: sólo corre una instancia. */
export async function processQueue(h: QueueHooks): Promise<{ done: number; failed: number }> {
  if (running) return { done: 0, failed: 0 };
  running = true;
  let done = 0; let failed = 0;
  try {
    for (;;) {
      const next = (await db.media.where('transcript.status').equals('pending').toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (!next) break;
      const lang = next.transcript?.language ?? 'es';
      await setTranscript(next.id, { status: 'processing', attempts: (next.transcript?.attempts ?? 0) + 1, error: undefined });
      h.onChange?.();
      try {
        const pcm = await h.decode(next.blob);
        if (pcm.length / 16000 > MAX_AUDIO_S) throw new Error('Audio demasiado largo (máx. 15 min). Se conserva el audio.');
        const noVad = !!next.transcript?.noVad;
        if (!noVad && !hasSpeech(pcm)) throw new Error('No se detectó voz en el audio.');
        const eng = await h.engine();
        const res = await eng.transcribe(pcm, lang, { noVad });
        const c = collapseRepeats(res.text.trim());
        const text = c.text;
        if (!text) throw new Error(res.speechSeconds === 0 ? 'No se detectó voz en el audio.' : 'El reconocimiento no devolvió texto.');
        const usedLang = res.language ?? (lang === 'auto' ? 'es' : lang);
        const q = assessTranscript(text, { language: usedLang, speechSeconds: res.speechSeconds ?? pcm.length / 16000, trimmed: c.trimmed || res.trimmed, glossary: h.glossary?.() });
        if (lang === 'auto' && res.langProb !== undefined && res.langProb < 0.6) q.warnings.unshift('Idioma detectado con poca seguridad: revisa que el texto esté en el idioma correcto.');
        await finish(next.id, text, usedLang, res, q, lang === 'auto');
        done++;
      } catch (e) {
        failed++;
        await setTranscript(next.id, { status: 'error', error: (e as Error).message || 'Error de transcripción' });
      }
      h.onChange?.();
    }
  } finally { running = false; }
  return { done, failed };
}

/** Guarda el resultado y crea/actualiza UNA nota vinculada al audio (nunca duplica; no pisa ediciones del usuario). */
async function finish(mediaId: string, text: string, language: string, res: EngineResult, q: { warnings: string[]; suspicious: boolean }, auto = false) {
  const m = await db.media.get(mediaId);
  if (!m) return;
  const prev = m.transcript;
  let noteId = prev?.noteId;
  const byMedia = await db.notes.where('sourceMediaId').equals(mediaId).first();
  const existing = (noteId ? await db.notes.get(noteId) : undefined) ?? byMedia;
  if (existing) {
    noteId = existing.id;
    // Si el usuario ya editó la nota, no se sobrescribe: el texto nuevo queda sólo en la transcripción original.
    if (!prev?.text || existing.text === prev.text) await saveNote({ id: existing.id, companyId: m.companyId, text, kind: 'transcript', sourceMediaId: mediaId });
  } else {
    noteId = (await saveNote({ companyId: m.companyId, text, kind: 'transcript', sourceMediaId: mediaId })).id;
  }
  await setTranscript(mediaId, {
    status: 'done', text, language, detected: auto ? language : undefined, model: res.model, noteId, error: undefined,
    warnings: q.warnings, suspicious: q.suspicious, speechSeconds: res.speechSeconds, config: res.config,
  });
}

/** Permite al usuario cambiar el texto de la nota: es la copia editable; `transcript.text` conserva lo literal. */
export async function editedByUser(noteId: string, text: string) {
  const n = await db.notes.get(noteId);
  if (n) await saveNote({ id: n.id, companyId: n.companyId, text, kind: n.kind, sourceMediaId: n.sourceMediaId });
}

/** Texto literal original del reconocimiento (para «restaurar» si el usuario editó la nota). */
export async function originalTranscript(mediaId: string): Promise<string | undefined> {
  return (await db.media.get(mediaId))?.transcript?.text;
}

/** Recrea la nota de un audio cuya nota se borró, a partir de la transcripción literal conservada. */
export async function restoreNoteFromTranscript(mediaId: string): Promise<void> {
  const m = await db.media.get(mediaId);
  const text = m?.transcript?.text;
  if (!m || !text) return;
  const note = await saveNote({ companyId: m.companyId, text, kind: 'transcript', sourceMediaId: mediaId });
  await setTranscript(mediaId, { noteId: note.id });
}

/** Elimina SÓLO la nota (el audio y su transcripción literal se conservan). */
export async function deleteNoteKeepAudio(noteId: string): Promise<void> {
  const n = await db.notes.get(noteId);
  if (!n) return;
  await db.notes.delete(noteId);
  if (n.sourceMediaId) {
    const m = await db.media.get(n.sourceMediaId);
    if (m?.transcript?.noteId === noteId) await setTranscript(n.sourceMediaId, { noteId: undefined });
  }
}
