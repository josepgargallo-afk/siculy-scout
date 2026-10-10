import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import { ScoutDB, useDb, db } from '../lib/db';
import {
  addMedia, createCompany, deleteCompany, deleteContact, deleteMedia, listCompanies, saveContact, saveNote, saveTouchpoint, updateCompany,
} from '../lib/repo';
import { findCompanyDuplicates, findContactDuplicates, normalizeName } from '../lib/duplicates';
import { getBackupStatus } from '../lib/backup';
import { bytesBlob } from './helpers';

beforeEach(() => { freshDb(); });

describe('empresas', () => {
  it('crea una ficha con SOLO el nombre y aplica valores por defecto (SIAL París 2026)', async () => {
    const c = await createCompany({ name: '  Frozen   Italia  ' });
    expect(c.name).toBe('Frozen Italia');
    expect(c.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(c.type).toBe('prospect');
    expect(c.priority).toBe('medium');
    expect(c.createdAt).toBe(c.updatedAt);
    const tps = await db.touchpoints.where('companyId').equals(c.id).toArray();
    expect(tps).toHaveLength(1);
    expect(tps[0].eventName).toBe('SIAL París 2026');
    expect(tps[0].originType).toBe('fair');
  });

  it('rechaza nombre vacío', async () => {
    await expect(createCompany({ name: '   ' })).rejects.toThrow(/obligatorio/);
    expect(await db.companies.count()).toBe(0);
  });

  it('edita preservando id y fecha de creación y actualiza la modificación', async () => {
    const c = await createCompany({ name: 'Pasta Bella' });
    await new Promise((r) => setTimeout(r, 5));
    const u = await updateCompany(c.id, { country: 'Italia', priority: 'high', type: 'supplier', categories: ['Pasta'], id: 'otro' } as never);
    expect(u.id).toBe(c.id);
    expect(u.createdAt).toBe(c.createdAt);
    expect(u.updatedAt > c.updatedAt).toBe(true);
    expect(u.country).toBe('Italia');
    expect((await db.companies.get(c.id))!.categories).toEqual(['Pasta']);
  });

  it('no permite dejar el nombre vacío al editar', async () => {
    const c = await createCompany({ name: 'X Foods' });
    await expect(updateCompany(c.id, { name: ' ' })).rejects.toThrow();
    expect((await db.companies.get(c.id))!.name).toBe('X Foods');
  });

  it('permite registrar más visitas sin duplicar la empresa', async () => {
    const c = await createCompany({ name: 'Gelati Roma' });
    await saveTouchpoint({ companyId: c.id, originType: 'visit', eventName: 'Visita planta', date: '2026-11-02' });
    expect(await db.companies.count()).toBe(1);
    expect(await db.touchpoints.where('companyId').equals(c.id).count()).toBe(2);
  });
});

describe('contactos', () => {
  it('asocia múltiples contactos a una empresa y los lista', async () => {
    const c = await createCompany({ name: 'Mare Surgelati' });
    await saveContact({ companyId: c.id, fullName: 'Luca Rossi', email: 'luca@mare.it' });
    await saveContact({ companyId: c.id, fullName: 'Anna Bianchi', mobile: '+39 333 1234567' });
    await saveContact({ companyId: c.id, fullName: 'Paul Martin', role: 'Export Manager' });
    const list = await db.contacts.where('companyId').equals(c.id).toArray();
    expect(list.map((x) => x.fullName).sort()).toEqual(['Anna Bianchi', 'Luca Rossi', 'Paul Martin']);
    const rows = await listCompanies();
    expect(rows[0].contactCount).toBe(3);
  });

  it('un contacto con sólo email es válido; uno vacío no', async () => {
    const c = await createCompany({ name: 'A' });
    await expect(saveContact({ companyId: c.id, fullName: '', email: 'a@b.it' })).resolves.toBeTruthy();
    await expect(saveContact({ companyId: c.id, fullName: ' ' })).rejects.toThrow();
  });

  it('editar un contacto conserva id y fecha de captura', async () => {
    const c = await createCompany({ name: 'A' });
    const k = await saveContact({ companyId: c.id, fullName: 'Juan Perez' });
    const k2 = await saveContact({ id: k.id, companyId: c.id, fullName: 'Juan Pérez', role: 'CEO' });
    expect(k2.id).toBe(k.id);
    expect(k2.capturedAt).toBe(k.capturedAt);
    expect(await db.contacts.count()).toBe(1);
  });

  it('eliminar empresa elimina contactos, notas, medios y visitas (y sólo los suyos)', async () => {
    const a = await createCompany({ name: 'A Foods' });
    const b = await createCompany({ name: 'B Foods' });
    for (const x of [a, b]) {
      await saveContact({ companyId: x.id, fullName: 'Persona ' + x.name });
      await saveNote({ companyId: x.id, text: 'nota' });
      await addMedia({ companyId: x.id, kind: 'photo', mime: 'image/jpeg', size: 3, blob: bytesBlob([1, 2, 3], 'image/jpeg') });
    }
    await deleteCompany(a.id);
    expect(await db.companies.count()).toBe(1);
    expect(await db.contacts.count()).toBe(1);
    expect(await db.notes.count()).toBe(1);
    expect(await db.media.count()).toBe(1);
    expect(await db.touchpoints.count()).toBe(1);
  });

  it('borrar un contacto borra su foto de tarjeta; borrar la foto desvincula al contacto', async () => {
    const c = await createCompany({ name: 'A' });
    const card = await addMedia({ companyId: c.id, kind: 'photo', category: 'card', mime: 'image/jpeg', size: 1, blob: bytesBlob([9], 'image/jpeg') });
    const k = await saveContact({ companyId: c.id, fullName: 'Ana Ruiz', cardPhotoId: card.id });
    await deleteMedia(card.id);
    expect((await db.contacts.get(k.id))!.cardPhotoId).toBeUndefined();
    const card2 = await addMedia({ companyId: c.id, kind: 'photo', category: 'card', mime: 'image/jpeg', size: 1, blob: bytesBlob([9], 'image/jpeg') });
    const k2 = await saveContact({ companyId: c.id, fullName: 'Eva Ruiz', cardPhotoId: card2.id });
    await deleteContact(k2.id);
    expect(await db.media.get(card2.id)).toBeUndefined();
  });
});

describe('persistencia local y recuperación', () => {
  it('los datos sobreviven a cerrar y reabrir la base de datos (cierre/reapertura de la app)', async () => {
    const name = 'persist-' + Math.random();
    const d1 = new ScoutDB(name); useDb(d1);
    const c = await createCompany({ name: 'Persistente SRL', country: 'Italia' });
    await saveContact({ companyId: c.id, fullName: 'Marco Verdi' });
    const m = await addMedia({ companyId: c.id, kind: 'audio', mime: 'audio/webm', size: 4, durationMs: 1200, blob: bytesBlob([1, 2, 3, 4], 'audio/webm') });
    d1.close();
    const d2 = new ScoutDB(name); useDb(d2);
    expect((await d2.companies.get(c.id))!.country).toBe('Italia');
    expect(await d2.contacts.count()).toBe(1);
    const got = await d2.media.get(m.id);
    expect(got!.durationMs).toBe(1200);
    expect(new Uint8Array(await got!.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('una transacción fallida no deja datos a medias', async () => {
    const c = await createCompany({ name: 'Base' });
    await expect(db.transaction('rw', db.companies, db.contacts, async () => {
      await db.contacts.add({ id: 'k1', companyId: c.id, fullName: 'Temporal', captureSource: 'manual', capturedAt: '', createdAt: '', updatedAt: '' });
      throw new Error('fallo simulado');
    })).rejects.toThrow('fallo simulado');
    expect(await db.contacts.count()).toBe(0);
  });

  it('avisa de datos sin copia de seguridad y deja de avisar tras la copia', async () => {
    expect((await getBackupStatus()).shouldWarn).toBe(false); // sin datos
    await createCompany({ name: 'Nuevo' });
    const s = await getBackupStatus();
    expect(s.unsaved).toBe(true);
    expect(s.shouldWarn).toBe(true);
    await db.meta.put({ key: 'lastBackupAt', value: new Date(Date.now() + 1000).toISOString() });
    expect((await getBackupStatus()).unsaved).toBe(false);
  });
});

describe('duplicados', () => {
  const mk = async (...names: string[]) => { for (const n of names) await createCompany({ name: n }); return db.companies.toArray(); };

  it('normaliza formas jurídicas, acentos y signos', () => {
    expect(normalizeName('Gelateria  Rómà S.r.l.')).toBe('gelateria roma');
    expect(normalizeName('Pasta & Co. S.p.A.')).toBe('pasta and');
  });

  it('detecta mismo nombre y nombres similares; no marca empresas distintas', async () => {
    const all = await mk('Surgelati Mare S.r.l.', 'Panificio Rossi', 'Dolce Vita Foods');
    expect(findCompanyDuplicates('surgelati mare', all)[0].reason).toBe('same-name');
    expect(findCompanyDuplicates('Surgelatti Mare', all)[0].reason).toBe('similar-name');
    expect(findCompanyDuplicates('Frutta Fresca', all)).toHaveLength(0);
    expect(findCompanyDuplicates('Rossi', all)).toHaveLength(0); // demasiado corto/genérico
  });

  it('detecta mismo dominio web', async () => {
    const c = await createCompany({ name: 'Alfa', web: 'https://www.alfafood.it/contacto' });
    const all = await db.companies.toArray();
    const m = findCompanyDuplicates('Alfa Group Italia Distribuzione', all, { web: 'alfafood.it' });
    expect(m[0].company.id).toBe(c.id);
    expect(m[0].reason).toBe('same-domain');
  });

  it('excluye la propia ficha al editar', async () => {
    const all = await mk('Beta Foods');
    expect(findCompanyDuplicates('Beta Foods', all, { excludeId: all[0].id })).toHaveLength(0);
  });

  it('duplicados de contacto por email, teléfono o nombre', async () => {
    const c = await createCompany({ name: 'A' });
    await saveContact({ companyId: c.id, fullName: 'Luca Rossi', email: 'Luca@x.it', phone: '+39 02 1234 5678' });
    const list = await db.contacts.toArray();
    expect(findContactDuplicates({ email: 'luca@x.it' }, list)[0].reason).toBe('same-email');
    expect(findContactDuplicates({ phone: '0039 02 12345678'.replace('0039', '+39') }, list)[0].reason).toBe('same-phone');
    expect(findContactDuplicates({ fullName: 'luca rossi' }, list)[0].reason).toBe('same-name');
    expect(findContactDuplicates({ fullName: 'Marta Gil', email: 'm@x.it' }, list)).toHaveLength(0);
  });
});
