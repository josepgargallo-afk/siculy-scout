import { beforeEach, describe, expect, it } from 'vitest';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { blobToArray, bytesBlob, freshDb } from './helpers';
import { db } from '../lib/db';
import { addMedia, createCompany, saveContact, saveNote } from '../lib/repo';
import {
  BackupError, exportAndVerify, exportBackup, getBackupStatus, parseBackup, planRestore, restoreBackup,
} from '../lib/backup';

const PHOTO = [255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 1, 2, 3, 4, 5];
const THUMB = [255, 216, 255, 1, 2];
const AUDIO = [26, 69, 223, 163, 9, 9, 9, 9, 8, 7, 6];

async function seed() {
  const a = await createCompany({ name: 'Surgelati Mare', country: 'Italia', type: 'supplier', categories: ['Pescado'], priority: 'high' });
  const b = await createCompany({ name: 'Solo Nombre' });
  const k = await saveContact({ companyId: a.id, fullName: 'Luca Rossi', email: 'l@mare.it', captureSource: 'ocr' });
  await saveContact({ companyId: a.id, fullName: 'Anna Bianchi' });
  const photo = await addMedia({ companyId: a.id, kind: 'photo', category: 'product', description: 'Gambas 1kg', mime: 'image/jpeg', size: PHOTO.length, blob: bytesBlob(PHOTO, 'image/jpeg'), thumb: bytesBlob(THUMB, 'image/jpeg') });
  const card = await addMedia({ companyId: a.id, contactId: k.id, kind: 'photo', category: 'card', mime: 'image/jpeg', size: 3, blob: bytesBlob([7, 7, 7], 'image/jpeg') });
  await saveContact({ id: k.id, companyId: a.id, fullName: 'Luca Rossi', cardPhotoId: card.id });
  const audio = await addMedia({ companyId: a.id, kind: 'audio', mime: 'audio/webm;codecs=opus', size: AUDIO.length, durationMs: 4200, blob: bytesBlob(AUDIO, 'audio/webm;codecs=opus') });
  await saveNote({ companyId: b.id, text: 'Volver el jueves' });
  return { a, b, k, photo, card, audio };
}

async function zipOf(blob: Blob) { return unzipSync(new Uint8Array(await blob.arrayBuffer())); }
async function rezip(entries: Record<string, Uint8Array>) {
  return new Blob([zipSync(entries) as BlobPart], { type: 'application/zip' });
}

beforeEach(() => { freshDb(); });

describe('exportación', () => {
  it('genera ZIP con manifest, data, CSV, fotos, miniaturas y audios', async () => {
    const s = await seed();
    const res = await exportBackup();
    expect(res.counts).toEqual({ companies: 2, contacts: 2, touchpoints: 2, notes: 1, media: 3 });
    const z = await zipOf(res.blob);
    expect(Object.keys(z)).toEqual(expect.arrayContaining([
      'manifest.json', 'data.json', 'csv/empresas.csv', 'csv/contactos.csv', 'LEEME.txt',
      `files/media/${s.photo.id}.jpg`, `files/thumbs/${s.photo.id}.jpg`, `files/media/${s.audio.id}.webm`,
    ]));
    expect(Array.from(z[`files/media/${s.photo.id}.jpg`])).toEqual(PHOTO);
    expect(Array.from(z['csv/empresas.csv'].slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8 para Excel
    expect(strFromU8(z['csv/empresas.csv'])).toContain('id;nombre_comercial');
    expect(strFromU8(z['csv/contactos.csv'])).toContain('Luca Rossi');
  });

  it('no marca la copia como hecha hasta verificarla; después sí', async () => {
    await seed();
    expect((await getBackupStatus()).unsaved).toBe(true);
    await exportAndVerify();
    const st = await getBackupStatus();
    expect(st.lastBackupAt).toBeTruthy();
    expect(st.unsaved).toBe(false);
    await new Promise((r) => setTimeout(r, 5));
    await createCompany({ name: 'Cambio posterior' });
    expect((await getBackupStatus()).unsaved).toBe(true);
  });
});

describe('importación / restauración', () => {
  it('ida y vuelta: restaurar en una base vacía recupera TODO, incluidas fotos y audios byte a byte', async () => {
    const s = await seed();
    const { blob } = await exportBackup();
    const original = {
      companies: await db.companies.toArray(), contacts: await db.contacts.toArray(),
      touchpoints: await db.touchpoints.toArray(), notes: await db.notes.toArray(),
    };
    freshDb(); // "ordenador nuevo"
    const parsed = await parseBackup(blob);
    const rep = await restoreBackup(parsed, { mode: 'replace' });
    expect(rep.added).toBe(2);
    expect(await db.companies.toArray()).toEqual(expect.arrayContaining(original.companies));
    expect((await db.companies.toArray()).length).toBe(original.companies.length);
    expect((await db.contacts.toArray()).sort((x, y) => x.id.localeCompare(y.id))).toEqual(original.contacts.sort((x, y) => x.id.localeCompare(y.id)));
    expect(await db.touchpoints.count()).toBe(2);
    expect(await db.notes.toArray()).toEqual(original.notes);
    const photo = await db.media.get(s.photo.id);
    expect(await blobToArray(photo!.blob)).toEqual(PHOTO);
    expect(await blobToArray(photo!.thumb!)).toEqual(THUMB);
    expect(photo!.description).toBe('Gambas 1kg');
    expect(photo!.category).toBe('product');
    const audio = await db.media.get(s.audio.id);
    expect(await blobToArray(audio!.blob)).toEqual(AUDIO);
    expect(audio!.durationMs).toBe(4200);
    expect(audio!.mime).toBe('audio/webm;codecs=opus');
    expect((await db.contacts.get(s.k.id))!.cardPhotoId).toBe(s.card.id);
    // IDs estables
    expect((await db.companies.get(s.a.id))!.name).toBe('Surgelati Mare');
  });

  it('fusionar sobre los mismos datos NO duplica nada', async () => {
    await seed();
    const { blob } = await exportBackup();
    const parsed = await parseBackup(blob);
    const plan = await planRestore(parsed, 'merge');
    expect(plan.existingCompanies).toBe(2);
    expect(plan.newCompanies).toBe(0);
    const rep = await restoreBackup(parsed, { mode: 'merge' });
    expect(rep).toMatchObject({ added: 0, updated: 0, skipped: 2 });
    expect(await db.companies.count()).toBe(2);
    expect(await db.contacts.count()).toBe(2);
    expect(await db.media.count()).toBe(3);
    expect(await db.notes.count()).toBe(1);
  });

  it('fusionar añade lo que falta y no pisa los cambios locales más recientes', async () => {
    const s = await seed();
    const { blob } = await exportBackup();
    await new Promise((r) => setTimeout(r, 5));
    const { updateCompany } = await import('../lib/repo');
    await updateCompany(s.a.id, { notes: 'edición local posterior' });
    await db.companies.delete(s.b.id); // falta en local
    const parsed = await parseBackup(blob);
    const rep = await restoreBackup(parsed, { mode: 'merge', overwriteNewer: true });
    expect(rep.added).toBe(1);
    expect((await db.companies.get(s.a.id))!.notes).toBe('edición local posterior');
    expect(await db.companies.get(s.b.id)).toBeTruthy();
  });

  it('rechaza ZIP al que le falta un archivo y NO toca la base de datos actual', async () => {
    const s = await seed();
    const { blob } = await exportBackup();
    const z = await zipOf(blob);
    delete z[`files/media/${s.photo.id}.jpg`];
    const broken = await rezip(z);
    freshDb();
    await createCompany({ name: 'Datos existentes' });
    await expect(parseBackup(broken)).rejects.toSatisfy((e: BackupError) =>
      e instanceof BackupError && e.problems.some((p) => p.includes('Falta el archivo')));
    expect(await db.companies.count()).toBe(1);
    expect((await db.companies.toArray())[0].name).toBe('Datos existentes');
  });

  it('detecta archivo corrupto (huella distinta) y data.json alterado', async () => {
    const s = await seed();
    const { blob } = await exportBackup();
    const z = await zipOf(blob);
    const bad = { ...z, [`files/media/${s.audio.id}.webm`]: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) };
    await expect(parseBackup(await rezip(bad))).rejects.toThrow(/incompleta|dañada/);
    const tampered = { ...z, 'data.json': strToU8(strFromU8(z['data.json']).replace('Surgelati Mare', 'Hackeado')) };
    await expect(parseBackup(await rezip(tampered))).rejects.toSatisfy((e: BackupError) => e.problems.some((p) => p.includes('data.json')));
  });

  it('rechaza archivos que no son ZIP, ZIP ajenos y versiones futuras', async () => {
    await expect(parseBackup(new Blob(['hola mundo']))).rejects.toThrow(/ZIP/);
    await expect(parseBackup(await rezip({ 'a.txt': strToU8('x') }))).rejects.toThrow(/Siculy Scout/);
    await seed();
    const { blob } = await exportBackup();
    const z = await zipOf(blob);
    const mf = JSON.parse(strFromU8(z['manifest.json']));
    mf.schemaVersion = 99;
    await expect(parseBackup(await rezip({ ...z, 'manifest.json': strToU8(JSON.stringify(mf)) }))).rejects.toThrow(/más nueva/);
  });

  it('valida referencias rotas y datos malformados dentro de data.json', async () => {
    await seed();
    const { blob } = await exportBackup();
    const z = await zipOf(blob);
    const data = JSON.parse(strFromU8(z['data.json']));
    data.contacts.push({ id: 'zz', companyId: 'no-existe', fullName: 'Fantasma' });
    data.companies.push({ id: 'q', name: 42 });
    const dj = JSON.stringify(data);
    const mf = JSON.parse(strFromU8(z['manifest.json']));
    // recalcular huella para simular una copia generada por una versión con bug (no manipulación)
    const d = await crypto.subtle.digest('SHA-256', strToU8(dj) as BufferSource);
    mf.dataSha256 = [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
    const bad = await rezip({ ...z, 'data.json': strToU8(dj), 'manifest.json': strToU8(JSON.stringify(mf)) });
    await expect(parseBackup(bad)).rejects.toSatisfy((e: BackupError) =>
      e.problems.some((p) => p.includes('empresa inexistente')) && e.problems.some((p) => p.includes('sin nombre')));
  });

  it('un fallo en mitad de la restauración revierte: la base de datos queda intacta', async () => {
    await seed();
    const { blob } = await exportBackup();
    const parsed = await parseBackup(blob);
    freshDb();
    const keep = await createCompany({ name: 'No debo perderme' });
    await saveContact({ companyId: keep.id, fullName: 'Contacto Seguro' });
    await expect(restoreBackup(parsed, {
      mode: 'replace',
      beforeWrite: () => { throw new Error('corte simulado tras borrar'); },
    })).rejects.toThrow('corte simulado');
    expect(await db.companies.count()).toBe(1);
    expect((await db.companies.get(keep.id))!.name).toBe('No debo perderme');
    expect(await db.contacts.count()).toBe(1);
  });

  it('reemplazar sustituye el contenido actual por el de la copia', async () => {
    await seed();
    const { blob } = await exportBackup();
    const parsed = await parseBackup(blob);
    await createCompany({ name: 'Extra posterior' });
    await restoreBackup(parsed, { mode: 'replace' });
    expect(await db.companies.count()).toBe(2);
    expect(await db.companies.where('name').equals('Extra posterior').count()).toBe(0);
  });

  it('copia de base vacía es válida', async () => {
    const { blob } = await exportBackup();
    const parsed = await parseBackup(blob);
    expect(parsed.manifest.counts.companies).toBe(0);
  });
});
