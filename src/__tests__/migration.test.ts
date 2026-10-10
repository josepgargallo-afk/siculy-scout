import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { strToU8, zipSync } from 'fflate';
import { ScoutDB, useDb } from '../lib/db';
import { exportBackup, parseBackup, restoreBackup } from '../lib/backup';
import { addMedia, createCompany, saveNote } from '../lib/repo';
import { bytesBlob, blobToArray, freshDb } from './helpers';
import { SCHEMA_VERSION } from '../lib/types';

// Todos los datos son ficticios. OldDB reproduce EXACTAMENTE el esquema v1 que usan las instalaciones reales.
class OldDB extends Dexie {
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      companies: 'id, name, type, country, priority, updatedAt, createdAt',
      contacts: 'id, companyId, email, cardPhotoId, updatedAt',
      touchpoints: 'id, companyId, eventName, date, updatedAt',
      media: 'id, companyId, contactId, kind, updatedAt',
      notes: 'id, companyId, updatedAt',
      meta: 'key',
    });
  }
}

const T = '2026-10-10T10:00:00.000Z';
const PHOTO = [255, 216, 255, 224, 1, 2, 3, 4, 5, 6];
const AUDIO = [26, 69, 223, 163, 9, 8, 7, 6, 5];

async function seedV1(name: string) {
  const old = new OldDB(name);
  await old.table('companies').bulkAdd([
    { id: 'c-1', name: 'Alfa Foods', legalName: 'Alfa Foods S.r.l.', type: 'supplier', country: 'Italia', city: 'Palermo', address: 'Via Roma 1', web: 'www.alfa.it', categories: ['Pasta'], productsOfInterest: [], priority: 'high', createdAt: T, updatedAt: T },
    { id: 'c-2', name: 'Solo Nombre', type: 'prospect', categories: [], productsOfInterest: [], priority: 'medium', createdAt: T, updatedAt: T },
  ]);
  await old.table('contacts').add({ id: 'k-1', companyId: 'c-1', fullName: 'Ana Prueba', email: 'ana@alfa.it', cardPhotoId: 'm-1', captureSource: 'ocr', capturedAt: T, createdAt: T, updatedAt: T });
  await old.table('touchpoints').add({ id: 't-1', companyId: 'c-1', originType: 'fair', eventName: 'SIAL París 2026', date: '2026-10-10', createdAt: T, updatedAt: T });
  await old.table('notes').add({ id: 'n-1', companyId: 'c-1', text: 'nota antigua', createdAt: T, updatedAt: T });
  await old.table('media').bulkAdd([
    { id: 'm-1', companyId: 'c-1', contactId: 'k-1', kind: 'photo', category: 'card', mime: 'image/jpeg', size: PHOTO.length, blob: bytesBlob(PHOTO, 'image/jpeg'), thumb: bytesBlob([1, 2], 'image/jpeg'), createdAt: T, updatedAt: T },
    { id: 'm-2', companyId: 'c-1', kind: 'audio', mime: 'audio/webm', size: AUDIO.length, durationMs: 3000, blob: bytesBlob(AUDIO, 'audio/webm'), createdAt: T, updatedAt: T },
  ]);
  await old.table('meta').put({ key: 'lastBackupAt', value: T });
  old.close();
}

describe('migración Dexie v1 → v2 (datos ficticios con el esquema anterior)', () => {
  it('conserva TODOS los datos, ids y blobs; los campos nuevos quedan vacíos', async () => {
    const name = 'mig-' + Math.random();
    await seedV1(name);
    const db = new ScoutDB(name); useDb(db);
    await db.open();
    expect(db.verno).toBe(2);
    expect(await db.companies.count()).toBe(2);
    const c = await db.companies.get('c-1');
    expect(c).toMatchObject({ name: 'Alfa Foods', legalName: 'Alfa Foods S.r.l.', country: 'Italia', city: 'Palermo', address: 'Via Roma 1', web: 'www.alfa.it' });
    expect(c!.email).toBeUndefined();
    expect(c!.operationalAddress).toBeUndefined();
    expect((await db.contacts.get('k-1'))!.cardPhotoId).toBe('m-1');
    expect((await db.notes.get('n-1'))!.text).toBe('nota antigua');
    expect(await db.touchpoints.count()).toBe(1);
    expect((await db.meta.get('lastBackupAt'))!.value).toBe(T);
    expect(await blobToArray((await db.media.get('m-1'))!.blob)).toEqual(PHOTO);
    const audio = await db.media.get('m-2');
    expect(await blobToArray(audio!.blob)).toEqual(AUDIO);
    expect(audio!.durationMs).toBe(3000);
    expect(audio!.transcript).toBeUndefined();
  });

  it('los índices nuevos funcionan sobre datos migrados (cola de transcripción)', async () => {
    const name = 'mig-' + Math.random();
    await seedV1(name);
    const db = new ScoutDB(name); useDb(db);
    await db.open();
    expect(await db.media.where('transcript.status').equals('pending').count()).toBe(0);
    await db.media.update('m-2', { transcript: { status: 'pending', updatedAt: T } });
    expect((await db.media.where('transcript.status').equals('pending').toArray()).map((m) => m.id)).toEqual(['m-2']);
    await db.notes.add({ id: 'n-2', companyId: 'c-1', text: 'x', sourceMediaId: 'm-2', kind: 'transcript', createdAt: T, updatedAt: T });
    expect((await db.notes.where('sourceMediaId').equals('m-2').toArray())).toHaveLength(1);
  });

  it('una instalación v1 que se abre y se cierra varias veces no pierde nada', async () => {
    const name = 'mig-' + Math.random();
    await seedV1(name);
    for (let i = 0; i < 3; i++) {
      const db = new ScoutDB(name); await db.open();
      expect(await db.companies.count()).toBe(2); expect(await db.media.count()).toBe(2);
      db.close();
    }
  });
});

describe('compatibilidad de copias ZIP: v1 → app v2, y v2 → v2', () => {
  async function sha(u8: Uint8Array) {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', u8 as BufferSource))].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  /** Construye a mano una copia con el formato EXACTO que producía la versión anterior (schemaVersion 1). */
  async function v1Zip() {
    const data = {
      companies: [{ id: 'c-1', name: 'Alfa Foods', type: 'supplier', country: 'Italia', categories: ['Pasta'], productsOfInterest: [], priority: 'high', createdAt: T, updatedAt: T }],
      contacts: [{ id: 'k-1', companyId: 'c-1', fullName: 'Ana Prueba', captureSource: 'qr', capturedAt: T, createdAt: T, updatedAt: T }],
      touchpoints: [{ id: 't-1', companyId: 'c-1', originType: 'fair', eventName: 'SIAL', date: '2026-10-10', createdAt: T, updatedAt: T }],
      notes: [{ id: 'n-1', companyId: 'c-1', text: 'hola', createdAt: T, updatedAt: T }],
      media: [{ id: 'm-2', companyId: 'c-1', kind: 'audio', mime: 'audio/webm', size: AUDIO.length, durationMs: 3000, file: 'files/media/m-2.webm', createdAt: T, updatedAt: T }],
    };
    const dataBytes = strToU8(JSON.stringify(data));
    const audio = new Uint8Array(AUDIO);
    const manifest = {
      format: 'siculy-scout-backup', schemaVersion: 1, appVersion: '0.1.1', exportedAt: T,
      counts: { companies: 1, contacts: 1, touchpoints: 1, notes: 1, media: 1 }, dataSha256: await sha(dataBytes),
      files: [{ path: 'files/media/m-2.webm', size: audio.length, sha256: await sha(audio) }],
    };
    return new Blob([zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), 'data.json': dataBytes, 'files/media/m-2.webm': audio }) as BlobPart]);
  }

  it('una copia v1 se verifica y se restaura íntegra', async () => {
    const db = freshDb();
    const parsed = await parseBackup(await v1Zip());
    expect(parsed.manifest.schemaVersion).toBe(1);
    await restoreBackup(parsed, { mode: 'replace' });
    expect((await db.companies.get('c-1'))!.name).toBe('Alfa Foods');
    expect(await blobToArray((await db.media.get('m-2'))!.blob)).toEqual(AUDIO);
    expect((await db.notes.get('n-1'))!.text).toBe('hola');
  });

  it('una copia v1 puede fusionarse en una base v2 con datos nuevos sin duplicar ni pisar', async () => {
    const db = freshDb();
    await createCompany({ name: 'Empresa nueva v2', email: 'info@nueva.it' });
    await restoreBackup(await parseBackup(await v1Zip()), { mode: 'merge' });
    expect(await db.companies.count()).toBe(2);
    expect((await db.companies.where('name').equals('Empresa nueva v2').first())!.email).toBe('info@nueva.it');
  });

  it('una copia v2 conserva datos corporativos, transcripciones y notas vinculadas', async () => {
    const db = freshDb();
    const c = await createCompany({ name: 'Beta', legalName: 'Beta S.r.l.', email: 'info@beta.it', phone: '+39 02 1111 2222', operationalAddress: 'Zona Industriale 7' });
    const a = await addMedia({ companyId: c.id, kind: 'audio', mime: 'audio/webm', size: 3, durationMs: 1000, blob: bytesBlob([1, 2, 3], 'audio/webm') });
    const n = await saveNote({ companyId: c.id, text: 'texto transcrito', kind: 'transcript', sourceMediaId: a.id });
    await db.media.update(a.id, { transcript: { status: 'done', text: 'texto transcrito', language: 'es', model: 'whisper-test', noteId: n.id, updatedAt: T } });
    const m2 = await addMedia({ companyId: c.id, kind: 'audio', mime: 'audio/webm', size: 3, blob: bytesBlob([4, 5, 6], 'audio/webm') });
    await db.media.update(m2.id, { transcript: { status: 'processing', updatedAt: T } });

    const { blob } = await exportBackup();
    const fresh = freshDb();
    await restoreBackup(await parseBackup(blob), { mode: 'replace' });
    const c2 = await fresh.companies.get(c.id);
    expect(c2).toMatchObject({ email: 'info@beta.it', phone: '+39 02 1111 2222', operationalAddress: 'Zona Industriale 7', legalName: 'Beta S.r.l.' });
    const a2 = await fresh.media.get(a.id);
    expect(a2!.transcript).toMatchObject({ status: 'done', text: 'texto transcrito', noteId: n.id, language: 'es' });
    expect(await fresh.notes.get(n.id)).toMatchObject({ kind: 'transcript', sourceMediaId: a.id });
    // un «processing» interrumpido vuelve a la cola, no se queda colgado
    expect((await fresh.media.get(m2.id))!.transcript!.status).toBe('pending');
    expect(SCHEMA_VERSION).toBe(3);
  });

  /** Copia con el formato EXACTO de la v0.2.0 (schemaVersion 2): transcripción sin avisos y nota sin comentario. */
  async function v2Zip() {
    const data = {
      companies: [{ id: 'c-1', name: 'Alfa Foods', legalName: 'Alfa Foods S.r.l.', email: 'info@alfa.it', type: 'supplier', categories: [], productsOfInterest: [], priority: 'high', createdAt: T, updatedAt: T }],
      contacts: [], touchpoints: [],
      notes: [{ id: 'n-1', companyId: 'c-1', text: 'texto transcrito', kind: 'transcript', sourceMediaId: 'm-2', createdAt: T, updatedAt: T }],
      media: [{ id: 'm-2', companyId: 'c-1', kind: 'audio', mime: 'audio/webm', size: AUDIO.length, durationMs: 3000, file: 'files/media/m-2.webm', transcript: { status: 'done', text: 'texto transcrito', language: 'es', model: 'whisper-base-q8', noteId: 'n-1', updatedAt: T }, createdAt: T, updatedAt: T }],
    };
    const dataBytes = strToU8(JSON.stringify(data));
    const audio = new Uint8Array(AUDIO);
    const manifest = {
      format: 'siculy-scout-backup', schemaVersion: 2, appVersion: '0.2.0', exportedAt: T,
      counts: { companies: 1, contacts: 0, touchpoints: 0, notes: 1, media: 1 }, dataSha256: await sha(dataBytes),
      files: [{ path: 'files/media/m-2.webm', size: audio.length, sha256: await sha(audio) }],
    };
    return new Blob([zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), 'data.json': dataBytes, 'files/media/m-2.webm': audio }) as BlobPart]);
  }

  it('una copia v2 (v0.2.0) se restaura en la app v3 conservando nota, transcripción y audio; los campos nuevos quedan vacíos', async () => {
    const db = freshDb();
    await restoreBackup(await parseBackup(await v2Zip()), { mode: 'replace' });
    const n = (await db.notes.get('n-1'))!;
    expect(n).toMatchObject({ text: 'texto transcrito', kind: 'transcript', sourceMediaId: 'm-2' });
    expect(n.comment).toBeUndefined();
    const m = (await db.media.get('m-2'))!;
    expect(m.transcript).toMatchObject({ status: 'done', text: 'texto transcrito', noteId: 'n-1' });
    expect(m.transcript!.warnings).toBeUndefined();
    expect(await blobToArray(m.blob)).toEqual(AUDIO);
    expect((await db.companies.get('c-1'))!.email).toBe('info@alfa.it');
  });

  it('v3: comentario, avisos y configuración de la transcripción viajan en la copia', async () => {
    const db = freshDb();
    const c = await createCompany({ name: 'Beta' });
    const a = await addMedia({ companyId: c.id, kind: 'audio', mime: 'audio/webm', size: 3, durationMs: 1000, blob: bytesBlob([1, 2, 3], 'audio/webm') });
    const n = await saveNote({ companyId: c.id, text: 'Pedido de 20 cajas', kind: 'transcript', sourceMediaId: a.id, comment: 'Pedir precio EXW' });
    await db.media.update(a.id, { transcript: { status: 'done', text: 'Pedido de 20 cajas', noteId: n.id, warnings: ['Contiene cifras'], suspicious: false, speechSeconds: 4.2, config: 'base-q8 vad', updatedAt: T } });
    const { blob } = await exportBackup();
    const fresh = freshDb();
    await restoreBackup(await parseBackup(blob), { mode: 'replace' });
    expect((await fresh.notes.get(n.id))!.comment).toBe('Pedir precio EXW');
    expect((await fresh.media.get(a.id))!.transcript).toMatchObject({ warnings: ['Contiene cifras'], suspicious: false, speechSeconds: 4.2, config: 'base-q8 vad' });
  });
});
