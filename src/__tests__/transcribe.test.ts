import { beforeEach, describe, expect, it } from 'vitest';
import { blobToArray, bytesBlob, freshDb } from './helpers';
import { db } from '../lib/db';
import { addMedia, createCompany } from '../lib/repo';
import { collapseRepeats, hasSpeech, maxTokensFor } from '../lib/audioPrep';
import { editedByUser, enqueueTranscription, pendingCount, processQueue, recoverInterrupted, type Engine, type QueueHooks } from '../lib/transcribe';

const AUDIO = [26, 69, 223, 163, 1, 2, 3];
const tone = (seconds: number, amp = 0.3) => Float32Array.from({ length: Math.round(16000 * seconds) }, (_, i) => amp * Math.sin((i / 16000) * 2 * Math.PI * 220) * (0.6 + 0.4 * Math.sin(i / 900)));
const silence = (s: number) => new Float32Array(Math.round(16000 * s));

function hooks(texts: (string | Error)[], pcm: () => Float32Array = () => tone(2)) {
  const calls: string[] = [];
  const engine: Engine = {
    async transcribe(_pcm, language) {
      const t = texts.shift();
      calls.push(language);
      if (t instanceof Error) throw t;
      return { text: t ?? '', model: 'whisper-test' };
    },
  };
  const h: QueueHooks = { decode: async () => pcm(), engine: async () => engine };
  return { h, calls };
}

async function audio(companyId: string) {
  return addMedia({ companyId, kind: 'audio', mime: 'audio/webm', size: AUDIO.length, durationMs: 2000, blob: bytesBlob(AUDIO, 'audio/webm') });
}

let cid = '';
beforeEach(async () => { freshDb(); cid = (await createCompany({ name: 'Alfa' })).id; });

describe('detección de voz y saneado del texto', () => {
  it('detecta voz y rechaza silencio o ruido de fondo mínimo (Whisper inventa frases con silencio)', () => {
    expect(hasSpeech(tone(2))).toBe(true);
    expect(hasSpeech(silence(3))).toBe(false);
    expect(hasSpeech(tone(3, 0.002))).toBe(false);
    expect(hasSpeech(tone(0.1))).toBe(false);
  });
  it('recorta bucles de repetición del motor y avisa', () => {
    const loop = 'hemos hablado ' + 'poder hacer '.repeat(30);
    const r = collapseRepeats(loop);
    expect(r.trimmed).toBe(true);
    expect(r.text.split(' ').length).toBeLessThan(20);
    expect(collapseRepeats('veinte cajas de gambas, veinte cajas de pasta')).toEqual({ text: 'veinte cajas de gambas, veinte cajas de pasta', trimmed: false });
  });
  it('no altera texto normal ni cifras', () => {
    const t = 'Pedido de 20 cajas, entrega el 15 de noviembre, precio 12,50 euros el kilo.';
    expect(collapseRepeats(t).text).toBe(t);
  });
  it('tope de tokens proporcional a la duración', () => {
    expect(maxTokensFor(5)).toBe(60);
    expect(maxTokensFor(600)).toBe(448);
  });
});

describe('cola de transcripciones', () => {
  it('pendiente → procesando → completado: crea UNA nota vinculada y conserva el audio intacto', async () => {
    const a = await audio(cid);
    await enqueueTranscription(a.id, 'es');
    expect(await pendingCount()).toBe(1);
    const { h, calls } = hooks(['hemos hablado con el director']);
    const r = await processQueue(h);
    expect(r).toEqual({ done: 1, failed: 0 });
    expect(calls).toEqual(['es']);
    const m = (await db.media.get(a.id))!;
    expect(m.transcript).toMatchObject({ status: 'done', text: 'hemos hablado con el director', model: 'whisper-test', language: 'es' });
    expect(await blobToArray(m.blob)).toEqual(AUDIO);
    const notes = await db.notes.where('companyId').equals(cid).toArray();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ kind: 'transcript', sourceMediaId: a.id, text: 'hemos hablado con el director', id: m.transcript!.noteId });
    expect(await pendingCount()).toBe(0);
  });

  it('el fallo conserva el audio, deja estado «error» y el reintento NO duplica notas', async () => {
    const a = await audio(cid);
    await enqueueTranscription(a.id, 'it');
    const f = hooks([new Error('sin memoria')]);
    expect(await processQueue(f.h)).toEqual({ done: 0, failed: 1 });
    let m = (await db.media.get(a.id))!;
    expect(m.transcript).toMatchObject({ status: 'error', error: 'sin memoria', attempts: 1 });
    expect(await blobToArray(m.blob)).toEqual(AUDIO);
    expect(await db.notes.count()).toBe(0);
    await enqueueTranscription(a.id, 'it');
    expect(await processQueue(hooks(['abbiamo parlato con il direttore']).h)).toEqual({ done: 1, failed: 0 });
    await enqueueTranscription(a.id, 'it'); // reintentar de nuevo aunque ya esté hecho
    await processQueue(hooks(['abbiamo parlato con il direttore commerciale']).h);
    m = (await db.media.get(a.id))!;
    expect(await db.notes.count()).toBe(1);
    expect((await db.notes.toArray())[0].text).toBe('abbiamo parlato con il direttore commerciale'); // no editada → se actualiza
    expect(m.transcript!.attempts).toBe(3);
  });

  it('si el usuario editó la nota, un reintento NO la pisa; la transcripción literal queda en el audio', async () => {
    const a = await audio(cid);
    await enqueueTranscription(a.id, 'es');
    await processQueue(hooks(['veinte cajas de gambas']).h);
    const noteId = (await db.media.get(a.id))!.transcript!.noteId!;
    await editedByUser(noteId, 'Veinte cajas de gambas (confirmar precio)');
    await enqueueTranscription(a.id, 'es');
    await processQueue(hooks(['veinte cajas de gamba']).h);
    expect((await db.notes.get(noteId))!.text).toBe('Veinte cajas de gambas (confirmar precio)');
    expect((await db.media.get(a.id))!.transcript!.text).toBe('veinte cajas de gamba');
    expect(await db.notes.count()).toBe(1);
  });

  it('silencio → error claro, sin llamar al motor ni crear nota', async () => {
    const a = await audio(cid);
    await enqueueTranscription(a.id, 'es');
    const { h, calls } = hooks(['no debería usarse'], () => silence(3));
    await processQueue(h);
    expect(calls).toHaveLength(0);
    expect((await db.media.get(a.id))!.transcript).toMatchObject({ status: 'error', error: 'No se detectó voz en el audio.' });
    expect(await db.notes.count()).toBe(0);
  });

  it('texto vacío del motor → error (no se crea una nota vacía)', async () => {
    const a = await audio(cid);
    await enqueueTranscription(a.id, 'es');
    await processQueue(hooks(['   ']).h);
    expect((await db.media.get(a.id))!.transcript!.status).toBe('error');
    expect(await db.notes.count()).toBe(0);
  });

  it('procesa por orden de grabación y un fallo no bloquea los siguientes', async () => {
    const a1 = await audio(cid); await new Promise((r) => setTimeout(r, 5));
    const a2 = await audio(cid); await new Promise((r) => setTimeout(r, 5));
    const a3 = await audio(cid);
    for (const a of [a3, a1, a2]) await enqueueTranscription(a.id, 'es');
    const r = await processQueue(hooks(['uno', new Error('falla el segundo'), 'tres']).h);
    expect(r).toEqual({ done: 2, failed: 1 });
    expect((await db.media.get(a1.id))!.transcript!.text).toBe('uno');
    expect((await db.media.get(a2.id))!.transcript!.status).toBe('error');
    expect((await db.media.get(a3.id))!.transcript!.text).toBe('tres');
  });

  it('un cierre a mitad («processing») vuelve a la cola al reabrir', async () => {
    const a = await audio(cid);
    await db.media.update(a.id, { transcript: { status: 'processing', language: 'es', updatedAt: 'x' } });
    expect(await recoverInterrupted()).toBe(1);
    expect((await db.media.get(a.id))!.transcript!.status).toBe('pending');
  });

  it('sólo corre una cola a la vez', async () => {
    const a = await audio(cid);
    await enqueueTranscription(a.id, 'es');
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const slow: QueueHooks = { decode: async () => tone(2), engine: async () => ({ transcribe: async () => { await gate; return { text: 'hola', model: 'm' }; } }) };
    const p1 = processQueue(slow);
    await new Promise((r) => setTimeout(r, 20));
    expect(await processQueue(slow)).toEqual({ done: 0, failed: 0 });
    release();
    expect(await p1).toEqual({ done: 1, failed: 0 });
  });

  it('audio sin pendientes no hace nada; borrar la empresa elimina audio y notas', async () => {
    expect(await processQueue(hooks([]).h)).toEqual({ done: 0, failed: 0 });
  });
});
