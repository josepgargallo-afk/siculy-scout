import type { MediaItem, NoteItem } from './types';

export type TimelineItem =
  | { at: string; node: 'note'; note: NoteItem; media?: MediaItem } // nota escrita, o transcripción (nota + audio = UNA sola entrada)
  | { at: string; node: 'job'; media: MediaItem }; // audio en cola o transcribiéndose (aún sin nota)

/**
 * Unifica notas y audios en una sola línea de tiempo (más reciente primero):
 *  · una transcripción y su audio son UNA entrada (no se duplica);
 *  · los audios en cola/procesando salen arriba como tarjeta de estado;
 *  · los audios sin transcribir (o con error, o cuya nota se borró) van al grupo plegado `loose`.
 */
export function buildTimeline(notes: NoteItem[], audios: MediaItem[]): { items: TimelineItem[]; loose: MediaItem[] } {
  const byMedia = new Map(audios.map((a) => [a.id, a]));
  const covered = new Set<string>();
  const items: TimelineItem[] = [];
  for (const n of notes) {
    const m = n.sourceMediaId ? byMedia.get(n.sourceMediaId) : undefined;
    if (m) covered.add(m.id);
    items.push({ at: m?.createdAt ?? n.createdAt, node: 'note', note: n, media: m });
  }
  const loose: MediaItem[] = [];
  for (const a of audios) {
    if (a.kind !== 'audio' || covered.has(a.id)) continue;
    const st = a.transcript?.status;
    if (st === 'pending' || st === 'processing') items.push({ at: a.createdAt, node: 'job', media: a });
    else loose.push(a);
  }
  items.sort((x, y) => y.at.localeCompare(x.at));
  loose.sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  return { items, loose };
}
