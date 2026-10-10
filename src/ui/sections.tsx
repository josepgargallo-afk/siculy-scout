import { useEffect, useRef, useState } from 'react';
import { db } from '../lib/db';
import { optimizeImage } from '../lib/image';
import {
  addMedia, deleteMedia, deleteNote, deleteTouchpoint, saveNote, saveTouchpoint, updateMedia,
} from '../lib/repo';
import { startRecording, recordingSupported, type ActiveRecorder } from '../lib/recorder';
import { speechSupported, startDictation } from '../lib/speech';
import { describeSaveError, formatBytes } from '../lib/storage';
import {
  CATEGORY_LABEL, ORIGIN_LABEL, type MediaItem, type OriginType, type PhotoCategory, type Touchpoint,
} from '../lib/types';
import { Field, Modal, fmtDate, useUi } from './kit';
import { navigate } from './router';
import { useDraft, useLive, useObjectUrl, useSettings } from './hooks';
import { getSettings } from '../lib/settings';
import { WHISPER_LANGS } from '../lib/audioPrep';
import { enqueueTranscription } from '../lib/transcribe';
import { kickTranscription } from '../lib/whisperClient';

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

// ---------- Audio ----------
export function AudioSection({ companyId, startSignal }: { companyId: string; startSignal: number }) {
  const ui = useUi();
  const [items] = useLive(async () => (await db.media.where('companyId').equals(companyId).filter((m) => m.kind === 'audio').toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [companyId], [] as MediaItem[]);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const rec = useRef<ActiveRecorder | null>(null);
  const timer = useRef<number>(undefined);

  const start = async () => {
    if (rec.current) return;
    try {
      rec.current = await startRecording();
      setRecording(true); setSecs(0);
      const t0 = Date.now();
      timer.current = window.setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 500);
    } catch (e) { ui.toast((e as Error).message, 'err'); }
  };
  const stop = async () => {
    const r = rec.current; rec.current = null;
    window.clearInterval(timer.current); setRecording(false);
    if (!r) return;
    try {
      const out = await r.stop();
      const saved = await addMedia({ companyId, kind: 'audio', mime: out.mime, size: out.blob.size, blob: out.blob, durationMs: out.durationMs });
      ui.toast('Audio guardado');
      // Grabar → Guardar audio → Transcribir → Guardar nota (sólo si la función experimental está activa y el modelo instalado)
      const st = getSettings();
      if (st.transcriptionEnabled && st.whisperInstalled) { await enqueueTranscription(saved.id, st.transcriptionLang); void kickTranscription(); }
    } catch (e) { ui.toast(describeSaveError(e), 'err'); }
  };
  useEffect(() => { if (startSignal > 0) void start(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [startSignal]);
  // Si se sale de la pantalla grabando, se guarda lo grabado en vez de perderlo.
  useEffect(() => () => { if (rec.current) { void stop(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return (
    <section className="card" id="sec-audio">
      <h2>Audios <span className="sub">{items.length}</span></h2>
      {!recordingSupported() ? (
        <div className="banner warn">Este navegador no permite grabar audio. Usa el micrófono del teclado para dictar notas.</div>
      ) : recording ? (
        <div className="row"><span className="rec-dot" /><b>Grabando {mmss(secs)}</b><span className="grow" /><button className="btn danger" onClick={() => void stop()}>■ Parar y guardar</button></div>
      ) : (
        <button className="btn primary block" onClick={() => void start()}>🎙 Grabar audio</button>
      )}
      {items.map((m) => <AudioRow key={m.id} m={m} />)}
    </section>
  );
}

function AudioRow({ m }: { m: MediaItem }) {
  const ui = useUi();
  const set = useSettings();
  const url = useObjectUrl(m.blob);
  const [desc, setDesc] = useState(m.description ?? '');
  const [lang, setLang] = useState(m.transcript?.language ?? set.transcriptionLang);
  const secs = Math.round((m.durationMs ?? 0) / 1000);
  const t = m.transcript;
  const installed = !!set.whisperInstalled;
  const run = async () => {
    if (!installed) { ui.toast('Primero descarga el modelo en Ajustes → Transcripción de audio', 'err'); return; }
    await enqueueTranscription(m.id, lang);
    void kickTranscription({ force: true });
  };
  return (
    <div className="audio-item">
      <div className="row nowrap"><span className="small grow">{fmtDate(m.createdAt)} · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')} · {formatBytes(m.size)}</span>
        <button className="btn sm" onClick={async () => { if (await ui.confirm({ title: '¿Eliminar audio?', message: t?.noteId ? 'La nota de la transcripción NO se elimina.' : undefined, confirmLabel: 'Eliminar', danger: true }) === true) await deleteMedia(m.id); }}>🗑</button></div>
      {url && <audio controls preload="none" src={url} />}
      {t && (
        <div className={'tstatus ' + t.status}>
          {t.status === 'pending' && <span>⏳ En cola para transcribir{!installed ? ' (descarga el modelo en Ajustes)' : !set.transcriptionEnabled ? ' (la transcripción automática está desactivada)' : ''} {installed && !set.transcriptionEnabled && <button className="btn sm" onClick={() => void kickTranscription({ force: true })}>▶ Transcribir ahora</button>}</span>}
          {t.status === 'processing' && <span><span className="spinner" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }} />Transcribiendo… (puede tardar; el audio ya está guardado)</span>}
          {t.status === 'done' && <span>📝 Transcrito{t.language ? ' (' + (WHISPER_LANGS[t.language] ?? t.language) + ')' : ''}: <i>{(t.text ?? '').slice(0, 140)}{(t.text ?? '').length > 140 ? '…' : ''}</i> <small>(editable en Notas)</small></span>}
          {t.status === 'error' && <span>⚠ {t.error ?? 'Error'} — el audio se conserva.</span>}
          {t.status === 'done' && t.error && <div className="small">{t.error}</div>}
        </div>
      )}
      {(installed || t) && (!t || t.status === 'done' || t.status === 'error') && (
        <div className="row">
          <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Idioma del audio" style={{ width: 'auto', minHeight: 36 }}>
            {Object.entries(WHISPER_LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn sm" onClick={() => void run()}>{t?.status === 'done' ? '↻ Transcribir de nuevo' : t?.status === 'error' ? '↻ Reintentar' : '📝 Transcribir'}</button>
        </div>
      )}
      <input type="text" value={desc} placeholder="Resumen o descripción (opcional)" onChange={(e) => setDesc(e.target.value)} onBlur={() => void updateMedia(m.id, { description: desc.trim() || undefined })} />
    </div>
  );
}

// ---------- Notas ----------
export function NotesSection({ companyId }: { companyId: string }) {
  const ui = useUi();
  const s = useSettings();
  const [notes] = useLive(async () => (await db.notes.where('companyId').equals(companyId).toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [companyId], []);
  const [d, setD, discard] = useDraft<{ text: string }>('note:' + companyId, { text: '' });
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [dictating, setDictating] = useState<{ stop(): void } | null>(null);

  const add = async () => {
    const text = d.text.trim();
    if (!text) return;
    try { await saveNote({ companyId, text }); discard(); setD({ text: '' }); } catch (e) { ui.toast(describeSaveError(e), 'err'); }
  };
  const dictate = () => {
    if (dictating) { dictating.stop(); return; }
    const ok = startDictation('es-ES', (chunk) => setD({ text: (d.text ? d.text + ' ' : '') + chunk }), (err) => { setDictating(null); if (err) ui.toast(err, 'err'); });
    setDictating(ok);
  };

  return (
    <section className="card" id="sec-notes">
      <h2>Notas <span className="sub">{notes.length}</span></h2>
      <textarea value={d.text} onChange={(e) => setD({ text: e.target.value })} placeholder="Escribe o dicta con el micrófono del teclado…" aria-label="Nueva nota" />
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn primary grow" disabled={!d.text.trim()} onClick={() => void add()}>Añadir nota</button>
        {s.dictationEnabled && speechSupported() && <button className="btn" onClick={dictate}>{dictating ? '■ Parar' : '🎤 Dictar'}</button>}
      </div>
      {d.text.trim() && <div className="small">Borrador guardado automáticamente.</div>}
      {notes.map((n) => (
        <div key={n.id} className="note">
          {editing === n.id ? (
            <div className="stack">
              <textarea value={editText} onChange={(e) => setEditText(e.target.value)} />
              <div className="row"><button className="btn primary sm" onClick={async () => { await saveNote({ id: n.id, companyId, text: editText.trim() || n.text }); setEditing(null); }}>Guardar</button><button className="btn sm" onClick={() => setEditing(null)}>Cancelar</button></div>
            </div>
          ) : (
            <>
              <div className="small">{fmtDate(n.createdAt)}{n.kind === 'transcript' && <span className="chip" style={{ marginLeft: 6 }}>🎙 Transcripción de audio</span>}</div>
              <div>{n.text}</div>
              <div className="row" style={{ marginTop: 4 }}>
                <button className="btn sm" onClick={() => { setEditing(n.id); setEditText(n.text); }}>Editar</button>
                <button className="btn sm" onClick={async () => { if (await ui.confirm({ title: '¿Eliminar nota?', confirmLabel: 'Eliminar', danger: true }) === true) await deleteNote(n.id); }}>Eliminar</button>
              </div>
            </>
          )}
        </div>
      ))}
    </section>
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

