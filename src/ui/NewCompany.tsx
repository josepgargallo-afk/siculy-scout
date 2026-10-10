import { useEffect, useRef, useState } from 'react';
import { db } from '../lib/db';
import { createCompany } from '../lib/repo';
import { findCompanyDuplicates, type CompanyMatch } from '../lib/duplicates';
import { describeSaveError } from '../lib/storage';
import { getSettings } from '../lib/settings';
import { TYPE_LABEL, type CompanyType } from '../lib/types';
import { Field, Header, useUi } from './kit';
import { navigate } from './router';
import { useDraft, useSettings } from './hooks';

const MATCH_WHY = { 'same-name': 'mismo nombre', 'similar-name': 'nombre parecido', 'same-domain': 'misma web' } as const;

export function NewCompany({ initialName = '' }: { initialName?: string }) {
  const ui = useUi();
  const s = useSettings();
  const [form, set, discard, recovered] = useDraft<{ name: string; type: CompanyType }>('newCompany', { name: initialName, type: 'prospect' });
  const [matches, setMatches] = useState<CompanyMatch[]>([]);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      if (form.name.trim().length < 3) { if (alive) setMatches([]); return; }
      const all = await db.companies.toArray();
      if (alive) setMatches(findCompanyDuplicates(form.name, all).slice(0, 4));
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [form.name]);

  async function save(next: 'open' | 'again') {
    const name = form.name.trim();
    if (!name) { nameRef.current?.focus(); ui.toast('Escribe el nombre de la empresa', 'err'); return; }
    if (busy) return;
    setBusy(true);
    try {
      const all = await db.companies.toArray();
      const dups = findCompanyDuplicates(name, all).slice(0, 3);
      if (dups.length) {
        const ans = await ui.confirm({
          title: 'Posible empresa duplicada',
          message: <ul style={{ paddingLeft: 18, margin: 0 }}>{dups.map((d) => <li key={d.company.id}><b>{d.company.name}</b> <span className="small">({MATCH_WHY[d.reason]}{d.company.country ? ', ' + d.company.country : ''})</span></li>)}</ul>,
          confirmLabel: 'Crear de todos modos',
          extra: dups.map((d) => ({ label: `Abrir «${d.company.name}»`, value: 'open:' + d.company.id })),
        });
        if (typeof ans === 'string' && ans.startsWith('open:')) { discard(); navigate('/c/' + ans.slice(5)); return; }
        if (ans !== true) return;
      }
      const c = await createCompany({ name, type: form.type }, { ...getSettings().event });
      discard();
      if (next === 'open') navigate('/c/' + c.id, { replace: true });
      else { set({ name: '' }); ui.toast(`«${c.name}» guardada`); nameRef.current?.focus(); }
    } catch (e) {
      ui.toast(describeSaveError(e), 'err');
    } finally { setBusy(false); }
  }

  return (
    <>
      <Header title="Nueva empresa" back="/" />
      <div className="page stack">
        {recovered && form.name && <div className="banner info">Se recuperó el borrador que estabas escribiendo.</div>}
        <div className="card stack">
          <Field label="Nombre comercial *">
            <input ref={nameRef} type="text" value={form.name} autoComplete="off" autoCapitalize="words" enterKeyHint="done"
              onChange={(e) => set({ name: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') void save('open'); }} placeholder="Ej.: Surgelati Mare S.r.l." />
          </Field>
          {matches.length > 0 && (
            <div className="banner warn">
              <b>¿Ya la tienes?</b>
              {matches.map((m) => (
                <div key={m.company.id}><a href={'#/c/' + m.company.id}>{m.company.name}</a> <span className="small">({MATCH_WHY[m.reason]})</span></div>
              ))}
            </div>
          )}
          <div className="seg" role="group" aria-label="Tipo">
            {(['prospect', 'supplier', 'both'] as const).map((t) => (
              <button key={t} type="button" className={form.type === t ? 'on' : ''} onClick={() => set({ type: t })}>{TYPE_LABEL[t]}</button>
            ))}
          </div>
          <div className="small">Origen: {s.event.eventName} · {s.event.city} (editable en la ficha y en Ajustes). El resto de datos puedes completarlo después.</div>
          <button className="btn primary block" disabled={busy} onClick={() => void save('open')}>Guardar y abrir ficha</button>
          <button className="btn block" disabled={busy} onClick={() => void save('again')}>Guardar y crear otra</button>
        </div>

        {(s.ocrEnabled || s.qrEnabled) && (
          <div className="card">
            <h2>O créala desde un contacto</h2>
            <div className="grid2">
              {s.ocrEnabled && <button className="btn" onClick={() => navigate('/scan/card')}>📇 Escanear tarjeta</button>}
              {s.qrEnabled && <button className="btn" onClick={() => navigate('/scan/qr')}>▦ Escanear QR</button>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
