import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blobToArray, bytesBlob, freshDb } from './helpers';
import { db } from '../lib/db';
import { createCompany, deleteCompany } from '../lib/repo';
import { exportBackup, parseBackup, restoreBackup } from '../lib/backup';
import { initials, normalizeWeb, parseLogoCandidates, removeCompanyLogo, setCompanyLogo } from '../lib/logo';
import { summaries } from '../ui/Accordion';
import { loadOpen, requestReveal, saveOpen, takeReveal, clearAllOpen } from '../ui/reveal';

const PNG = [137, 80, 78, 71, 1, 2, 3, 4];
const store = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
  get length() { return store.size; }, key: (i: number) => [...store.keys()][i] ?? null, clear: () => store.clear(),
});
beforeEach(() => { freshDb(); store.clear(); });

describe('logo de empresa', () => {
  it('iniciales como marcador de posición', () => {
    expect(initials('Pasta Rossi')).toBe('PR');
    expect(initials('Siculy')).toBe('SI');
    expect(initials('  ')).toBe('?');
  });

  it('se guarda localmente, persiste y reemplazar elimina el archivo anterior', async () => {
    const c = await createCompany({ name: 'Alfa' });
    const id1 = await setCompanyLogo(c.id, bytesBlob(PNG, 'image/png'));
    let cur = (await db.companies.get(c.id))!;
    expect(cur.logoMediaId).toBe(id1);
    expect(await blobToArray((await db.media.get(id1))!.blob)).toEqual(PNG);
    const id2 = await setCompanyLogo(c.id, bytesBlob([9, 9, 9, 9, 9], 'image/png'));
    cur = (await db.companies.get(c.id))!;
    expect(cur.logoMediaId).toBe(id2);
    expect(await db.media.get(id1)).toBeUndefined();
    await removeCompanyLogo(c.id);
    expect((await db.companies.get(c.id))!.logoMediaId).toBeUndefined();
    expect(await db.media.count()).toBe(0);
  });

  it('viaja en la copia ZIP y se restaura idéntico; borrar la empresa lo elimina', async () => {
    const c = await createCompany({ name: 'Alfa' });
    const id = await setCompanyLogo(c.id, bytesBlob(PNG, 'image/png'));
    const { blob } = await exportBackup();
    await db.delete(); await db.open();
    await restoreBackup(await parseBackup(blob), { mode: 'replace' });
    const back = (await db.companies.get(c.id))!;
    expect(back.logoMediaId).toBe(id);
    const m = (await db.media.get(id))!;
    expect(m.category).toBe('logo');
    expect(await blobToArray(m.blob)).toEqual(PNG);
    await deleteCompany(c.id);
    expect(await db.media.count()).toBe(0);
  });

  it('extrae candidatos de la web en orden de preferencia y sin duplicados', () => {
    const html = `<html><head>
      <link rel="icon" href="/fav.png"><link rel="apple-touch-icon" href="/apple.png">
      <meta property="og:image" content="https://cdn.x.com/og.jpg"></head>
      <body><header><img class="site-logo" src="/img/logo.png" alt="x"><img src="/foto.jpg"></header></body></html>`;
    const c = parseLogoCandidates(html, new URL('https://www.ejemplo.it/it/'));
    expect(c.map((x) => x.url)).toEqual(['https://www.ejemplo.it/img/logo.png', 'https://www.ejemplo.it/apple.png', 'https://cdn.x.com/og.jpg', 'https://www.ejemplo.it/fav.png']);
    expect(normalizeWeb('www.ejemplo.it')!.href).toBe('https://www.ejemplo.it/');
    expect(normalizeWeb('')).toBeNull();
  });
});

describe('secciones plegables', () => {
  it('los resúmenes salen de los datos', () => {
    expect(summaries.data({ country: 'Italia', type: 'supplier' }, 'Proveedor')).toBe('Italia · Proveedor');
    expect(summaries.contacts(2)).toBe('2 contactos');
    expect(summaries.contacts(1)).toBe('1 contacto');
    expect(summaries.photos(4)).toBe('4 fotografías');
    expect(summaries.notes(6, 0)).toBe('6 notas');
    expect(summaries.notes(2, 1)).toContain('transcribiendo');
    expect(summaries.visits('SIAL París 2026', 1)).toBe('SIAL París 2026');
  });
  it('plegadas por defecto; el aviso de «recién creado» abre su sección una sola vez', () => {
    expect(loadOpen('c1')).toEqual([]);
    requestReveal('c1', 'contacts', 'k1');
    expect(loadOpen('c1')).toEqual(['contacts']);
    expect(takeReveal('c2')).toBeNull();
    expect(takeReveal('c1')).toEqual({ companyId: 'c1', sec: 'contacts', itemId: 'k1' });
    expect(takeReveal('c1')).toBeNull();
    saveOpen('c1', ['notes', 'photos']);
    clearAllOpen();
    expect(loadOpen('c1')).toEqual([]);
  });
});
