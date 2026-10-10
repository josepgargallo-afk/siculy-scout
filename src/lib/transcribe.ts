// Cola de transcripción de audios (local, gratuita, sin red una vez descargado el modelo).
// El audio original NUNCA se toca: la transcripción es un dato adicional en media.transcript y una nota editable.
import { db } from './db';
import { nowIso } from './ids';
import { collapseRepeats, hasSpeech } from './audioPrep';
import { saveNote } from './repo';
import type { Transcript } from './types';

export interface Engine {
  /** `pcm` en 16 kHz mono. Debe rechazar con Error si falla. */
  transcribe(pcm: Float32Array, language: string, onProgress?: (p: number) => void): Promise<{ text: string; model: string }>;
}

export interface QueueHooks {
  decode: (blob: Blob) => Promise<Float32Array>;
  engine: () => Promise<Engine>;
  onChange?: () => void;
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
export async function enqueueTranscription(mediaId: string, language: string): Promise<void> {
  const m = await db.media.get(mediaId);
  if (!m || m.kind !== 'audio') return;
  await setTranscript(mediaId, { status: 'pending', language, error: undefined });
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
        if (!hasSpeech(pcm)) throw new Error('No se detectó voz en el audio.');
        const eng = await h.engine();
        const res = await eng.transcribe(pcm, lang);
        const { text, trimmed } = collapseRepeats(res.text.trim());
        if (!text) throw new Error('El reconocimiento no devolvió texto.');
        await finish(next.id, text, lang, res.model, trimmed);
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
async function finish(mediaId: string, text: string, language: string, model: string, trimmed: boolean) {
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
  await setTranscript(mediaId, { status: 'done', text, language, model, noteId, error: trimmed ? 'Se recortó una repetición del motor.' : undefined });
}

/** Permite al usuario cambiar el texto de la nota: es la copia editable; `transcript.text` conserva lo literal. */
export async function editedByUser(noteId: string, text: string) {
  const n = await db.notes.get(noteId);
  if (n) await saveNote({ id: n.id, companyId: n.companyId, text, kind: n.kind, sourceMediaId: n.sourceMediaId });
}
