import { describe, expect, it } from 'vitest';
import { buildTimeline } from '../lib/timeline';
import type { MediaItem, NoteItem, Transcript } from '../lib/types';

const t = (min: number) => new Date(Date.UTC(2026, 9, 10, 12, 0) - min * 60000).toISOString();
const note = (id: string, min: number, extra: Partial<NoteItem> = {}): NoteItem => ({ id, companyId: 'c', text: id, createdAt: t(min), updatedAt: t(min), ...extra });
const audio = (id: string, min: number, tr?: Partial<Transcript>): MediaItem => ({
  id, companyId: 'c', kind: 'audio', mime: 'audio/webm', size: 1, blob: new Blob(['x']), createdAt: t(min), updatedAt: t(min),
  ...(tr ? { transcript: { status: 'done', updatedAt: t(min), ...tr } as Transcript } : {}),
});

describe('línea de tiempo «Notas y audios»', () => {
  it('ordena de más reciente a más antigua mezclando notas escritas y transcripciones', () => {
    const { items } = buildTimeline(
      [note('escrita-vieja', 300), note('trans', 60, { kind: 'transcript', sourceMediaId: 'a1' }), note('escrita-nueva', 5)],
      [audio('a1', 60, { status: 'done', noteId: 'trans' })],
    );
    expect(items.map((i) => (i.node === 'note' ? i.note.id : i.media.id))).toEqual(['escrita-nueva', 'trans', 'escrita-vieja']);
  });

  it('un audio transcrito y su nota son UNA sola entrada (sin duplicados) y la fecha es la de la grabación', () => {
    const { items, loose } = buildTimeline([note('n', 1, { kind: 'transcript', sourceMediaId: 'a1' })], [audio('a1', 90, { status: 'done', noteId: 'n' })]);
    expect(items).toHaveLength(1);
    expect(loose).toHaveLength(0);
    expect(items[0]).toMatchObject({ node: 'note', at: t(90) });
    expect((items[0] as { media?: MediaItem }).media!.id).toBe('a1');
  });

  it('audios en cola o transcribiendo aparecen como tarjeta de estado en su sitio cronológico', () => {
    const { items } = buildTimeline([note('vieja', 100)], [audio('p', 2, { status: 'pending' }), audio('q', 1, { status: 'processing' })]);
    expect(items.map((i) => i.node)).toEqual(['job', 'job', 'note']);
    expect(items[0].node === 'job' && items[0].media.id).toBe('q');
  });

  it('audios sin transcribir, con error o con la nota borrada van al grupo plegado, sin duplicarse', () => {
    const { items, loose } = buildTimeline([], [
      audio('sin', 50), audio('err', 40, { status: 'error', error: 'x' }), audio('huerfano', 30, { status: 'done', text: 'texto', noteId: 'borrada' }),
    ]);
    expect(items).toHaveLength(0);
    expect(loose.map((a) => a.id)).toEqual(['huerfano', 'err', 'sin']);
  });

  it('una nota cuyo audio ya no existe se muestra como nota normal', () => {
    const { items } = buildTimeline([note('n', 5, { kind: 'transcript', sourceMediaId: 'borrado' })], []);
    expect(items).toHaveLength(1);
    expect((items[0] as { media?: MediaItem }).media).toBeUndefined();
  });

  it('ignora elementos que no son audio (fotos)', () => {
    const photo = { ...audio('f', 5), kind: 'photo' as const };
    expect(buildTimeline([], [photo])).toEqual({ items: [], loose: [] });
  });

  it('con muchos elementos el rendimiento es lineal-logarítmico (200 notas + 200 audios)', () => {
    const notes = Array.from({ length: 200 }, (_, i) => note('n' + i, i));
    const audios = Array.from({ length: 200 }, (_, i) => audio('a' + i, i + 0.5));
    const t0 = performance.now();
    const r = buildTimeline(notes, audios);
    expect(r.items.length + r.loose.length).toBe(400);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});
