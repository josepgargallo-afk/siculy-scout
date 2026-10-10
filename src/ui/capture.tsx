import { useEffect, useMemo, useState } from 'react';
import { db } from '../lib/db';
import { addMedia, createCompany, deleteMedia, saveContact, saveNote, updateCompany } from '../lib/repo';
import { findCompanyDuplicates, findContactDuplicates } from '../lib/duplicates';
import { plausibility } from '../lib/ocrParse';
import { optimizeImage } from '../lib/image';
import { uuid } from '../lib/ids';
import { describeSaveError } from '../lib/storage';
import { getSettings } from '../lib/settings';
import type { Company } from '../lib/types';
import { Alts, ContactFieldsForm, toContactPatch, type ContactFields } from './ContactForm';
import { Field, useUi } from './kit';
import { navigate } from './router';
import { useLive, useObjectUrl } from './hooks';

export type Target = { kind: 'existing'; id: string } | { kind: 'new'; name: string };

/** Elige la empresa destino: la indicada, una existente o una nueva (avisando de posibles duplicados). */
export function CompanyPicker({ presetId, suggestName, value, onChange, nameAlts }: {
  presetId?: string; suggestName?: string; value: Target; onChange: (t: Target) => void; nameAlts?: string[];
}) {
  const [all] = useLive(() => db.companies.orderBy('name').toArray(), [], [] as Company[]);
  const [q, setQ] = useState('');
  const preset = presetId ? all.find((c) => c.id === presetId) : undefined;
  const newName = value.kind === 'new' ? value.name : '';
  const dups = useMemo(() => (value.kind === 'new' && newName.trim().length >= 3 ? findCompanyDuplicates(newName, all).slice(0, 3) : []), [value.kind, newName, all]);

  if (presetId) return <div className="small">Empresa: <b>{preset?.name ?? '…'}</b></div>;
  const list = q.trim() ? all.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  return (
    <div className="card stack">
      <div className="seg" role="group" aria-label="Empresa destino">
        <button type="button" className={value.kind === 'new' ? 'on' : ''} onClick={() => onChange({ kind: 'new', name: suggestName ?? '' })}>Empresa nueva</button>
        <button type="button" className={value.kind === 'existing' ? 'on' : ''} onClick={() => all[0] && onChange({ kind: 'existing', id: value.kind === 'existing' ? value.id : '' })}>Empresa existente</button>
      </div>
      {value.kind === 'new' ? (
        <>
          <Field label={"Nombre de la empresa *" + (!value.name.trim() && nameAlts?.length ? " (elige o escribe)" : "")}><input type="text" value={value.name} onChange={(e) => onChange({ kind: 'new', name: e.target.value })} /></Field>
          <Alts values={nameAlts} current={value.name} onPick={(v) => onChange({ kind: 'new', name: v })} />
          {dups.length > 0 && (
            <div className="banner warn"><b>¿Es alguna de estas?</b>
              {dups.map((d) => <div key={d.company.id}><button className="btn sm" onClick={() => onChange({ kind: 'existing', id: d.company.id })}>Usar «{d.company.name}»</button></div>)}
            </div>
          )}
        </>
      ) : (
        <>
          <input type="search" placeholder="Buscar empresa…" value={q} onChange={(e) => setQ(e.target.value)} />
          {value.id && <div className="banner ok">Seleccionada: <b>{all.find((c) => c.id === value.id)?.name}</b></div>}
          {list.map((c) => <button key={c.id} className="btn" onClick={() => { onChange({ kind: 'existing', id: c.id }); setQ(''); }}>{c.name}</button>)}
        </>
      )}
    </div>
  );
}

/** Resuelve el destino a un id de empresa (creándola si hace falta, con aviso de duplicados). */
export async function resolveTarget(t: Target, ui: ReturnType<typeof useUi>): Promise<string | null> {
  if (t.kind === 'existing') {
    if (!t.id) { ui.toast('Elige una empresa', 'err'); return null; }
    return t.id;
  }
  const name = t.name.trim();
  if (!name) { ui.toast('Escribe el nombre de la empresa', 'err'); return null; }
  if (plausibility(name) < 0.45) {
    const ok = await ui.confirm({ title: '¿Nombre de empresa ilegible?', message: <>«{name}» no parece un nombre de empresa. Corrígelo antes de crear la ficha.</>, confirmLabel: 'Crear igualmente', cancelLabel: 'Corregir' });
    if (ok !== true) return null;
  }
  const dups = findCompanyDuplicates(name, await db.companies.toArray()).slice(0, 3);
  if (dups.length) {
    const ans = await ui.confirm({
      title: 'Posible empresa duplicada',
      message: <ul style={{ paddingLeft: 18, margin: 0 }}>{dups.map((d) => <li key={d.company.id}>{d.company.name}</li>)}</ul>,
      confirmLabel: 'Crear nueva igualmente',
      extra: dups.map((d) => ({ label: `Usar «${d.company.name}»`, value: 'use:' + d.company.id })),
    });
    if (typeof ans === 'string' && ans.startsWith('use:')) return ans.slice(4);
    if (ans !== true) return null;
  }
  return (await createCompany({ name }, { ...getSettings().event })).id;
}

export interface ConfirmProps {
  source: 'ocr' | 'qr';
  initial: ContactFields;
  flags?: string[];
  alts?: Partial<Record<keyof ContactFields, string[]>>;
  companyAlts?: string[];
  presetCompanyId?: string;
  suggestCompany?: string;
  image?: Blob; // foto original de la tarjeta (se guarda optimizada)
  banner?: string;
  /** La imagen de la tarjeta aún se está preparando: no se puede guardar hasta que esté lista. */
  imagePending?: boolean;
  /** Texto en bruto (OCR) editable para corregir y reanalizar. */
  raw?: { label: string; text: string; onReparse?: (text: string) => void };
}

export function CaptureConfirm(p: ConfirmProps) {
  const ui = useUi();
  const [f, setF] = useState<ContactFields>(p.initial);
  const [rawText, setRawText] = useState(p.raw?.text ?? '');
  const [target, setTarget] = useState<Target>({ kind: 'new', name: p.suggestCompany ?? '' });
  const [busy, setBusy] = useState(false);
  const imgUrl = useObjectUrl(p.image);
  useEffect(() => { setF(p.initial); }, [p.initial]);
  useEffect(() => { setRawText(p.raw?.text ?? ''); }, [p.raw?.text]);
  const set = (x: Partial<ContactFields>) => setF((v) => ({ ...v, ...x }));

  const save = async () => {
    const patch = toContactPatch(f);
    const hasData = patch.fullName || patch.email || patch.phone || patch.mobile;
    if (busy) return;
    setBusy(true);
    let mediaId: string | undefined;
    try {
      const companyId = p.presetCompanyId ?? await resolveTarget(target, ui);
      if (!companyId) return;

      if (hasData) {
        const dups = findContactDuplicates(patch, await db.contacts.where('companyId').equals(companyId).toArray());
        if (dups.length) {
          const d = dups[0].contact;
          const ans = await ui.confirm({
            title: 'Este contacto parece ya existir',
            message: <>Ya está <b>{d.fullName || d.email}</b> en esta empresa. No se sobrescribe nada sin tu permiso.</>,
            confirmLabel: 'Guardar como contacto nuevo',
            extra: [{ label: 'Completar el existente (sólo campos vacíos)', value: 'merge' }],
          });
          if (ans === 'merge') {
            const fill = Object.fromEntries(Object.entries(patch).filter(([k, v]) => v && !(d as unknown as Record<string, unknown>)[k]));
            await saveContact({ ...d, ...fill, companyId });
            if (p.image) await attachCard(p.image, companyId, d.id, ui);
            navigate('/c/' + companyId, { replace: true }); ui.toast('Contacto completado');
            return;
          }
          if (ans !== true) return;
        }
      }

      const contactId = uuid();
      if (p.image) mediaId = await attachCard(p.image, companyId, contactId, ui);
      if (hasData || mediaId) {
        await saveContact({
          id: contactId, companyId, ...patch, fullName: patch.fullName || '(sin nombre)', captureSource: p.source, cardPhotoId: mediaId,
        });
      }
      navigate('/c/' + companyId, { replace: true });
      ui.toast('Contacto guardado');
    } catch (e) {
      if (mediaId) await deleteMedia(mediaId).catch(() => undefined);
      ui.toast(describeSaveError(e), 'err');
    } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      {p.banner && <div className="banner warn">{p.banner}</div>}
      {imgUrl && <img className="thumb-card" src={imgUrl} alt="Tarjeta capturada" />}
      <CompanyPicker presetId={p.presetCompanyId} suggestName={p.suggestCompany} value={target} onChange={setTarget} nameAlts={p.companyAlts} />
      <div className="card"><ContactFieldsForm value={f} onChange={set} flag={p.flags} alts={p.alts} /></div>
      {p.raw && (
        <details className="card">
          <summary>{p.raw.label}</summary>
          <textarea className="ocrtext" value={rawText} onChange={(e) => setRawText(e.target.value)} spellCheck={false} />
          {p.raw.onReparse && <button className="btn sm" onClick={() => p.raw!.onReparse!(rawText)}>Volver a analizar el texto</button>}
        </details>
      )}
      <button className="btn primary block" disabled={busy || p.imagePending} onClick={() => void save()}>{p.imagePending ? 'Preparando imagen…' : 'Guardar contacto'}</button>
    </div>
  );
}

async function attachCard(image: Blob, companyId: string, contactId: string, ui: ReturnType<typeof useUi>): Promise<string | undefined> {
  try {
    const o = await optimizeImage(image, 'card');
    const m = await addMedia({ companyId, contactId, kind: 'photo', category: 'card', mime: 'image/jpeg', size: o.blob.size, blob: o.blob, thumb: o.thumb });
    return m.id;
  } catch (e) {
    ui.toast('No se guardó la foto de la tarjeta: ' + (e as Error).message, 'err');
    return undefined;
  }
}

/** Para URL/texto de QR: guarda como nota (y como web si la empresa no tiene). */
export function SaveLinkPanel({ text, url, presetCompanyId, suggestCompany }: { text: string; url?: string; presetCompanyId?: string; suggestCompany?: string }) {
  const ui = useUi();
  const [target, setTarget] = useState<Target>({ kind: 'new', name: suggestCompany ?? '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const id = presetCompanyId ?? await resolveTarget(target, ui);
      if (!id) return;
      const c = await db.companies.get(id);
      if (url && c && !c.web) await updateCompany(id, { web: url });
      else await saveNote({ companyId: id, text: (url ? 'Enlace QR: ' : 'Texto QR: ') + text });
      navigate('/c/' + id, { replace: true }); ui.toast('Guardado');
    } catch (e) { ui.toast(describeSaveError(e), 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <CompanyPicker presetId={presetCompanyId} suggestName={suggestCompany} value={target} onChange={setTarget} />
      <button className="btn primary block" disabled={busy} onClick={() => void save()}>{url ? 'Guardar enlace en la empresa' : 'Guardar como nota'}</button>
    </div>
  );
}
