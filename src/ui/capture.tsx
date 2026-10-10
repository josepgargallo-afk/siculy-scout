import { useEffect, useMemo, useState } from 'react';
import { db } from '../lib/db';
import { addMedia, createCompany, deleteMedia, saveContact, saveNote, updateCompany } from '../lib/repo';
import { findCompanyDuplicates, findContactDuplicates } from '../lib/duplicates';
import { plausibility } from '../lib/ocrParse';
import { optimizeImage } from '../lib/image';
import { uuid } from '../lib/ids';
import { describeSaveError } from '../lib/storage';
import { getSettings } from '../lib/settings';
import { COMPANY_FIELDS, buildCompanyPatch, companyInputFromDraft, companyNameMismatch, diffCompany, type CompanyDraft, type FieldDiff } from '../lib/companyMerge';
import { DIGITAL_CARD_HOSTS, type ImportDraft } from '../lib/importDraft';
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
          <Field label={'Nombre comercial *' + (!value.name.trim() && nameAlts?.length ? ' (elige o escribe)' : '')}><input type="text" value={value.name} onChange={(e) => onChange({ kind: 'new', name: e.target.value })} /></Field>
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

/**
 * Resuelve el destino a un id de empresa. Una empresa NUEVA se crea con todos los datos corporativos detectados;
 * si el usuario elige una existente desde el aviso de duplicados, se devuelve `existing: true` para completar sólo huecos.
 */
export async function resolveTarget(
  t: Target, ui: ReturnType<typeof useUi>, extra: Partial<Company> = {},
): Promise<{ id: string; created: boolean } | null> {
  if (t.kind === 'existing') {
    if (!t.id) { ui.toast('Elige una empresa', 'err'); return null; }
    return { id: t.id, created: false };
  }
  const name = t.name.trim();
  if (!name) { ui.toast('Escribe el nombre de la empresa', 'err'); return null; }
  if (plausibility(name) < 0.45) {
    const ok = await ui.confirm({ title: '¿Nombre de empresa ilegible?', message: <>«{name}» no parece un nombre de empresa. Corrígelo antes de crear la ficha.</>, confirmLabel: 'Crear igualmente', cancelLabel: 'Corregir' });
    if (ok !== true) return null;
  }
  const dups = findCompanyDuplicates(name, await db.companies.toArray(), { web: extra.web }).slice(0, 3);
  if (dups.length) {
    const ans = await ui.confirm({
      title: 'Posible empresa duplicada',
      message: <ul style={{ paddingLeft: 18, margin: 0 }}>{dups.map((d) => <li key={d.company.id}>{d.company.name}</li>)}</ul>,
      confirmLabel: 'Crear nueva igualmente',
      extra: dups.map((d) => ({ label: `Usar «${d.company.name}»`, value: 'use:' + d.company.id })),
    });
    if (typeof ans === 'string' && ans.startsWith('use:')) return { id: ans.slice(4), created: false };
    if (ans !== true) return null;
  }
  return { id: (await createCompany({ ...extra, name }, { ...getSettings().event })).id, created: true };
}

/** Revisión de los datos de EMPRESA detectados: editables si la empresa es nueva; con diferencias elegibles si ya existe. */
function CompanyReview({ draft, setDraft, flags, existing, choices, setChoice }: {
  draft: CompanyDraft; setDraft: (p: Partial<CompanyDraft>) => void; flags: (keyof CompanyDraft)[];
  existing?: Company; choices: Partial<Record<FieldDiff['key'], boolean>>; setChoice: (k: FieldDiff['key'], v: boolean) => void;
}) {
  const flag = (k: keyof CompanyDraft) => (flags.includes(k) ? 'uncertain' : '');
  const mark = (k: keyof CompanyDraft) => (flags.includes(k) ? ' ⚠ revisar' : '');
  if (!existing) {
    const filled = COMPANY_FIELDS.some((f) => draft[f.key]);
    return (
      <details className="card" open={filled}>
        <summary>Datos de la empresa detectados {filled ? '' : '(ninguno)'}</summary>
        <div className="stack" style={{ marginTop: 8 }}>
          {COMPANY_FIELDS.map((f) => (
            <div key={f.key} className={flag(f.key)}>
              <Field label={f.label + mark(f.key)}>
                <input type={f.key === 'email' ? 'email' : f.key === 'phone' ? 'tel' : 'text'} value={draft[f.key]} autoCapitalize={f.key === 'web' || f.key === 'email' ? 'none' : 'sentences'} onChange={(e) => setDraft({ [f.key]: e.target.value })} />
              </Field>
            </div>
          ))}
          <div className="small">Sólo se guardan los campos con valor. No se deducen categorías ni productos.</div>
        </div>
      </details>
    );
  }
  const diffs = diffCompany(existing, draft);
  const same = diffs.filter((d) => d.status === 'same');
  const rest = diffs.filter((d) => d.status !== 'same');
  return (
    <div className="card stack">
      <h2>Datos de «{existing.name}»</h2>
      {rest.length === 0 && <div className="small">{diffs.length ? 'La ficha ya contiene todos los datos detectados.' : 'No se detectaron datos de empresa nuevos.'}</div>}
      {rest.map((d) => {
        const use = choices[d.key] ?? d.status === 'new';
        return (
          <div key={d.key} className={'diff ' + d.status}>
            <div className="row nowrap"><b className="grow">{d.label}</b><span className={'chip ' + (d.status === 'new' ? 'supplier' : 'both')}>{d.status === 'new' ? 'Nuevo' : '⚠ Conflicto'}</span></div>
            {d.status === 'conflict' && (
              <label className="row nowrap"><input type="radio" name={'c-' + d.key} checked={!use} onChange={() => setChoice(d.key, false)} /> <span>Mantener actual: <b>{d.current}</b></span></label>
            )}
            <label className="row nowrap">
              <input type={d.status === 'new' ? 'checkbox' : 'radio'} name={'c-' + d.key} checked={use} onChange={(e) => setChoice(d.key, d.status === 'new' ? e.target.checked : true)} />
              <span>{d.status === 'new' ? 'Añadir:' : 'Usar detectado:'}</span>
            </label>
            <input type="text" value={draft[d.key]} onChange={(e) => setDraft({ [d.key]: e.target.value })} aria-label={d.label + ' detectado'} />
          </div>
        );
      })}
      {same.length > 0 && <div className="small">✓ Ya coinciden: {same.map((d) => d.label).join(', ')}.</div>}
      <div className="small">Los datos actuales no se sobrescriben salvo que elijas «Usar detectado».</div>
    </div>
  );
}

export interface ConfirmProps {
  source: 'ocr' | 'qr';
  draft: ImportDraft;
  presetCompanyId?: string;
  image?: Blob; // foto original de la tarjeta (se guarda optimizada)
  banner?: string;
  /** La imagen de la tarjeta aún se está preparando: no se puede guardar hasta que esté lista. */
  imagePending?: boolean;
  /** Texto en bruto (OCR) editable para corregir y reanalizar. */
  raw?: { label: string; text: string; onReparse?: (text: string) => void };
  /** Tras guardar (por defecto abre la ficha). Permite encadenar varios contactos de un .vcf. */
  onSaved?: (companyId: string) => void;
}

export function CaptureConfirm(p: ConfirmProps) {
  const ui = useUi();
  const [f, setF] = useState<ContactFields>(p.draft.contact);
  const [cd, setCd] = useState<CompanyDraft>(p.draft.company);
  const [rawText, setRawText] = useState(p.raw?.text ?? '');
  const [target, setTarget] = useState<Target>(p.presetCompanyId ? { kind: 'existing', id: p.presetCompanyId } : { kind: 'new', name: p.draft.company.name });
  const [choices, setChoices] = useState<Partial<Record<FieldDiff['key'], boolean>>>({});
  const [busy, setBusy] = useState(false);
  const imgUrl = useObjectUrl(p.image);
  const existingId = target.kind === 'existing' ? target.id : p.presetCompanyId;
  const [existing] = useLive(() => (existingId ? db.companies.get(existingId) : undefined), [existingId], undefined as Company | undefined);
  const setCompany = (x: Partial<CompanyDraft>) => setCd((v) => ({ ...v, ...x }));
  const set = (x: Partial<ContactFields>) => setF((v) => ({ ...v, ...x }));

  useEffect(() => { setF(p.draft.contact); setCd(p.draft.company); }, [p.draft]);
  useEffect(() => { setRawText(p.raw?.text ?? ''); }, [p.raw?.text]);

  const mismatch = !!existing && !!cd.name && companyNameMismatch(existing.name, cd.name);

  const save = async () => {
    const patch = toContactPatch(f);
    const hasData = patch.fullName || patch.email || patch.phone || patch.mobile;
    if (busy) return;
    setBusy(true);
    let mediaId: string | undefined;
    try {
      if (mismatch) {
        const ok = await ui.confirm({
          title: 'La tarjeta indica otra empresa',
          message: <>La tarjeta/QR identifica a <b>«{cd.name}»</b>, pero vas a guardar el contacto en <b>«{existing!.name}»</b>. ¿Es correcto?</>,
          confirmLabel: 'Sí, guardar en «' + existing!.name + '»', cancelLabel: 'Revisar',
        });
        if (ok !== true) return;
      }
      let companyId: string; let created = false;
      if (existingId) companyId = existingId;
      else {
        const r = await resolveTarget(target, ui, companyInputFromDraft({ ...cd, name: target.kind === 'new' ? target.name : cd.name }));
        if (!r) return;
        companyId = r.id; created = r.created;
      }
      // Empresa existente (elegida o preexistente): sólo se rellenan huecos o lo que el usuario eligió. Nunca se pisa en silencio.
      if (!created) {
        const cur = await db.companies.get(companyId);
        if (cur) {
          const cpatch = buildCompanyPatch(diffCompany(cur, cd), existingId ? choices : {});
          if (Object.keys(cpatch).length) await updateCompany(companyId, cpatch);
        }
      }

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
            ui.toast('Contacto completado');
            (p.onSaved ?? ((id) => navigate('/c/' + id, { replace: true })))(companyId);
            return;
          }
          if (ans !== true) return;
        }
      }

      const contactId = uuid();
      if (p.image) mediaId = await attachCard(p.image, companyId, contactId, ui);
      if (hasData || mediaId) {
        await saveContact({ id: contactId, companyId, ...patch, fullName: patch.fullName || '(sin nombre)', captureSource: p.source, cardPhotoId: mediaId });
      }
      ui.toast('Contacto guardado');
      (p.onSaved ?? ((id) => navigate('/c/' + id, { replace: true })))(companyId);
    } catch (e) {
      if (mediaId) await deleteMedia(mediaId).catch(() => undefined);
      ui.toast(describeSaveError(e), 'err');
    } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      {p.banner && <div className="banner warn">{p.banner}</div>}
      {imgUrl && <img className="thumb-card" src={imgUrl} alt="Tarjeta capturada" />}
      <CompanyPicker presetId={p.presetCompanyId} suggestName={p.draft.company.name} value={target} onChange={(t) => { setTarget(t); setChoices({}); }} nameAlts={p.draft.companyAlts.name} />
      {mismatch && <div className="banner warn">⚠ La tarjeta indica <b>«{cd.name}»</b> pero la empresa seleccionada es <b>«{existing!.name}»</b>. Comprueba que no te equivocas de ficha.</div>}
      {(target.kind === 'new' || existing) && (
        <CompanyReview draft={cd} setDraft={setCompany} flags={p.draft.companyFlags} existing={existingId ? existing : undefined} choices={choices} setChoice={(k, v) => setChoices((c) => ({ ...c, [k]: v }))} />
      )}
      <div className="card"><h2>Contacto</h2><ContactFieldsForm value={f} onChange={set} flag={p.draft.contactFlags} alts={p.draft.contactAlts} /></div>
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

/** Para URL/texto de QR: guarda como nota. La URL de una tarjeta digital NUNCA se toma como web de la empresa. */
export function SaveLinkPanel({ text, url, presetCompanyId, suggestCompany }: { text: string; url?: string; presetCompanyId?: string; suggestCompany?: string }) {
  const ui = useUi();
  const [target, setTarget] = useState<Target>(presetCompanyId ? { kind: 'existing', id: presetCompanyId } : { kind: 'new', name: suggestCompany ?? '' });
  const [busy, setBusy] = useState(false);
  const digital = !!url && DIGITAL_CARD_HOSTS.test(url);
  const save = async () => {
    setBusy(true);
    try {
      const r = presetCompanyId ? { id: presetCompanyId } : await resolveTarget(target, ui);
      if (!r) return;
      const c = await db.companies.get(r.id);
      if (url && !digital && c && !c.web) await updateCompany(r.id, { web: url });
      else await saveNote({ companyId: r.id, text: (digital ? 'Tarjeta digital: ' : url ? 'Enlace QR: ' : 'Texto QR: ') + text });
      navigate('/c/' + r.id, { replace: true }); ui.toast('Guardado');
    } catch (e) { ui.toast(describeSaveError(e), 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <CompanyPicker presetId={presetCompanyId} suggestName={suggestCompany} value={target} onChange={setTarget} />
      <button className="btn primary block" disabled={busy} onClick={() => void save()}>{url && !digital ? 'Guardar enlace en la empresa' : digital ? 'Guardar enlace de la tarjeta como nota' : 'Guardar como nota'}</button>
    </div>
  );
}
