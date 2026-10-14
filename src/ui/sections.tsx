import { useEffect, useRef, useState } from 'react';
import { Camera, ExternalLink, Image as ImageIcon, Mail, Pencil, Phone, Plus, Smartphone, Trash2 } from 'lucide-react';
import { db } from '../lib/db';
import { optimizeImage } from '../lib/image';
import { addMedia, deleteMedia, deleteTouchpoint, saveTouchpoint, updateMedia } from '../lib/repo';
import { describeSaveError, formatBytes } from '../lib/storage';
import {
  CATEGORY_LABEL, ORIGIN_LABEL, type MediaItem, type OriginType, type PhotoCategory, type Touchpoint,
} from '../lib/types';
import { Field, Modal, fmtDate, useUi } from './kit';
import { navigate } from './router';
import { useLive, useObjectUrl } from './hooks';

type Ui = ReturnType<typeof useUi>;

/** Optimiza y guarda varias fotos. Si una falla (formato no compatible, sin espacio), el resto continúa. */
export async function addPhotoFiles(companyId: string, files: FileList | File[], category: PhotoCategory, ui: Ui): Promise<string | undefined> {
  let ok = 0; let last: string | undefined;
  for (const f of Array.from(files)) {
    try {
      const o = await optimizeImage(f, 'photo');
      last = (await addMedia({ companyId, kind: 'photo', category, mime: 'image/jpeg', size: o.blob.size, blob: o.blob, thumb: o.thumb })).id;
      ok++;
    } catch (e) {
      const msg = (e as Error).message;
      ui.toast(/compatible/.test(msg) ? `${f.name || 'Imagen'}: ${msg}` : describeSaveError(e), 'err');
    }
  }
  if (ok) ui.toast(ok === 1 ? 'Foto guardada' : `${ok} fotos guardadas`);
  return last;
}

/** Desplaza hasta un elemento recién creado y lo resalta un instante. Devuelve true si lo encontró. */
export function flashElement(elId: string): boolean {
  const el = document.getElementById(elId);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash'); window.setTimeout(() => el.classList.remove('flash'), 1800);
  return true;
}

export interface RevealProp { itemId?: string; n: number }

// ---------- Contactos ----------
export function ContactsSection({ companyId, reveal }: { companyId: string; reveal?: RevealProp }) {
  const [contacts] = useLive(() => db.contacts.where('companyId').equals(companyId).sortBy('createdAt'), [companyId], []);
  const done = useRef(0);
  useEffect(() => {
    if (!reveal || reveal.n === done.current || !contacts.length) return;
    const target = reveal.itemId && contacts.some((c) => c.id === reveal.itemId) ? reveal.itemId : reveal.itemId ? undefined : contacts[contacts.length - 1].id;
    if (target && flashElement('ct-' + target)) done.current = reveal.n;
  }, [reveal, contacts]);
  return (
    <div>
      {contacts.length === 0 && <div className="small" style={{ marginBottom: 8 }}>Sin contactos todavía.</div>}
      {contacts.map((c) => (
        <div key={c.id} id={'ct-' + c.id} className="item" style={{ cursor: 'pointer' }} onClick={() => navigate(`/c/${companyId}/contact/${c.id}`)}>
          <div className="t">{c.fullName || c.email || c.mobile || c.phone}</div>
          <div className="m">
            {c.role && <span>{c.role}</span>}
            {c.captureSource !== 'manual' && <span className="chip">{c.captureSource === 'ocr' ? 'Tarjeta' : 'QR'}</span>}
          </div>
          <div className="contact-acts" onClick={(e) => e.stopPropagation()}>
            {c.mobile && <a className="btn sm" href={'tel:' + c.mobile.replace(/[^\d+]/g, '')}><Smartphone /><span>{c.mobile}</span></a>}
            {c.phone && <a className="btn sm" href={'tel:' + c.phone.replace(/[^\d+]/g, '')}><Phone /><span>{c.phone}</span></a>}
            {c.email && <a className="btn sm" href={'mailto:' + c.email}><Mail /><span>{c.email}</span></a>}
          </div>
        </div>
      ))}
      <div className="row">
        <button className="btn grow" onClick={() => navigate(`/c/${companyId}/contact/new`)}><Plus />Añadir contacto</button>
      </div>
    </div>
  );
}

// ---------- Fotos ----------
export function PhotosSection({ companyId, reveal }: { companyId: string; reveal?: RevealProp }) {
  const ui = useUi();
  const [items] = useLive(async () => (await db.media.where('companyId').equals(companyId).filter((m) => m.kind === 'photo' && m.category !== 'logo').toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [companyId], [] as MediaItem[]);
  const [added, setAdded] = useState<{ id?: string; n: number }>({ n: 0 });
  const done = useRef(0);
  const want = reveal && reveal.n >= added.n ? { id: reveal.itemId, n: reveal.n } : added;
  useEffect(() => {
    if (!want.n || want.n === done.current || !items.length) return;
    const id = want.id && items.some((m) => m.id === want.id) ? want.id : want.id ? undefined : items[0].id;
    if (id && flashElement('ph-' + id)) done.current = want.n;
  }, [want.n, want.id, items]);
  const [open, setOpen] = useState<string | null>(null);
  const [cat, setCat] = useState<PhotoCategory>('product');
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const current = items.find((m) => m.id === open);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length) { const id = await addPhotoFiles(companyId, files, cat, ui); if (id) setAdded((a) => ({ id, n: Math.max(a.n, reveal?.n ?? 0) + 1 })); }
  };

  return (
    <div>
      <div className="stack" style={{ gap: 8, marginBottom: 12 }}>
        <Field label="Categoría de las próximas fotos">
          <select value={cat} onChange={(e) => setCat(e.target.value as PhotoCategory)}>
            {(Object.keys(CATEGORY_LABEL) as PhotoCategory[]).filter((c) => c !== 'card' && c !== 'logo').map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </Field>
        <div className="grid2">
          <button className="btn primary" onClick={() => camRef.current?.click()}><Camera />Cámara</button>
          <button className="btn" onClick={() => galRef.current?.click()}><ImageIcon />Galería</button>
        </div>
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={pick} />
      {items.length === 0 ? <div className="small">Aún no hay fotos.</div> : (
        <div className="photos">
          {items.map((m) => <Thumb key={m.id} m={m} onOpen={() => setOpen(m.id)} />)}
        </div>
      )}
      {current && <PhotoViewer m={current} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Thumb({ m, onOpen }: { m: MediaItem; onOpen: () => void }) {
  const url = useObjectUrl(m.thumb ?? m.blob);
  return (
    <button className="ph" id={'ph-' + m.id} onClick={onOpen} aria-label={m.description || CATEGORY_LABEL[m.category ?? 'other']}>
      {url && <img src={url} alt="" loading="lazy" />}
      <span className="tag">{CATEGORY_LABEL[m.category ?? 'other']}</span>
    </button>
  );
}

function PhotoViewer({ m, onClose }: { m: MediaItem; onClose: () => void }) {
  const ui = useUi();
  const url = useObjectUrl(m.blob);
  const [desc, setDesc] = useState(m.description ?? '');
  const remove = async () => {
    if (await ui.confirm({ title: '¿Eliminar esta foto?', message: 'No se puede deshacer.', confirmLabel: 'Eliminar', danger: true }) === true) {
      await deleteMedia(m.id); onClose();
    }
  };
  return (
    <Modal title="Fotografía" onClose={onClose}>
      <div className="viewer">
        <div className="imgwrap">{url ? <img src={url} alt={desc || 'Fotografía'} /> : <div className="small" style={{ color: '#fff', padding: 20 }}>No se puede mostrar esta imagen</div>}</div>
        <div className="small">{fmtDate(m.createdAt)} · {formatBytes(m.size)}</div>
        <Field label="Categoría">
          <select defaultValue={m.category ?? 'other'} onChange={(e) => void updateMedia(m.id, { category: e.target.value as PhotoCategory })}>
            {(Object.keys(CATEGORY_LABEL) as PhotoCategory[]).filter((c) => c !== 'logo').map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </Field>
        <Field label="Descripción (opcional)">
          <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => void updateMedia(m.id, { description: desc.trim() || undefined })} placeholder="Ej.: Gambas 1 kg, caja 10 kg" />
        </Field>
        <div className="row">
          {url && <a className="btn grow" href={url} target="_blank" rel="noopener"><ExternalLink />Pantalla completa</a>}
          <button className="btn danger-ghost" onClick={() => void remove()}><Trash2 />Eliminar</button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Origen y visitas ----------
export function VisitsSection({ companyId }: { companyId: string }) {
  const ui = useUi();
  const [tps] = useLive(async () => (await db.touchpoints.where('companyId').equals(companyId).toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [companyId], [] as Touchpoint[]);
  const [edit, setEdit] = useState<Partial<Touchpoint> | null>(null);

  return (
    <div>
      {tps.map((t, i) => (
        <div key={t.id} className="note">
          <div className="row nowrap"><b className="grow">{i === 0 ? 'Origen: ' : ''}{ORIGIN_LABEL[t.originType]}{t.eventName ? ' · ' + t.eventName : ''}</b>
            <button className="btn sm" onClick={() => setEdit(t)}><Pencil />Editar</button></div>
          <div className="small">{[t.date, t.city, t.country, t.stand && 'Stand ' + t.stand].filter(Boolean).join(' · ')}</div>
          {t.remarks && <div>{t.remarks}</div>}
        </div>
      ))}
      <button className="btn block" style={{ marginTop: 8 }} onClick={() => setEdit({ originType: 'visit' })}><Plus />Registrar nueva visita / contacto</button>
      {edit && (
        <Modal title={edit.id ? 'Editar' : 'Nueva visita'} onClose={() => setEdit(null)}>
          <TouchpointForm value={edit} onChange={setEdit} />
          <div className="row" style={{ marginTop: 12 }}>
            {edit.id && tps.length > 1 && <button className="btn danger" onClick={async () => { if (await ui.confirm({ title: '¿Eliminar este registro?', confirmLabel: 'Eliminar', danger: true }) === true) { await deleteTouchpoint(edit.id!); setEdit(null); } }}>Eliminar</button>}
            <span className="grow" />
            <button className="btn primary" onClick={async () => { try { await saveTouchpoint({ ...edit, companyId }); setEdit(null); } catch (e) { ui.toast(describeSaveError(e), 'err'); } }}>Guardar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TouchpointForm({ value, onChange }: { value: Partial<Touchpoint>; onChange: (v: Partial<Touchpoint>) => void }) {
  const set = (p: Partial<Touchpoint>) => onChange({ ...value, ...p });
  return (
    <div className="stack">
      <Field label="Tipo de origen">
        <select value={value.originType ?? 'visit'} onChange={(e) => set({ originType: e.target.value as OriginType })}>
          {(Object.keys(ORIGIN_LABEL) as OriginType[]).map((o) => <option key={o} value={o}>{ORIGIN_LABEL[o]}</option>)}
        </select>
      </Field>
      <Field label="Nombre del evento"><input type="text" value={value.eventName ?? ''} onChange={(e) => set({ eventName: e.target.value })} /></Field>
      <div className="grid2">
        <Field label="Fecha"><input type="date" value={value.date ?? ''} onChange={(e) => set({ date: e.target.value })} /></Field>
        <Field label="Stand"><input type="text" value={value.stand ?? ''} onChange={(e) => set({ stand: e.target.value })} /></Field>
        <Field label="Ciudad"><input type="text" value={value.city ?? ''} onChange={(e) => set({ city: e.target.value })} /></Field>
        <Field label="País"><input type="text" value={value.country ?? ''} onChange={(e) => set({ country: e.target.value })} /></Field>
      </div>
      <Field label="Observaciones"><textarea value={value.remarks ?? ''} onChange={(e) => set({ remarks: e.target.value })} /></Field>
    </div>
  );
}

