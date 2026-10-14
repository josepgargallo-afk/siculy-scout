import { useEffect, useRef, useState } from 'react';
import { Building2, Camera, ExternalLink, IdCard, Image as ImageIcon, MapPin, Mic, NotebookPen, QrCode, Trash2, Users } from 'lucide-react';
import { db } from '../lib/db';
import { deleteCompany, updateCompany } from '../lib/repo';
import { describeSaveError } from '../lib/storage';
import { ORIGIN_LABEL, PRIORITY_LABEL, TYPE_LABEL, type Company, type CompanyType, type Priority } from '../lib/types';
import { Field, Header, MoreMenu, splitList, useUi } from './kit';
import { navigate } from './router';
import { useLive, useSettings } from './hooks';
import { ContactsSection, PhotosSection, VisitsSection, addPhotoFiles } from './sections';
import { NotesAudioSection } from './NotesAudio';
import { Acc, summaries } from './Accordion';
import { Logo, LogoEditor, useLogoBlob } from './Logo';
import { loadOpen, saveOpen, takeReveal, type SecKey } from './reveal';

interface FormState {
  name: string; legalName: string; type: CompanyType; priority: Priority; country: string; city: string;
  address: string; operationalAddress: string; email: string; phone: string; web: string; categories: string; products: string; notes: string;
}

const toForm = (c: Company): FormState => ({
  name: c.name, legalName: c.legalName ?? '', type: c.type, priority: c.priority, country: c.country ?? '', city: c.city ?? '',
  address: c.address ?? '', operationalAddress: c.operationalAddress ?? '', email: c.email ?? '', phone: c.phone ?? '', web: c.web ?? '', categories: c.categories.join(', '), products: c.productsOfInterest.join(', '), notes: c.notes ?? '',
});

/** YYYY-MM-DD → «14 oct 2026» (sin cambiar el dato guardado). */
const fmtDay = (ymd: string) => { const d = new Date(ymd + 'T12:00:00'); return isNaN(+d) ? ymd : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }); };

type SaveState = 'saved' | 'pending' | 'error';

/** Formulario con AUTOGUARDADO: cada cambio se guarda a los 600 ms y siempre al salir o ocultar la app. */
function CompanyForm({ company, onState }: { company: Company; onState?: (s: SaveState) => void }) {
  const ui = useUi();
  const [f, setF] = useState<FormState>(() => toForm(company));
  const [state, setState] = useState<SaveState>('saved');
  const latest = useRef(f);
  const dirty = useRef(false);
  const timer = useRef<number>(undefined);
  const id = company.id;
  useEffect(() => { onState?.(state); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="stack">
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
          {f.web.trim() && <a className="btn" aria-label="Abrir la web" href={/^https?:\/\//i.test(f.web.trim()) ? f.web.trim() : 'https://' + f.web.trim()} target="_blank" rel="noopener noreferrer"><ExternalLink />Abrir</a>}</div>
      </Field>
      <Field label="Categorías de producto" hint="Separadas por comas"><input type="text" value={f.categories} onChange={(e) => set({ categories: e.target.value })} placeholder="Pescado, Pasta, Helados" /></Field>
      <Field label="Productos de interés" hint="Separados por comas"><input type="text" value={f.products} onChange={(e) => set({ products: e.target.value })} /></Field>
      <Field label="Notas comerciales"><textarea value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      <div className="small">Creada {new Date(company.createdAt).toLocaleString('es-ES')} · Modificada {new Date(company.updatedAt).toLocaleString('es-ES')}</div>
    </div>
  );
}

export function CompanyView({ id }: { id: string }) {
  const ui = useUi();
  const s = useSettings();
  const [company, ready] = useLive(() => db.companies.get(id), [id], undefined as Company | undefined);
  const [rec, setRec] = useState(0);
  const camRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<SecKey[]>(() => loadOpen(id)); // plegadas por defecto
  const [reveal, setReveal] = useState<{ sec: SecKey; itemId?: string; n: number } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [notesSum, setNotesSum] = useState({ total: 0, busy: 0 });
  const [logoEdit, setLogoEdit] = useState(false);
  const idRef = useRef<HTMLDivElement>(null);
  const [titleOn, setTitleOn] = useState(false);
  const [counts, countsReady] = useLive(async () => {
    const [contacts, photos, tps] = await Promise.all([
      db.contacts.where('companyId').equals(id).count(),
      db.media.where('companyId').equals(id).filter((m) => m.kind === 'photo' && m.category !== 'logo').count(),
      db.touchpoints.where('companyId').equals(id).toArray(),
    ]);
    tps.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const f = tps[0];
    return { contacts, photos, visits: tps.length, first: f ? (f.eventName || ORIGIN_LABEL[f.originType]) + (f.date ? ' · ' + fmtDay(f.date) : '') : undefined };
  }, [id], { contacts: 0, photos: 0, visits: 0, first: undefined as string | undefined });
  const logo = useLogoBlob(company ?? {});
  // El nombre ya se ve grande en la ficha: la barra superior sólo lo muestra al desplazarse.
  useEffect(() => {
    const el = idRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setTitleOn(!e.isIntersecting), { rootMargin: '-56px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ready, !!company]);

  const openSec = (sec: SecKey, itemId?: string) => {
    setOpen((o) => { const n = o.includes(sec) ? o : [...o, sec]; saveOpen(id, n); return n; });
    setReveal((r) => ({ sec, itemId, n: (r?.n ?? 0) + 1 }));
  };
  const toggle = (sec: SecKey) => setOpen((o) => { const n = o.includes(sec) ? o.filter((k) => k !== sec) : [...o, sec]; saveOpen(id, n); return n; });

  // Al volver de crear algo (contacto, tarjeta, QR…), abre su sección y lo muestra.
  useEffect(() => {
    const r = takeReveal(id);
    if (r) { setOpen(loadOpen(id)); setReveal({ sec: r.sec, itemId: r.itemId, n: 1 }); }
  }, [id]);
  // Para secciones sin elemento concreto, deja la cabecera a la vista.
  useEffect(() => {
    if (!reveal || reveal.itemId || reveal.sec === 'contacts' || reveal.sec === 'photos') return;
    const t = window.setTimeout(() => document.getElementById('sec-' + reveal.sec)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    return () => window.clearTimeout(t);
  }, [reveal]);

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

  const rv = (sec: SecKey) => (reveal && reveal.sec === sec ? { itemId: reveal.itemId, n: reveal.n } : undefined);
  const isOpen = (k: SecKey) => open.includes(k);
  const badge = saveState === 'saved' ? null : <span className={'saved ' + (saveState === 'pending' ? 'pending' : 'err')}>{saveState === 'pending' ? 'Guardando…' : 'Sin guardar'}</span>;

  return (
    <>
      <Header title={company.name} hideTitle={!titleOn} back="/" right={
        <MoreMenu label="Más opciones de la empresa" items={[
          { label: 'Cambiar logo', icon: <ImageIcon />, onClick: () => setLogoEdit(true) },
          { label: 'Eliminar empresa…', icon: <Trash2 />, danger: true, onClick: () => void del() },
        ]} />
      } />
      <div className="page ficha">
        <div className="idrow" ref={idRef}>
          <button className="logo-btn" aria-label="Cambiar el logo de la empresa" onClick={() => setLogoEdit(true)}><Logo name={company.name} blob={logo} size={68} /><span className="logo-ed"><Camera /></span></button>
          <div className="idtxt">
            <h1 className="idname">{company.name}</h1>
            <div className="idmeta">
              <span className={'chip ' + company.type}>{TYPE_LABEL[company.type]}</span>
              <span className="chip prio"><span className={'dot ' + company.priority} />Prioridad {PRIORITY_LABEL[company.priority].toLowerCase()}</span>
              {(company.city || company.country) && <span className="place"><MapPin />{[company.city, company.country].filter(Boolean).join(', ')}</span>}
            </div>
          </div>
        </div>
        <div className="actions4">
          <button className="btn" onClick={() => navigate('/scan/card?c=' + id)} disabled={!s.ocrEnabled}><span className="ic"><IdCard /></span>Tarjeta</button>
          <button className="btn" onClick={() => navigate('/scan/qr?c=' + id)} disabled={!s.qrEnabled}><span className="ic"><QrCode /></span>QR</button>
          <button className="btn" onClick={() => camRef.current?.click()}><span className="ic"><Camera /></span>Foto</button>
          <button className="btn rec" onClick={() => { openSec('notes'); setRec((n) => n + 1); }}><span className="ic"><Mic /></span>Audio</button>
        </div>
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden
          onChange={async (e) => { const fl = e.target.files ? Array.from(e.target.files) : []; e.target.value = ''; if (fl.length) { const pid = await addPhotoFiles(id, fl, 'product', ui); if (pid) openSec('photos', pid); } }} />

        <Acc id="sec-data" icon={<Building2 />} title="Datos de la empresa" summary={summaries.data(company, TYPE_LABEL[company.type])} badge={badge} open={isOpen('data')} onToggle={() => toggle('data')}>
          <CompanyForm key={id} company={company} onState={setSaveState} />
        </Acc>
        <Acc id="sec-contacts" icon={<Users />} title="Contactos" summary={countsReady ? summaries.contacts(counts.contacts) : '…'} open={isOpen('contacts')} onToggle={() => toggle('contacts')}>
          <ContactsSection companyId={id} reveal={rv('contacts')} />
        </Acc>
        <Acc id="sec-photos" icon={<ImageIcon />} title="Fotografías" summary={countsReady ? summaries.photos(counts.photos) : '…'} open={isOpen('photos')} onToggle={() => toggle('photos')}>
          <PhotosSection companyId={id} reveal={rv('photos')} />
        </Acc>
        <Acc id="sec-notes" icon={<NotebookPen />} title="Notas y audios" summary={summaries.notes(notesSum.total, notesSum.busy)} open={isOpen('notes')} onToggle={() => toggle('notes')}>
          <NotesAudioSection companyId={id} startSignal={rec} onSummary={(total, busy) => setNotesSum({ total, busy })} onCreated={() => openSec('notes')} />
        </Acc>
        <Acc id="sec-visits" icon={<MapPin />} title="Origen y visitas" summary={countsReady ? summaries.visits(counts.first, counts.visits) : '…'} open={isOpen('visits')} onToggle={() => toggle('visits')}>
          <VisitsSection companyId={id} />
        </Acc>
      </div>
      {logoEdit && <LogoEditor company={company} onClose={() => setLogoEdit(false)} />}
    </>
  );
}
