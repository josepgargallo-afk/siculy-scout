import { useMemo, useState } from 'react';
import { db } from '../lib/db';
import { listCompanies } from '../lib/repo';
import { getBackupStatus } from '../lib/backup';
import { stripAccents } from '../lib/duplicates';
import { PRIORITY_LABEL, TYPE_LABEL, type CompanyType, type Priority } from '../lib/types';
import { Header } from './kit';
import { navigate } from './router';
import { useLive } from './hooks';

const norm = (s?: string) => stripAccents(s ?? '').toLowerCase();

export function Directory() {
  const [rows, ready] = useLive(listCompanies, [], []);
  const [people] = useLive(async () => (await db.contacts.toArray()).map((c) => ({ companyId: c.companyId, text: norm(`${c.fullName} ${c.email ?? ''}`) })), [], []);
  const [status] = useLive(() => getBackupStatus(), [], null);
  const [q, setQ] = useState('');
  const [type, setType] = useState<'' | CompanyType>('');
  const [prio, setPrio] = useState<'' | Priority>('');
  const [country, setCountry] = useState('');
  const [event, setEvent] = useState('');

  const countries = useMemo(() => [...new Set(rows.map((r) => r.company.country).filter(Boolean) as string[])].sort(), [rows]);
  const events = useMemo(() => [...new Set(rows.flatMap((r) => r.events))].sort(), [rows]);

  const filtered = useMemo(() => {
    const nq = norm(q.trim());
    const byCompany = new Map<string, string>();
    people.forEach((p) => byCompany.set(p.companyId, (byCompany.get(p.companyId) ?? '') + ' ' + p.text));
    return rows.filter(({ company: c, events: ev }) => {
      if (type && c.type !== type && !(c.type === 'both')) return false;
      if (prio && c.priority !== prio) return false;
      if (country && c.country !== country) return false;
      if (event && !ev.includes(event)) return false;
      if (!nq) return true;
      const hay = norm(`${c.name} ${c.legalName ?? ''} ${c.city ?? ''} ${c.productsOfInterest.join(' ')}`) + (byCompany.get(c.id) ?? '');
      return hay.includes(nq);
    });
  }, [rows, people, q, type, prio, country, event]);

  return (
    <>
      <Header title="Siculy Scout" right={<span className="small" style={{ color: '#cfe0ec', paddingRight: 8 }}>{rows.length} empresas</span>} />
      <div className="page">
        {status?.shouldWarn && (
          <div className="banner warn">
            <b>Tienes datos sin copia de seguridad{status.lastBackupAt ? ` (última: hace ${Math.round(status.hoursSince ?? 0)} h)` : ''}.</b>
            <div><a className="btn sm gold" href="#/backup">Hacer copia ahora</a></div>
          </div>
        )}
        <div className="search">
          <input type="search" placeholder="Buscar empresa, contacto, producto…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        </div>
        <div className="filters">
          <select value={type} onChange={(e) => setType(e.target.value as '' | CompanyType)} aria-label="Tipo">
            <option value="">Todos los tipos</option>
            {(['supplier', 'prospect'] as const).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
          <select value={prio} onChange={(e) => setPrio(e.target.value as '' | Priority)} aria-label="Prioridad">
            <option value="">Toda prioridad</option>
            {(['high', 'medium', 'low'] as const).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
          <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="País">
            <option value="">Todos los países</option>
            {countries.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select value={event} onChange={(e) => setEvent(e.target.value)} aria-label="Evento">
            <option value="">Todos los eventos</option>
            {events.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>

        {!ready ? null : rows.length === 0 ? (
          <div className="empty">
            <p><b>Aún no hay empresas.</b></p>
            <p>Pulsa «Nueva empresa» para crear la primera. Basta con el nombre.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">Ninguna empresa coincide con la búsqueda o los filtros.</div>
        ) : filtered.map(({ company: c, contactCount, mediaCount, events: ev }) => (
          <a key={c.id} className="item" href={'#/c/' + c.id}>
            <div className="t"><span className={'dot ' + c.priority} title={'Prioridad ' + PRIORITY_LABEL[c.priority]} />{c.name}</div>
            <div className="m">
              <span className={'chip ' + c.type}>{TYPE_LABEL[c.type]}</span>
              {(c.country || c.city) && <span>{[c.city, c.country].filter(Boolean).join(', ')}</span>}
              <span>👤 {contactCount}</span>
              <span>📷 {mediaCount}</span>
              {ev[0] && <span>{ev[0]}</span>}
            </div>
          </a>
        ))}
      </div>
      <button className="fab" onClick={() => navigate('/new')}>＋ Nueva empresa</button>
    </>
  );
}
