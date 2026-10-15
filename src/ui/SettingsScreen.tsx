import { useEffect, useState } from 'react';
import { AudioLines, CheckCircle2, Download, HardDrive, MapPin, ScanText, ToggleRight, Trash2 } from 'lucide-react';
import { WHISPER_LANG_CHOICES } from '../lib/audioPrep';
import { MODEL_INFO, type WhisperModel } from '../lib/whisperModels';
import { installWhisper, kickTranscription, removeWhisperModel } from '../lib/whisperClient';
import { pendingCount } from '../lib/transcribe';
import { formatBytes as fmtB } from '../lib/storage';
import { APP_VERSION } from '../lib/backup';
import { BrandLogo, BRAND_TAGLINE } from './Brand';
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
  const [wprog, setWprog] = useState<string | null>(null);
  const [pend, setPend] = useState(0);
  useEffect(() => { void pendingCount().then(setPend); }, [wprog, s.transcriptionEnabled]);
  useEffect(() => { void isOcrCached(s.ocrLangs).then(setCached); void getStorageInfo().then(setSt); }, [s.ocrLangs]);

  const ev = s.event;
  const setEv = (p: Partial<typeof ev>) => saveSettings({ event: { ...ev, ...p } });

  return (
    <>
      <Header title="Ajustes" />
      <div className="page stack">
        <div className="card stack">
          <h2 className="card-title"><span className="ic-tile"><MapPin /></span>Origen de nuevas empresas</h2>
          <Field label="Tipo"><select value={ev.originType} onChange={(e) => setEv({ originType: e.target.value as OriginType })}>
            {(Object.keys(ORIGIN_LABEL) as OriginType[]).map((o) => <option key={o} value={o}>{ORIGIN_LABEL[o]}</option>)}</select></Field>
          <Field label="Evento"><input type="text" value={ev.eventName} onChange={(e) => setEv({ eventName: e.target.value })} /></Field>
          <div className="grid2">
            <Field label="Ciudad"><input type="text" value={ev.city} onChange={(e) => setEv({ city: e.target.value })} /></Field>
            <Field label="País"><input type="text" value={ev.country} onChange={(e) => setEv({ country: e.target.value })} /></Field>
          </div>
        </div>

        <div className="card stack">
          <h2 className="card-title"><span className="ic-tile"><ToggleRight /></span>Funciones opcionales</h2>
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
          <h2 className="card-title"><span className="ic-tile"><ScanText /></span>OCR sin conexión</h2>
          {cached ? <div className="status-line ok"><CheckCircle2 />Recursos OCR guardados en este móvil</div> : <div className="banner warn">Recursos OCR no guardados todavía (~25 MB, una sola vez).</div>}
          <button className="btn" disabled={!online || !!prep || !!cached} onClick={async () => {
            try { await prepareOcrOffline(s.ocrLangs, (d, t) => setPrep(`Descargando ${d}/${t}…`)); setPrep(null); setCached(true); ui.toast('OCR listo sin conexión'); }
            catch (e) { setPrep(null); ui.toast((e as Error).message, 'err'); }
          }}><Download />{prep ?? (cached ? 'Ya descargado' : online ? 'Descargar ahora' : 'Necesitas conexión')}</button>
          <div className="small">Los archivos vienen de esta misma app (no de terceros) y se guardan en el móvil.</div>
        </div>

        <div className="card stack">
          <h2 className="card-title"><span className="ic-tile"><AudioLines /></span><span className="grow">Transcripción de audio</span><span className="chip warn">Experimental</span></h2>
          <div className="small">
            Convierte cada grabación en una nota de texto editable, <b>en el propio móvil</b>, sin coste y sin enviar el audio a ningún sitio.
            Usa Whisper (modelo abierto). Se descarga <b>una sola vez</b> desde Hugging Face (sólo el modelo, ~{MODEL_INFO[s.whisperModel].mb} MB, con Wi-Fi) y después funciona sin conexión.
          </div>
          <div className="banner warn">No está validada en Android: puede ser lenta (30 s de audio pueden tardar de decenas de segundos a minutos) o gastar batería. El audio siempre se conserva aunque falle. La transcripción es <b>literal y puede contener errores</b>: revísala antes de fiarte de nombres, cifras o precios.</div>
          <Field label="Modelo" hint={MODEL_INFO[s.whisperModel].hint}>
            <select value={s.whisperModel} disabled={!!wprog} onChange={(e) => saveSettings({ whisperModel: e.target.value as WhisperModel })}>
              {(Object.keys(MODEL_INFO) as WhisperModel[]).map((k) => <option key={k} value={k}>{MODEL_INFO[k].label} · {MODEL_INFO[k].mb} MB</option>)}
            </select>
          </Field>
          <Field label="Vocabulario propio" hint="Productos, marcas y nombres separados por comas. Orienta la ortografía del modelo; NO cambia lo que se dice ni corrige textos.">
            <textarea value={s.transcriptionGlossary} onChange={(e) => saveSettings({ transcriptionGlossary: e.target.value })} placeholder="cannoli, pistacchio di Bronte, arancini, caponata…" style={{ minHeight: 120 }} />
          </Field>
          <label className="row"><input type="checkbox" checked={s.rawMic} onChange={(e) => saveSettings({ rawMic: e.target.checked })} /> Grabar sin filtros de llamada del navegador (experimental; prueba si mejora)</label>
          <Field label="Idioma de los audios" hint="«Auto» detecta sólo entre español, italiano, inglés y francés (no usa el modo libre de Whisper, que traduce o repite). Un idioma equivocado destroza la transcripción: ante la duda, elígelo.">
            <select value={s.transcriptionLang} onChange={(e) => saveSettings({ transcriptionLang: e.target.value })}>
              {Object.entries(WHISPER_LANG_CHOICES).map(([k, v]) => <option key={k} value={k}>{v === 'Auto' ? 'Auto (detecta entre es/it/en/fr)' : v}</option>)}
            </select>
          </Field>
          {s.whisperInstalled === s.whisperModel ? <div className="status-line ok"><CheckCircle2 />Modelo «{s.whisperInstalled}» instalado en este móvil</div> : (
            <button className="btn" disabled={!online || !!wprog} onClick={async () => {
              if (s.whisperModel === 'small' && await ui.confirm({
                title: 'Modelo grande (241 MB)',
                message: 'Small es mucho más preciso que Base, pero pesa 241 MB, usa más memoria y es más lento (en un móvil, una nota de 30 s puede tardar minutos). Descárgalo sólo con Wi-Fi. Puedes volver a Base en cualquier momento.',
                confirmLabel: 'Descargar Small',
              }) !== true) return;
              try {
                setWprog('Descargando… 0 %');
                await installWhisper(s.whisperModel, (l, t) => setWprog(t ? `Descargando… ${Math.round((100 * l) / t)} % (${fmtB(l)} de ${fmtB(t)})` : 'Preparando…'));
                setWprog(null); ui.toast('Modelo instalado');
              } catch (e) { setWprog(null); ui.toast('No se pudo instalar: ' + (e as Error).message, 'err'); }
            }}><Download />{wprog ?? (online ? 'Descargar modelo' : 'Necesitas conexión para descargarlo')}</button>
          )}
          <label className="row"><input type="checkbox" checked={s.transcriptionEnabled} disabled={!s.whisperInstalled}
            onChange={(e) => { saveSettings({ transcriptionEnabled: e.target.checked }); if (e.target.checked) void kickTranscription(); }} /> Transcribir automáticamente después de cada grabación</label>
          {pend > 0 && <div className="row"><span className="small grow">{pend} audio(s) en cola.</span><button className="btn sm" onClick={() => { void kickTranscription({ force: true }); ui.toast('Procesando la cola…'); }}>Procesar ahora</button></div>}
          {s.whisperInstalled && <button className="btn sm" onClick={async () => { if (await ui.confirm({ title: '¿Quitar el modelo?', message: 'Se libera el espacio. Los audios y notas no se tocan.', confirmLabel: 'Quitar' }) === true) { await removeWhisperModel(); ui.toast('Modelo eliminado'); } }}><Trash2 />Quitar modelo (liberar espacio)</button>}
        </div>

        <div className="card stack">
          <h2 className="card-title"><span className="ic-tile"><HardDrive /></span>Almacenamiento</h2>
          <div className="small">Usado {formatBytes(st?.usage)} de {formatBytes(st?.quota)}. Protegido contra borrado automático: {st?.persisted == null ? '—' : st.persisted ? 'sí' : 'no'}.</div>
          {st?.persisted === false && <button className="btn" onClick={async () => { const ok = await requestPersistence(); ui.toast(ok ? 'Almacenamiento protegido' : 'El navegador no lo concedió (instala la app y prueba de nuevo)', ok ? 'ok' : 'err'); setSt(await getStorageInfo()); }}>Solicitar protección</button>}
        </div>

        <div className="app-foot">
          <BrandLogo size={30} />
          <span className="claim">{BRAND_TAGLINE}</span>
          v{APP_VERSION} (antes Siculy Scout) · Datos 100 % locales en este dispositivo; no se envía nada a servidores · {online ? 'Conectado' : 'Sin conexión'}
        </div>
      </div>
    </>
  );
}
