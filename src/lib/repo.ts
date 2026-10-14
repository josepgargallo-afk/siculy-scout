import { db } from './db';
import { nowIso, todayYmd, uuid } from './ids';
import {
  DEFAULT_EVENT, type Company, type Contact, type MediaItem, type NoteItem, type Touchpoint,
} from './types';

export type CompanyInput = Partial<Omit<Company, 'id' | 'createdAt' | 'updatedAt'>> & { name: string };

export function cleanName(s: string) { return s.replace(/\s+/g, ' ').trim(); }

export async function createCompany(
  input: CompanyInput,
  origin?: Partial<Omit<Touchpoint, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>> | null,
): Promise<Company> {
  const name = cleanName(input.name || '');
  if (!name) throw new Error('El nombre comercial es obligatorio');
  const t = nowIso();
  const company: Company = {
    categories: [], productsOfInterest: [], type: 'prospect', priority: 'medium',
    ...input, name, id: uuid(), createdAt: t, updatedAt: t,
  };
  const tp: Touchpoint | null = origin === null ? null : {
    originType: DEFAULT_EVENT.originType, eventName: DEFAULT_EVENT.eventName,
    city: DEFAULT_EVENT.city, country: DEFAULT_EVENT.country, date: todayYmd(),
    ...origin, id: uuid(), companyId: company.id, createdAt: t, updatedAt: t,
  };
  await db.transaction('rw', db.companies, db.touchpoints, db.meta, async () => {
    await db.companies.add(company);
    await markChanged();
    if (tp) await db.touchpoints.add(tp);
  });
  return company;
}

export async function updateCompany(id: string, patch: Partial<Omit<Company, 'id' | 'createdAt'>>): Promise<Company> {
  const cur = await db.companies.get(id);
  if (!cur) throw new Error('Empresa no encontrada');
  const next: Company = { ...cur, ...patch, id, createdAt: cur.createdAt, updatedAt: nowIso() };
  next.name = cleanName(next.name);
  if (!next.name) throw new Error('El nombre comercial es obligatorio');
  await db.companies.put(next);
  await markChanged();
  return next;
}

/** Marca la empresa como modificada (al añadir contactos, fotos, etc.) para ordenar por última modificación. */
export async function markChanged() {
  await db.meta.put({ key: "lastChangeAt", value: nowIso() });
}

export async function touchCompany(id: string) {
  await db.companies.update(id, { updatedAt: nowIso() });
  await markChanged();
}

export async function deleteCompany(id: string) {
  await db.transaction('rw', [db.companies, db.contacts, db.touchpoints, db.media, db.notes, db.meta], async () => {
    await markChanged();
    await db.contacts.where('companyId').equals(id).delete();
    await db.touchpoints.where('companyId').equals(id).delete();
    await db.media.where('companyId').equals(id).delete();
    await db.notes.where('companyId').equals(id).delete();
    await db.companies.delete(id);
  });
}

export async function saveContact(
  input: Partial<Contact> & { companyId: string; fullName: string },
): Promise<Contact> {
  const t = nowIso();
  const existing = input.id ? await db.contacts.get(input.id) : undefined;
  const contact: Contact = {
    captureSource: 'manual', capturedAt: t,
    ...existing, ...input, id: existing?.id ?? input.id ?? uuid(),
    createdAt: existing?.createdAt ?? t, updatedAt: t,
  };
  contact.fullName = cleanName(contact.fullName);
  if (!contact.fullName && !contact.email && !contact.phone && !contact.mobile) {
    throw new Error('Indica al menos un nombre, email o teléfono');
  }
  await db.transaction('rw', db.contacts, db.companies, db.meta, async () => {
    await db.contacts.put(contact);
    await touchCompany(contact.companyId);
  });
  return contact;
}

export async function deleteContact(id: string) {
  const c = await db.contacts.get(id);
  if (!c) return;
  await db.transaction('rw', db.contacts, db.media, db.companies, db.meta, async () => {
    if (c.cardPhotoId) await db.media.delete(c.cardPhotoId);
    await db.contacts.delete(id);
    await touchCompany(c.companyId);
  });
}

export async function addMedia(m: Omit<MediaItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<MediaItem> {
  const t = nowIso();
  const item: MediaItem = { ...m, id: m.id ?? uuid(), createdAt: t, updatedAt: t };
  await db.transaction('rw', db.media, db.companies, db.meta, async () => {
    await db.media.add(item);
    await touchCompany(item.companyId);
  });
  return item;
}

export async function updateMedia(id: string, patch: Partial<Pick<MediaItem, 'description' | 'category'>>) {
  await db.media.update(id, { ...patch, updatedAt: nowIso() });
}

export async function deleteMedia(id: string) {
  const m = await db.media.get(id);
  if (!m) return;
  await db.transaction('rw', db.media, db.contacts, db.companies, db.meta, async () => {
    await db.contacts.where('cardPhotoId').equals(id).modify({ cardPhotoId: undefined });
    await db.media.delete(id);
    await touchCompany(m.companyId);
  });
}

export async function saveNote(input: { id?: string; companyId: string; text: string; kind?: NoteItem['kind']; sourceMediaId?: string; comment?: string | null }): Promise<NoteItem> {
  const t = nowIso();
  const existing = input.id ? await db.notes.get(input.id) : undefined;
  const note: NoteItem = {
    id: existing?.id ?? uuid(), companyId: input.companyId, text: input.text,
    kind: input.kind ?? existing?.kind, sourceMediaId: input.sourceMediaId ?? existing?.sourceMediaId,
    comment: input.comment === undefined ? existing?.comment : (input.comment || undefined),
    createdAt: existing?.createdAt ?? t, updatedAt: t,
  };
  await db.transaction('rw', db.notes, db.companies, db.meta, async () => {
    await db.notes.put(note);
    await touchCompany(note.companyId);
  });
  return note;
}

export async function deleteNote(id: string) {
  const n = await db.notes.get(id);
  if (!n) return;
  await db.notes.delete(id);
  await touchCompany(n.companyId);
}

export async function saveTouchpoint(input: Partial<Touchpoint> & { companyId: string }): Promise<Touchpoint> {
  const t = nowIso();
  const existing = input.id ? await db.touchpoints.get(input.id) : undefined;
  const tp: Touchpoint = {
    originType: 'visit', date: todayYmd(),
    ...existing, ...input, id: existing?.id ?? input.id ?? uuid(),
    createdAt: existing?.createdAt ?? t, updatedAt: t,
  };
  await db.transaction('rw', db.touchpoints, db.companies, db.meta, async () => {
    await db.touchpoints.put(tp);
    await touchCompany(tp.companyId);
  });
  return tp;
}

export async function deleteTouchpoint(id: string) {
  const tp = await db.touchpoints.get(id);
  if (!tp) return;
  await db.touchpoints.delete(id);
  await touchCompany(tp.companyId);
}

// ---- meta ----
export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return row ? (row.value as T) : fallback;
}
export async function setMeta(key: string, value: unknown) { await db.meta.put({ key, value }); }

export interface CompanyListRow {
  company: Company;
  contactCount: number;
  events: string[];
  mediaCount: number;
}

export async function listCompanies(): Promise<CompanyListRow[]> {
  const [companies, contacts, tps] = await Promise.all([
    db.companies.toArray(), db.contacts.toArray(), db.touchpoints.toArray(),
  ]);
  // recuento de medios por empresa sin cargar los blobs en la lista
  const mc = new Map<string, number>();
  const keys = await db.media.orderBy('companyId').keys();
  for (const k of keys) mc.set(String(k), (mc.get(String(k)) ?? 0) + 1);
  const cc = new Map<string, number>();
  contacts.forEach((c) => cc.set(c.companyId, (cc.get(c.companyId) ?? 0) + 1));
  const ev = new Map<string, Set<string>>();
  tps.forEach((t) => {
    if (!t.eventName) return;
    let s = ev.get(t.companyId);
    if (!s) { s = new Set(); ev.set(t.companyId, s); }
    s.add(t.eventName);
  });
  return companies
    .map((company) => ({
      company, contactCount: cc.get(company.id) ?? 0,
      events: [...(ev.get(company.id) ?? [])], mediaCount: Math.max(0, (mc.get(company.id) ?? 0) - (company.logoMediaId ? 1 : 0)), // el logo no cuenta como foto
    }))
    .sort((a, b) => b.company.updatedAt.localeCompare(a.company.updatedAt));
}
