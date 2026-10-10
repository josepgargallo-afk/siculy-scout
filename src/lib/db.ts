import Dexie, { type Table } from 'dexie';
import type { Company, Contact, MediaItem, MetaRow, NoteItem, Touchpoint } from './types';

export class ScoutDB extends Dexie {
  companies!: Table<Company, string>;
  contacts!: Table<Contact, string>;
  touchpoints!: Table<Touchpoint, string>;
  media!: Table<MediaItem, string>;
  notes!: Table<NoteItem, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'siculy-scout') {
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

export let db = new ScoutDB();
/** Sólo para pruebas: sustituye la instancia activa. */
export function useDb(instance: ScoutDB) { db = instance; }
