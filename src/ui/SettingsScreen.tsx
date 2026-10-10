import { useEffect, useState } from 'react';
import { APP_VERSION } from '../lib/backup';
import { isOcrCached, prepareOcrOffline } from '../lib/ocr';
import { saveSettings } from '../lib/settings';
import { speechSupported } from '../lib/speech';
import { formatBytes, getStorageInfo, requestPersistence, type StorageInfo } from '../lib/storage';
import { ORIGIN_LABEL, type OriginType } from '../lib/types';
import { Field, Header, useUi } from './kit';
import { useOnline, useSettings } from './hooks';

export function SettingsScreen() {
  const s = useSettings();
  const ui = useUi();
  const online = useOnline();
  const [cached, setCached] = useState<boolean | null>(null);
  const [prep, setPrep] = useState<string | null>(null);
  const [st, setSt] = useState<StorageInfo | null>(null);
  useEffect(() => { void isOcrCached(s.ocrLangs).then(setCached); void getStorageInfo().then(setSt); }, [s.ocrLangs]);

  const ev = s.event;
  const setEv = (p: Partial<typeof ev>) => saveSettings({ event: { ...ev, ...p } });

  return (
    <>
      <Header title="Ajustes" />
      <div className="page stack">
        <div className="card stack">
          <h2>Origen predeterminado de nuevas empresas</h2>
          <Field label="Tipo"><select value={ev.originType} onChange={(e) => setEv({ originType: e.target.value as OriginType })}>
            {(Object.keys(ORIGIN_LABEL) as OriginType[]).map((o) => <option key={o} value={o}>{ORIGIN_LABEL[o]}</option>)}</select></Field>
          <Field label="Evento"><input type="text" value={ev.eventName} onChange={(e) => setEv({ eventName: e.target.value })} /></Field>
          <div className="grid2">
            <Field label="Ciudad"><input type="text" value={ev.city} onChange={(e) => setEv({ city: e.target.value })} /></Field>
            <Field label="País"><input type="text" value={ev.country} onChange={(e) => setEv({ country: e.target.value })} /></Field>
          </div>
        </div>

        <div className="card stack">
          <h2>Funciones opcionales</h2>
          <div className="small">Si alguna no funciona bien en la feria, desactívala: el resto de la app no se ve afectado.</div>
          <label className="row"><input type="checkbox" checked={s.ocrEnabled} onChange={(e) => saveSettings({ ocrEnabled: e.target.checked })} /> Escáner de tarjetas (OCR)</label>
          <label className="row"><input type="checkbox" checked={s.qrEnabled} onChange={(e) => saveSettings({ qrEnabled: e.target.checked })} /> Escáner de códigos QR</label>
          <label className="row"><input type="checkbox" checked={s.dictationEnabled} disabled={!speechSupported()}
            onChange={async (e) => {
              if (e.target.checked && await ui.confirm({
                title: 'Dictado del navegador',
                message: 'En Chrome, este dictado envía el audio a los servidores de Google para transcribirlo y necesita Internet. No cuesta dinero, pero NO es local. La alternativa privada y gratuita es el icono de micrófono del teclado del móvil. ¿Activarlo?',
                confirmLabel: 'Activar',
              }) !== true) return;
              saveSettings({ dictationEnabled: e.target.checked });
            }} /> Botón de dictado del navegador (envía audio a Google) {!speechSupported() && '— no disponible'}</label>
        </div>

        <div className="card stack">
          <h2>OCR sin conexión</h2>
          {cached ? <div className="saved">✓ Recursos OCR guardados en este móvil.</div> : <div className="banner warn">Recursos OCR no guardados todavía (~25 MB, una sola vez).</div>}
          <button className="btn" disabled={!online || !!prep || !!cached} onClick={async () => {
            try { await prepareOcrOffline(s.ocrLangs, (d, t) => setPrep(`Descargando ${d}/${t}…`)); setPrep(null); setCached(true); ui.toast('OCR listo sin conexión'); }
            catch (e) { setPrep(null); ui.toast((e as Error).message, 'err'); }
          }}>{prep ?? (cached ? 'Ya descargado' : online ? 'Descargar ahora' : 'Necesitas conexión')}</button>
          <div className="small">Los archivos vienen de esta misma app (no de terceros) y se guardan en el móvil.</div>
        </div>

        <div className="card stack">
          <h2>Almacenamiento</h2>
          <div className="small">Usado {formatBytes(st?.usage)} de {formatBytes(st?.quota)}. Protegido contra borrado automático: {st?.persisted == null ? '—' : st.persisted ? 'sí' : 'no'}.</div>
          {st?.persisted === false && <button className="btn" onClick={async () => { const ok = await requestPersistence(); ui.toast(ok ? 'Almacenamiento protegido' : 'El navegador no lo concedió (instala la app y prueba de nuevo)', ok ? 'ok' : 'err'); setSt(await getStorageInfo()); }}>Solicitar protección</button>}
        </div>

        <div className="card small">
          <b>Siculy Scout</b> v{APP_VERSION}. Datos 100 % locales en este dispositivo; no se envía nada a servidores. {online ? 'Conectado.' : 'Sin conexión.'}
        </div>
      </div>
    </>
  );
}
