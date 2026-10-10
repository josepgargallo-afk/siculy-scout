import { useRef, useState } from 'react';
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
export async function addPhotoFiles(companyId: string, files: FileList | File[], category: PhotoCategory, ui: Ui) {
  let ok = 0;
  for (const f of Array.from(files)) {
    try {
      const o = await optimizeImage(f, 'photo');
      await addMedia({ companyId, kind: 'photo', category, mime: 'image/jpeg', size: o.blob.size, blob: o.blob, thumb: o.thumb });
      ok++;
    } catch (e) {
      const msg = (e as Error).message;
      ui.toast(/compatible/.test(msg) ? `${f.name || 'Imagen'}: ${msg}` : describeSaveError(e), 'err');
    }
  }
  if (ok) ui.toast(ok === 1 ? 'Foto guardada' : `${ok} fotos guardadas`);
}

// ---------- Contactos ----------
export function ContactsSection({ companyId }: { companyId: string }) {
  const [contacts] = useLive(() => db.contacts.where('companyId').equals(companyId).sortBy('createdAt'), [companyId], []);
  return (
    <section className="card" id="sec-contacts">
      <h2>Contactos <span className="sub">{contacts.length}</span></h2>
      {contacts.length === 0 && <div className="small" style={{ marginBottom: 8 }}>Sin contactos todavía.</div>}
      {contacts.map((c) => (
        <div key={c.id} className="item" style={{ cursor: 'pointer' }} onClick={() => navigate(`/c/${companyId}/contact/${c.id}`)}>
          <div className="t">{c.fullName || c.email || c.mobile || c.phone}</div>
          <div className="m">
            {c.role && <span>{c.role}</span>}
            {c.captureSource !== 'manual' && <span className="chip">{c.captureSource === 'ocr' ? 'Tarjeta' : 'QR'}</span>}
          </div>
          <div className="row" style={{ marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
            {c.mobile && <a className="btn sm" href={'tel:' + c.mobile.replace(/[^\d+]/g, '')}>📱 {c.mobile}</a>}
            {c.phone && <a className="btn sm" href={'tel:' + c.phone.replace(/[^\d+]/g, '')}>📞 {c.phone}</a>}
            {c.email && <a className="btn sm" href={'mailto:' + c.email}>✉ {c.email}</a>}
          </div>
        </div>
      ))}
      <div className="row">
        <button className="btn grow" onClick={() => navigate(`/c/${companyId}/contact/new`)}>＋ Añadir contacto</button>
      </div>
    </section>
  );
}

// ---------- Fotos ----------
export function PhotosSection({ companyId }: { companyId: string }) {
  const ui = useUi();
  const [items] = useLive(async () => (await db.media.where('companyId').equals(companyId).filter((m) => m.kind === 'photo').toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [companyId], [] as MediaItem[]);
  const [open, setOpen] = useState<string | null>(null);
  const [cat, setCat] = useState<PhotoCategory>('product');
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const current = items.find((m) => m.id === open);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length) await addPhotoFiles(companyId, files, cat, ui);
  };

  return (
    <section className="card" id="sec-photos">
      <h2>Fotografías <span className="sub">{items.length}</span></h2>
      <div className="row" style={{ marginBottom: 8 }}>
        <select value={cat} onChange={(e) => setCat(e.target.value as PhotoCategory)} aria-label="Categoría de la foto" style={{ width: 'auto', flex: 1 }}>
          {(Object.keys(CATEGORY_LABEL) as PhotoCategory[]).filter((c) => c !== 'card').map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
        <button className="btn primary" onClick={() => camRef.current?.click()}>📷 Cámara</button>
        <button className="btn" onClick={() => galRef.current?.click()}>🖼 Galería</button>
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={pick} />
      {items.length === 0 ? <div className="small">Aún no hay fotos.</div> : (
        <div className="photos">
          {items.map((m) => <Thumb key={m.id} m={m} onOpen={() => setOpen(m.id)} />)}
        </div>
      )}
      {current && <PhotoViewer m={current} onClose={() => setOpen(null)} />}
    </section>
  );
}

function Thumb({ m, onOpen }: { m: MediaItem; onOpen: () => void }) {
  const url = useObjectUrl(m.thumb ?? m.blob);
  return (
    <button className="ph" onClick={onOpen} aria-label={m.description || CATEGORY_LABEL[m.category ?? 'other']}>
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
            {(Object.keys(CATEGORY_LABEL) as PhotoCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </Field>
        <Field label="Descripción (opcional)">
          <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => void updateMedia(m.id, { description: desc.trim() || undefined })} placeholder="Ej.: Gambas 1 kg, caja 10 kg" />
        </Field>
        <div className="row">
          {url && <a className="btn grow" href={url} target="_blank" rel="noopener">Abrir a pantalla completa</a>}
          <button className="btn danger" onClick={() => void remove()}>Eliminar</button>
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
    <section className="card" id="sec-visits">
      <h2>Origen y visitas <span className="sub">{tps.length}</span></h2>
      {tps.map((t, i) => (
        <div key={t.id} className="note">
          <div className="row nowrap"><b className="grow">{i === 0 ? 'Origen: ' : ''}{ORIGIN_LABEL[t.originType]}{t.eventName ? ' · ' + t.eventName : ''}</b>
            <button className="btn sm" onClick={() => setEdit(t)}>Editar</button></div>
          <div className="small">{[t.date, t.city, t.country, t.stand && 'Stand ' + t.stand].filter(Boolean).join(' · ')}</div>
          {t.remarks && <div>{t.remarks}</div>}
        </div>
      ))}
      <button className="btn block" style={{ marginTop: 8 }} onClick={() => setEdit({ originType: 'visit' })}>＋ Registrar nueva visita / contacto</button>
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
    </section>
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

