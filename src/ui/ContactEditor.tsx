import { useEffect, useRef, useState } from 'react';
import { db } from '../lib/db';
import { deleteContact, saveContact } from '../lib/repo';
import { findContactDuplicates } from '../lib/duplicates';
import { describeSaveError } from '../lib/storage';
import { ContactFieldsForm, emptyContact, fromContact, toContactPatch, type ContactFields } from './ContactForm';
import { Header, useUi } from './kit';
import { navigate } from './router';
import { useDraft, useLive, useObjectUrl, useSettings } from './hooks';

export function ContactEditor({ companyId, contactId }: { companyId: string; contactId: string }) {
  const isNew = contactId === 'new';
  const [company] = useLive(() => db.companies.get(companyId), [companyId], undefined);
  const [existing, ready] = useLive(() => (isNew ? undefined : db.contacts.get(contactId)), [contactId], undefined);
  const [card] = useLive(async () => (existing?.cardPhotoId ? db.media.get(existing.cardPhotoId) : undefined), [existing?.cardPhotoId], undefined);
  const cardUrl = useObjectUrl(card?.blob);
  const s = useSettings();
  const ui = useUi();
  const key = `contact:${companyId}:${contactId}`;
  const [form, set, discard, recovered] = useDraft<ContactFields>(key, emptyContact, isNew);
  const [loaded, setLoaded] = useState(isNew);
  const [saving, setSaving] = useState(false);

  // Contacto existente: se carga una vez, salvo que haya un borrador sin guardar.
  useEffect(() => {
    if (!isNew && existing && !loaded) {
      if (!recovered) set(fromContact(existing));
      setLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, isNew, loaded]);

  // Contacto existente: autoguardado silencioso al salir u ocultar la app (sin diálogo de duplicados: ya es el mismo contacto).
  const latest = useRef(form); latest.current = form;
  const baseline = useRef(""); 
  useEffect(() => { if (existing && loaded && !baseline.current) baseline.current = JSON.stringify(fromContact(existing)); }, [existing, loaded]);
  useEffect(() => {
    if (isNew) return;
    const flush = () => {
      const p = toContactPatch(latest.current);
      if (!baseline.current || JSON.stringify(latest.current) === baseline.current) return;
      if (!p.fullName && !p.email && !p.phone && !p.mobile) return;
      baseline.current = JSON.stringify(latest.current);
      void saveContact({ id: contactId, companyId, ...p }).catch(() => { baseline.current = ""; });
    };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    return () => { document.removeEventListener("visibilitychange", onHide); flush(); };
  }, [isNew, contactId, companyId]);

  if (!isNew && ready && !existing) {
    return <><Header title="Contacto" back /><div className="page"><div className="banner warn">Este contacto no existe.</div></div></>;
  }

  const save = async () => {
    const patch = toContactPatch(form);
    if (!patch.fullName && !patch.email && !patch.phone && !patch.mobile) { ui.toast('Indica al menos nombre, email o teléfono', 'err'); return; }
    if (saving) return;
    setSaving(true);
    try {
      const others = await db.contacts.where('companyId').equals(companyId).toArray();
      const dups = findContactDuplicates(patch, others, isNew ? undefined : contactId);
      if (dups.length) {
        const d = dups[0].contact;
        const why = { 'same-email': 'el mismo email', 'same-phone': 'el mismo teléfono', 'same-name': 'el mismo nombre' }[dups[0].reason];
        const ans = await ui.confirm({
          title: 'Posible contacto duplicado',
          message: <>Ya existe <b>{d.fullName || d.email}</b> en esta empresa con {why}. No se sobrescribirá nada sin tu confirmación.</>,
          confirmLabel: 'Guardar de todos modos',
          extra: [{ label: 'Abrir el existente', value: 'open' }],
        });
        if (ans === 'open') { navigate(`/c/${companyId}/contact/${d.id}`, { replace: true }); return; }
        if (ans !== true) return;
      }
      await saveContact({ ...(isNew ? {} : { id: contactId }), companyId, ...patch });
      discard();
      navigate('/c/' + companyId, { replace: true });
    } catch (e) { ui.toast(describeSaveError(e), 'err'); } finally { setSaving(false); }
  };

  const remove = async () => {
    if (await ui.confirm({ title: '¿Eliminar contacto?', message: 'Se borrará también la foto de su tarjeta, si la tiene.', confirmLabel: 'Eliminar', danger: true }) === true) {
      baseline.current = JSON.stringify(latest.current); await deleteContact(contactId); discard(); navigate('/c/' + companyId, { replace: true });
    }
  };

  return (
    <>
      <Header title={isNew ? 'Nuevo contacto' : 'Contacto'} back={'/c/' + companyId} />
      <div className="page stack">
        <div className="small">Empresa: <b>{company?.name ?? '…'}</b></div>
        {recovered && <div className="banner info">Se recuperó un borrador sin guardar.</div>}
        {isNew && (s.ocrEnabled || s.qrEnabled) && (
          <div className="grid2">
            {s.ocrEnabled && <button className="btn" onClick={() => navigate('/scan/card?c=' + companyId)}>📇 Desde tarjeta</button>}
            {s.qrEnabled && <button className="btn" onClick={() => navigate('/scan/qr?c=' + companyId)}>▦ Desde QR</button>}
          </div>
        )}
        {cardUrl && <a href={cardUrl} target="_blank" rel="noopener"><img className="thumb-card" src={cardUrl} alt="Tarjeta de visita" /></a>}
        {existing && <div className="small">Capturado {new Date(existing.capturedAt).toLocaleString('es-ES')} · origen: {existing.captureSource}</div>}
        <div className="card"><ContactFieldsForm value={form} onChange={set} /></div>
        <div className="row">
          {!isNew && <button className="btn danger" onClick={() => void remove()}>Eliminar</button>}
          <span className="grow" />
          <button className="btn" onClick={() => { baseline.current = JSON.stringify(latest.current); discard(); navigate('/c/' + companyId); }}>Cancelar</button>
          <button className="btn primary" disabled={saving} onClick={() => void save()}>Guardar</button>
        </div>
      </div>
    </>
  );
}
