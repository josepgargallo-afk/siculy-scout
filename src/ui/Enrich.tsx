import { useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, Info, Search, WifiOff } from 'lucide-react';
import { db } from '../lib/db';
import { updateCompany } from '../lib/repo';
import { sameValue, type FieldDiff } from '../lib/companyMerge';
import { renderLogo, setCompanyLogo } from '../lib/logo';
import { buildProvenance, localMatches, mergeCandidates, searchCompanies, type Chosen } from '../lib/enrich/search';
import { SOURCES } from '../lib/enrich/sources';
import { FIELD_LABEL, FIELD_ORDER, type Candidate, type FieldKey, type SearchResult } from '../lib/enrich/types';
import { describeSaveError } from '../lib/storage';
import type { Company, FieldSource } from '../lib/types';
import { Field, Modal, Spinner, useUi } from './kit';
import { useLive, useOnline } from './hooks';

/** Lo que el usuario confirmó tras la vista previa: sólo los campos marcados, con su procedencia. */
export interface EnrichApply {
  fields: Partial<Record<FieldKey, string>>;
  provenance: Record<string, FieldSource>;
  logo?: { url: string; cand: Candidate };
}

const asKey = (k: FieldKey) => k as FieldDiff['key'];
const cmp = (key: FieldKey, a: string, b: string) => (key === 'name' || key === 'sector' || key === 'description' ? a.trim().toLowerCase() === b.trim().toLowerCase() : sameValue(asKey(key), a, b));

export function EnrichDialog({ initialQuery, existing, onClose, onApply }: {
  initialQuery: string; existing?: Company; onClose: () => void; onApply: (r: EnrichApply) => Promise<void> | void;
}) {
  const online = useOnline();
  const [query, setQuery] = useState(initialQuery);
  const [step, setStep] = useState<'search' | 'results' | 'preview'>('search');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<SearchResult | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [all] = useLive(() => db.companies.toArray(), [], [] as Company[]);
  const local = useMemo(() => (existing || query.trim().length < 3 ? [] : localMatches(query, all)), [existing, query, all]);

  const search = async () => {
    if (query.trim().length < 3 || busy) return;
    setBusy(true); setPicked([]); setShowAll(false);
    try { setRes(await searchCompanies(query, { fetch: (u, i) => fetch(u, i) })); setStep('results'); }
    finally { setBusy(false); }
  };

  const selected = picked.map((id) => res?.candidates.find((c) => c.id === id)).filter(Boolean) as Candidate[];
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Modal title={step === 'preview' ? 'Datos encontrados' : 'Buscar empresa'} onClose={onClose}>
      {step === 'search' && (
        <div className="stack">
          {!online && <div className="banner warn"><div className="banner-row"><WifiOff /><div className="grow">Sin conexión. Puedes crear o completar la ficha a mano; la búsqueda estará disponible cuando haya internet.</div></div></div>}
          <Field label="Nombre de la empresa">
            <input type="search" value={query} autoFocus onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void search(); }} placeholder="Ej.: Pastificio Di Martino" />
          </Field>
          <button className="btn primary block" disabled={!online || busy || query.trim().length < 3} onClick={() => void search()}><Search />Buscar empresa</button>
          {busy && <Spinner label="Consultando registros públicos…" />}
          <div className="small">
            Al buscar, <b>sólo el nombre</b> se envía a fuentes públicas y gratuitas: {SOURCES.map((s) => s.label).join(', ')}. No se envía nada más ni se guarda nada hasta que confirmes.
          </div>
        </div>
      )}

      {step === 'results' && res && (
        <div className="stack">
          <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setStep('search')}>‹ Cambiar búsqueda</button>
          {local.length > 0 && (
            <div className="banner info"><b>Ya en tu directorio</b>
              {local.map((c) => <div key={c.id}><a href={'#/c/' + c.id} onClick={onClose}>{c.name}</a> <span className="small">{[c.city, c.country].filter(Boolean).join(', ')}</span></div>)}
            </div>
          )}
          <div className="ninfo"><Info /><span>El parecido de nombre <b>no prueba</b> que sea la misma empresa: comprueba país, ciudad y nº de registro. Marca la correcta (puedes marcar varias de la misma empresa para combinar datos).</span></div>

          {res.candidates.length === 0 && (
            <div className="banner warn"><b>No hay coincidencias fiables</b> para «{query.trim()}». Muchas empresas pequeñas no figuran en estos registros gratuitos. Puedes crear la ficha normalmente.</div>
          )}
          <div className="stack" style={{ gap: 8 }}>
            {(showAll ? res.candidates : res.candidates.slice(0, 10)).map((c) => (
              <label key={c.id} className={'cand-row' + (picked.includes(c.id) ? ' on' : '')}>
                <input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} />
                <span className="grow">
                  <b className="cand-t">{c.title}</b>
                  <span className="small cand-s">{c.subtitle || '—'}</span>
                  <span className="row" style={{ gap: 6, marginTop: 4 }}>
                    <span className="chip outline">{c.sourceLabel}</span>
                    <span className={'chip ' + (c.score >= 0.95 ? 'ok' : 'warn')}>{c.score >= 0.95 ? 'Nombre idéntico' : 'Nombre parecido'}</span>
                    {c.inactive && <span className="chip err">Inactiva / baja</span>}
                    {c.logoUrl && <span className="chip info">Logo</span>}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {res.candidates.length > 10 && !showAll && <button className="btn sm" onClick={() => setShowAll(true)}>Mostrar {res.candidates.length - 10} más</button>}

          <details className="nmore">
            <summary>Fuentes consultadas</summary>
            <div className="stack" style={{ gap: 6 }}>
              {res.sources.map((s) => (
                <div key={s.id} className="small">
                  <b>{s.label}</b>: {s.status === 'ok' ? `${s.count} coincidencia(s)` : s.status === 'empty' ? 'sin coincidencias' : /429/.test(s.error ?? '') ? 'límite de uso alcanzado; reintenta en un minuto' : `no disponible (${s.error})`}
                </div>
              ))}
            </div>
          </details>
          <button className="btn primary block" disabled={selected.length === 0} onClick={() => setStep('preview')}>Ver datos de {selected.length === 1 ? 'la coincidencia' : `${selected.length} coincidencias`}</button>
        </div>
      )}

      {step === 'preview' && <Preview selected={selected} existing={existing} typedName={query} onBack={() => setStep('results')} onApply={onApply} onClose={onClose} />}
    </Modal>
  );
}

interface Row { use: boolean; value: string; cand: Candidate; optValue: string }

function Preview({ selected, existing, typedName, onBack, onApply, onClose }: {
  selected: Candidate[]; existing?: Company; typedName: string; onBack: () => void; onApply: (r: EnrichApply) => Promise<void> | void; onClose: () => void;
}) {
  const ui = useUi();
  const merged = useMemo(() => mergeCandidates(selected), [selected]);
  const keys = FIELD_ORDER.filter((k) => merged[k] && !(existing && k === 'name'));
  const cur = (k: FieldKey) => ((existing as unknown as Record<string, string | undefined>)?.[k] ?? '').toString();

  const [rows, setRows] = useState<Partial<Record<FieldKey, Row>>>(() => {
    const out: Partial<Record<FieldKey, Row>> = {};
    for (const k of keys) {
      const o = merged[k]![0];
      const c = cur(k);
      const status = !existing ? (k === 'name' && cmp('name', o.value, typedName) ? 'same' : 'new') : !c ? 'new' : cmp(k, c, o.value) ? 'same' : 'conflict';
      out[k] = { use: status === 'new' && !(k === 'name'), value: o.value, cand: o.cand, optValue: o.value };
    }
    return out;
  });
  const logoCand = selected.find((c) => c.logoUrl);
  const [useLogo, setUseLogo] = useState(!!logoCand && !existing?.logoMediaId);
  const [busy, setBusy] = useState(false);
  const logoPreview = logoCand?.logoUrl;

  const set = (k: FieldKey, p: Partial<Row>) => setRows((r) => ({ ...r, [k]: { ...r[k]!, ...p } }));
  const nUse = keys.filter((k) => rows[k]?.use && rows[k]!.value.trim()).length + (useLogo && logoCand ? 1 : 0);

  const apply = async () => {
    const fields: EnrichApply['fields'] = {};
    const chosen: Record<string, Chosen> = {};
    for (const k of keys) {
      const r = rows[k]!;
      const v = r.value.trim();
      if (!r.use || !v) continue;
      fields[k] = v;
      chosen[k] = { value: v, cand: r.cand, edited: v !== r.optValue };
    }
    const provenance = buildProvenance(chosen);
    let logo: EnrichApply['logo'];
    if (useLogo && logoCand?.logoUrl) {
      if (existing?.logoMediaId && await ui.confirm({ title: '¿Reemplazar el logo actual?', message: 'El logo actual se eliminará y se usará el encontrado.', confirmLabel: 'Reemplazar' }) !== true) return;
      logo = { url: logoCand.logoUrl, cand: logoCand };
      Object.assign(provenance, buildProvenance({ logo: { value: '', cand: logoCand, edited: false } }));
    }
    setBusy(true);
    try { await onApply({ fields, provenance, logo }); onClose(); }
    catch (e) { ui.toast(describeSaveError(e), 'err'); } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={onBack}>‹ Otras coincidencias</button>
      <div className="ninfo"><Info /><span>Se rellenará <b>sólo lo que marques</b>. {existing ? 'Lo que ya tiene la ficha no se sobrescribe salvo que lo marques tú.' : 'Puedes corregir cualquier valor antes de guardar.'} Procedencia: {[...new Set(selected.map((c) => c.sourceLabel))].join(' · ')}.</span></div>
      {selected.some((c) => c.inactive) && <div className="banner warn"><div className="banner-row"><AlertTriangle /><div className="grow">Alguna coincidencia figura como inactiva o dada de baja.</div></div></div>}

      {keys.length === 0 && !logoCand && <div className="banner warn">Estas coincidencias no aportan datos nuevos.</div>}
      {keys.map((k) => {
        const r = rows[k]!;
        const c = cur(k);
        const same = !!existing && !!c && cmp(k, c, merged[k]![0].value) && merged[k]!.length === 1;
        if (same) return <div key={k} className="small">✓ {FIELD_LABEL[k]}: ya coincide con la ficha.</div>;
        const conflict = !!existing && !!c;
        return (
          <div key={k} className={'diff' + (conflict ? ' conflict' : ' new')}>
            <label className="row nowrap">
              <input type="checkbox" checked={r.use} onChange={(e) => set(k, { use: e.target.checked })} />
              <b className="grow">{FIELD_LABEL[k]}</b>
              <span className={'chip ' + (conflict ? 'warn' : 'ok')}>{conflict ? 'Sustituiría' : 'Nuevo'}</span>
            </label>
            {conflict && <div className="small">Actual: <b>{c}</b></div>}
            {k === 'description' ? (
              <textarea value={r.value} onChange={(e) => set(k, { value: e.target.value, use: true })} aria-label={FIELD_LABEL[k]} style={{ minHeight: 80 }} />
            ) : (
              <input type="text" value={r.value} onChange={(e) => set(k, { value: e.target.value, use: true })} aria-label={FIELD_LABEL[k]} />
            )}
            <div className="small">Fuente: {r.cand.sourceLabel}{r.value.trim() !== r.optValue ? ' (editado por ti)' : ''}{' '}
              {r.cand.sourceUrl && <a href={r.cand.sourceUrl} target="_blank" rel="noopener noreferrer">ver registro <ExternalLink style={{ width: 12, height: 12, verticalAlign: '-1px' }} /></a>}</div>
            {merged[k]!.length > 1 && (
              <div className="alts" aria-label="Valores alternativos">
                {merged[k]!.filter((o) => o.value !== r.optValue).map((o) => (
                  <button key={o.value} type="button" className="chip alt" onClick={() => set(k, { value: o.value, optValue: o.value, cand: o.cand, use: true })}>{o.value.length > 48 ? o.value.slice(0, 48) + '…' : o.value} · {o.cand.sourceLabel.split(' (')[0]}</button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {logoCand && logoPreview && (
        <div className="diff new">
          <label className="row nowrap">
            <input type="checkbox" checked={useLogo} onChange={(e) => setUseLogo(e.target.checked)} />
            <b className="grow">Logo</b>
            <span className={'chip ' + (existing?.logoMediaId ? 'warn' : 'ok')}>{existing?.logoMediaId ? 'Sustituiría' : 'Nuevo'}</span>
          </label>
          <div className="row nowrap"><img src={logoPreview} alt="Logo encontrado" referrerPolicy="no-referrer" style={{ width: 72, height: 72, objectFit: 'contain', background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 4 }} />
            <div className="small">Fuente: {logoCand.sourceLabel}. El logo es marca de la empresa: se usa sólo para identificarla en tu ficha.</div></div>
        </div>
      )}
      <button className="btn primary block lg" disabled={busy || nUse === 0} onClick={() => void apply()}>{busy ? 'Guardando…' : existing ? `Rellenar la ficha (${nUse})` : `Usar estos datos (${nUse})`}</button>
    </div>
  );
}

// ---------- aplicar ----------
/** Descarga el logo (CORS permitido por Wikimedia), lo normaliza a PNG y lo guarda como logo de la empresa. */
export async function attachLogoFromUrl(companyId: string, url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!r.ok) return false;
    await setCompanyLogo(companyId, await renderLogo(await r.blob()));
    return true;
  } catch { return false; }
}

/** Aplica a una empresa EXISTENTE: sólo los campos confirmados, con su procedencia. */
export async function applyToCompany(companyId: string, r: EnrichApply, ui: ReturnType<typeof useUi>): Promise<void> {
  const cur = await db.companies.get(companyId);
  if (!cur) throw new Error('Empresa no encontrada');
  const { name: _name, ...fields } = r.fields; void _name; // el nombre comercial de una ficha existente no se cambia desde aquí
  const patch: Partial<Company> = { ...fields };
  const { logo: logoProv, ...fieldProv } = r.provenance; // la procedencia del logo sólo se guarda si el logo se descarga
  if (Object.keys(fieldProv).length) patch.provenance = { ...(cur.provenance ?? {}), ...fieldProv };
  if (Object.keys(patch).length) await updateCompany(companyId, patch);
  if (r.logo) {
    const ok = await attachLogoFromUrl(companyId, r.logo.url);
    if (ok) await updateCompany(companyId, { provenance: { ...((await db.companies.get(companyId))?.provenance ?? {}), logo: logoProv } });
    else ui.toast('No se pudo descargar el logo; el resto de datos se guardó.', 'err');
  }
}
