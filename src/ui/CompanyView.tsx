import { useEffect, useRef, useState } from 'react';
import { db } from '../lib/db';
import { deleteCompany, updateCompany } from '../lib/repo';
import { describeSaveError } from '../lib/storage';
import { PRIORITY_LABEL, TYPE_LABEL, type Company, type CompanyType, type Priority } from '../lib/types';
import { Field, Header, splitList, useUi } from './kit';
import { navigate } from './router';
import { useLive, useSettings } from './hooks';
import { ContactsSection, PhotosSection, VisitsSection, addPhotoFiles } from './sections';
import { NotesAudioSection } from './NotesAudio';

interface FormState {
  name: string; legalName: string; type: CompanyType; priority: Priority; country: string; city: string;
  address: string; operationalAddress: string; email: string; phone: string; web: string; categories: string; products: string; notes: string;
}

const toForm = (c: Company): FormState => ({
  name: c.name, legalName: c.legalName ?? '', type: c.type, priority: c.priority, country: c.country ?? '', city: c.city ?? '',
  address: c.address ?? '', operationalAddress: c.operationalAddress ?? '', email: c.email ?? '', phone: c.phone ?? '', web: c.web ?? '', categories: c.categories.join(', '), products: c.productsOfInterest.join(', '), notes: c.notes ?? '',
});

type SaveState = 'saved' | 'pending' | 'error';

/** Formulario con AUTOGUARDADO: cada cambio se guarda a los 600 ms y siempre al salir o ocultar la app. */
function CompanyForm({ company }: { company: Company }) {
  const ui = useUi();
  const [f, setF] = useState<FormState>(() => toForm(company));
  const [state, setState] = useState<SaveState>('saved');
  const latest = useRef(f);
  const dirty = useRef(false);
  const timer = useRef<number>(undefined);
  const id = company.id;

  const flush = async () => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    const v = latest.current;
    if (!v.name.trim()) { setState('error'); return; }
    dirty.current = false;
    try {
      await updateCompany(id, {
        name: v.name, legalName: v.legalName.trim() || undefined, type: v.type, priority: v.priority,
        country: v.country.trim() || undefined, city: v.city.trim() || undefined, address: v.address.trim() || undefined, operationalAddress: v.operationalAddress.trim() || undefined,
        email: v.email.trim() || undefined, phone: v.phone.trim() || undefined,
        web: v.web.trim() || undefined, categories: splitList(v.categories), productsOfInterest: splitList(v.products),
        notes: v.notes.trim() || undefined,
      });
      setState(dirty.current ? 'pending' : 'saved');
    } catch (e) { dirty.current = true; setState('error'); ui.toast(describeSaveError(e), 'err'); }
  };

  const set = (p: Partial<FormState>) => {
    const n = { ...latest.current, ...p };
    latest.current = n; dirty.current = true; setF(n); setState('pending');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 600);
  };

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') void flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onHide); void flush(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const seg = <T extends string>(val: T, opts: Record<T, string>, on: (v: T) => void) => (
    <div className="seg">{(Object.keys(opts) as T[]).map((k) => <button key={k} type="button" className={val === k ? 'on' : ''} onClick={() => on(k)}>{opts[k]}</button>)}</div>
  );

  return (
    <section className="card stack" id="sec-data">
      <h2>Datos de la empresa
        <span className={'saved ' + (state === 'pending' ? 'pending' : '')}>
          {state === 'saved' ? '✓ Guardado' : state === 'pending' ? 'Guardando…' : '⚠ Sin guardar'}
        </span>
      </h2>
      <Field label="Nombre comercial *"><input type="text" className={f.name.trim() ? '' : 'invalid'} value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
      {!f.name.trim() && <div className="banner err">El nombre no puede quedar vacío; no se guardará hasta que lo escribas.</div>}
      {seg(f.type, TYPE_LABEL, (type) => set({ type }))}
      <Field label="Prioridad">{seg(f.priority, PRIORITY_LABEL, (priority) => set({ priority }))}</Field>
      <div className="grid2">
        <Field label="País"><input type="text" value={f.country} onChange={(e) => set({ country: e.target.value })} /></Field>
        <Field label="Ciudad"><input type="text" value={f.city} onChange={(e) => set({ city: e.target.value })} /></Field>
      </div>
      <Field label="Nombre legal"><input type="text" value={f.legalName} onChange={(e) => set({ legalName: e.target.value })} /></Field>
      <Field label="Dirección legal"><input type="text" value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
      <Field label="Dirección operativa"><input type="text" value={f.operationalAddress} onChange={(e) => set({ operationalAddress: e.target.value })} /></Field>
      <div className="grid2">
        <Field label="Email corporativo"><input type="email" inputMode="email" autoCapitalize="none" value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
        <Field label="Teléfono corporativo"><input type="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
      </div>
      <Field label="Web">
        <div className="row nowrap"><input type="url" inputMode="url" value={f.web} onChange={(e) => set({ web: e.target.value })} placeholder="www.ejemplo.com" />
          {f.web.trim() && <a className="btn" href={/^https?:\/\//i.test(f.web.trim()) ? f.web.trim() : 'https://' + f.web.trim()} target="_blank" rel="noopener noreferrer">Abrir</a>}</div>
      </Field>
      <Field label="Categorías de producto" hint="Separadas por comas"><input type="text" value={f.categories} onChange={(e) => set({ categories: e.target.value })} placeholder="Pescado, Pasta, Helados" /></Field>
      <Field label="Productos de interés" hint="Separados por comas"><input type="text" value={f.products} onChange={(e) => set({ products: e.target.value })} /></Field>
      <Field label="Notas comerciales"><textarea value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      <div className="small">Creada {new Date(company.createdAt).toLocaleString('es-ES')} · Modificada {new Date(company.updatedAt).toLocaleString('es-ES')}</div>
    </section>
  );
}

export function CompanyView({ id }: { id: string }) {
  const ui = useUi();
  const s = useSettings();
  const [company, ready] = useLive(() => db.companies.get(id), [id], undefined as Company | undefined);
  const [rec, setRec] = useState(0);
  const camRef = useRef<HTMLInputElement>(null);

  if (!ready) return <><Header title="…" back="/" /></>;
  if (!company) {
    return <><Header title="Empresa" back="/" /><div className="page"><div className="banner warn">Esta empresa no existe (puede haberse eliminado).</div><a className="btn" href="#/">Ir al directorio</a></div></>;
  }

  const del = async () => {
    const [nc, nm, nn] = await Promise.all([
      db.contacts.where('companyId').equals(id).count(), db.media.where('companyId').equals(id).count(), db.notes.where('companyId').equals(id).count(),
    ]);
    const ok = await ui.confirm({
      title: `¿Eliminar «${company.name}»?`,
      message: `Se borrarán también ${nc} contacto(s), ${nm} foto(s)/audio(s) y ${nn} nota(s). No se puede deshacer. Si no tienes copia de seguridad, hazla antes.`,
      confirmLabel: 'Eliminar todo', danger: true,
    });
    if (ok === true) { await deleteCompany(id); navigate('/', { replace: true }); ui.toast('Empresa eliminada'); }
  };

  const go = (sec: string) => document.getElementById(sec)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <>
      <Header title={company.name} back="/" right={<button className="icon-btn" aria-label="Eliminar empresa" onClick={() => void del()}>🗑</button>} />
      <div className="page">
        <div className="actions4">
          <button className="btn" onClick={() => navigate('/scan/card?c=' + id)} disabled={!s.ocrEnabled}><span className="ic">📇</span>Tarjeta</button>
          <button className="btn" onClick={() => navigate('/scan/qr?c=' + id)} disabled={!s.qrEnabled}><span className="ic">▦</span>QR</button>
          <button className="btn" onClick={() => camRef.current?.click()}><span className="ic">📷</span>Foto</button>
          <button className="btn" onClick={() => { go('sec-notes'); setRec((n) => n + 1); }}><span className="ic">🎙</span>Audio</button>
        </div>
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden
          onChange={async (e) => { const fl = e.target.files ? Array.from(e.target.files) : []; e.target.value = ''; if (fl.length) await addPhotoFiles(id, fl, 'product', ui); }} />
        <CompanyForm key={id} company={company} />
        <ContactsSection companyId={id} />
        <PhotosSection companyId={id} />
        <NotesAudioSection companyId={id} startSignal={rec} />
        <VisitsSection companyId={id} />
        <button className="btn danger block" onClick={() => void del()}>Eliminar empresa</button>
      </div>
    </>
  );
}
