import { useEffect, useMemo, useState } from 'react';
import { BrandLogo, BrandAppIcon, BRAND_DESCRIPTION, BRAND_MESSAGE, BRAND_TAGLINE } from './Brand';
import { ChevronRight, Image as ImageIcon, MapPin, Plus, Search, ShieldAlert, User } from 'lucide-react';
import { clearAllOpen } from './reveal';
import { Logo } from './Logo';
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
  useEffect(() => { clearAllOpen(); }, []); // al entrar en una empresa desde aquí, la ficha vuelve a estar plegada
  const [rows, ready] = useLive(listCompanies, [], []);
  const [people] = useLive(async () => (await db.contacts.toArray()).map((c) => ({ companyId: c.companyId, text: norm(`${c.fullName} ${c.email ?? ''}`) })), [], []);
  const [status] = useLive(() => getBackupStatus(), [], null);
  const [logos] = useLive(async () => {
    const ids = rows.map((r) => r.company.logoMediaId).filter(Boolean) as string[];
    const ms = await db.media.bulkGet(ids);
    return new Map(ms.filter(Boolean).map((m) => [m!.id, m!.blob] as const));
  }, [rows], new Map<string, Blob>());
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

  const filtering = !!(q.trim() || type || prio || country || event);
  return (
    <>
      <Header
        title={<span className="brand"><BrandLogo size={32} /></span>}
        right={ready && rows.length > 0 ? <span className="topbar-count">{rows.length} {rows.length === 1 ? 'empresa' : 'empresas'}</span> : null}
      />
      <div className="page">
        {status?.shouldWarn && (
          <div className="banner warn">
            <div className="banner-row"><ShieldAlert />
              <div className="grow"><b>Tienes datos sin copia de seguridad{status.lastBackupAt ? ` (última: hace ${Math.round(status.hoursSince ?? 0)} h)` : ''}.</b>
                <div><a className="btn sm accent" href="#/backup">Hacer copia ahora</a></div></div>
            </div>
          </div>
        )}
        {rows.length > 0 && (
          <>
            <div className="search">
              <div className="search-box"><Search />
                <input type="search" placeholder="Buscar empresa, contacto, producto…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
              </div>
            </div>
            <div className="filters">
              <select className={type ? 'on' : ''} value={type} onChange={(e) => setType(e.target.value as '' | CompanyType)} aria-label="Tipo">
                <option value="">Todos los tipos</option>
                {(['supplier', 'prospect'] as const).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
              <select className={prio ? 'on' : ''} value={prio} onChange={(e) => setPrio(e.target.value as '' | Priority)} aria-label="Prioridad">
                <option value="">Toda prioridad</option>
                {(['high', 'medium', 'low'] as const).map((p) => <option key={p} value={p}>Prioridad {PRIORITY_LABEL[p].toLowerCase()}</option>)}
              </select>
              <select className={country ? 'on' : ''} value={country} onChange={(e) => setCountry(e.target.value)} aria-label="País">
                <option value="">Todos los países</option>
                {countries.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select className={event ? 'on' : ''} value={event} onChange={(e) => setEvent(e.target.value)} aria-label="Evento">
                <option value="">Todos los eventos</option>
                {events.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            {filtering && <div className="list-meta">{filtered.length} de {rows.length}</div>}
          </>
        )}

        {!ready ? null : rows.length === 0 ? (
          <div className="empty welcome">
            <BrandAppIcon size={72} />
            <span className="claim">{BRAND_TAGLINE}</span>
            <p className="msg">{BRAND_MESSAGE}</p>
            <p className="desc">{BRAND_DESCRIPTION}</p>
            <p className="hint">Aún no hay empresas. Crea la primera con «Nueva empresa» o escaneando una tarjeta: basta con el nombre.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <span className="empty-ic"><Search /></span>
            <b>Sin resultados</b>
            <p>Ninguna empresa coincide con la búsqueda o los filtros.</p>
          </div>
        ) : filtered.map(({ company: c, contactCount, mediaCount, events: ev }) => (
          <a key={c.id} className="item li" href={'#/c/' + c.id}>
            <Logo name={c.name} blob={c.logoMediaId ? logos.get(c.logoMediaId) : undefined} size={52} />
            <div className="li-b">
              <div className="t">{c.name}</div>
              <div className="m">
                <span className={'chip ' + c.type}>{TYPE_LABEL[c.type]}</span>
                <span className="meta" title={'Prioridad ' + PRIORITY_LABEL[c.priority]}><span className={'dot ' + c.priority} />{PRIORITY_LABEL[c.priority]}</span>
                {(c.country || c.city) && <span className="meta"><MapPin />{[c.city, c.country].filter(Boolean).join(', ')}</span>}
              </div>
              <div className="m">
                <span className="meta" aria-label={contactCount + ' contactos'}><User />{contactCount}</span>
                <span className="meta" aria-label={mediaCount + ' archivos'}><ImageIcon />{mediaCount}</span>
                {ev[0] && <span className="meta">{ev[0]}</span>}
              </div>
            </div>
            <span className="li-chev" aria-hidden="true"><ChevronRight /></span>
          </a>
        ))}
      </div>
      <button className="fab" onClick={() => navigate('/new')}><Plus />Nueva empresa</button>
    </>
  );
}
