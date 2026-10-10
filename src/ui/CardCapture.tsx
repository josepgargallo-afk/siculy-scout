import { useEffect, useMemo, useRef, useState } from 'react';
import { parseCardText, type CardFields } from '../lib/ocrParse';
import { OCR_LANG_LABEL, isOcrCached, prepareOcrOffline, runOcr } from '../lib/ocr';
import { optimizeImage } from '../lib/image';
import { saveSettings } from '../lib/settings';
import { CaptureConfirm } from './capture';
import { emptyContact, type ContactFields } from './ContactForm';
import { Header, Spinner, useUi } from './kit';
import { useOnline, useSettings } from './hooks';

function toFields(f: CardFields): { fields: ContactFields; flags: string[]; company: string } {
  return {
    fields: {
      ...emptyContact,
      fullName: f.fullName ?? '', role: f.role ?? '', email: f.email ?? '', phone: f.phone ?? '', mobile: f.mobile ?? '',
      webOrLinkedin: f.web ?? '',
      notes: [f.address && `Dirección: ${f.address}`, ...f.extras].filter(Boolean).join('\n'),
    },
    flags: f.uncertain,
    company: f.company ?? '',
  };
}

type Step = { s: 'pick' } | { s: 'busy'; label: string; pct: number } | { s: 'confirm'; image: Blob; text: string; failed?: string };

export function CardCapture({ companyId }: { companyId?: string }) {
  const ui = useUi();
  const set = useSettings();
  const online = useOnline();
  const [step, setStep] = useState<Step>({ s: 'pick' });
  const [cached, setCached] = useState<boolean | null>(null);
  const [prep, setPrep] = useState<string | null>(null);
  const [skipOcr, setSkipOcr] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void isOcrCached(set.ocrLangs).then(setCached); }, [set.ocrLangs]);

  if (!set.ocrEnabled) return <><Header title="Escanear tarjeta" back /><div className="page"><div className="banner info">El escáner de tarjetas está desactivado en Ajustes.</div></div></>;

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // La foto de la tarjeta se conserva SIEMPRE, aunque el OCR falle.
    let image: Blob;
    try { image = (await optimizeImage(file, 'card')).blob; }
    catch (err) { ui.toast((err as Error).message, 'err'); return; }
    if (skipOcr) { setStep({ s: 'confirm', image, text: '', failed: undefined }); return; }
    setStep({ s: 'busy', label: 'Preparando OCR…', pct: 0 });
    try {
      const out = await runOcr(image, set.ocrLangs, (label, pct) => setStep({ s: 'busy', label: label === 'recognizing text' ? 'Leyendo texto…' : 'Cargando OCR…', pct }));
      setStep({ s: 'confirm', image, text: out.text, failed: out.text.trim() ? undefined : 'No se detectó texto. Rellena los datos a mano; la foto se guardará.' });
    } catch (err) {
      setStep({ s: 'confirm', image, text: '', failed: `El OCR no se pudo ejecutar (${(err as Error).message}). ${online ? '' : 'Estás sin conexión y los recursos OCR no están descargados. '}Rellena a mano; la foto se guardará.` });
    }
  };

  const prepare = async () => {
    try {
      await prepareOcrOffline(set.ocrLangs, (d, t) => setPrep(`Descargando ${d}/${t}…`));
      setPrep(null); setCached(true); ui.toast('OCR listo para usar sin conexión');
    } catch (e) { setPrep(null); ui.toast((e as Error).message, 'err'); }
  };

  return (
    <>
      <Header title="Escanear tarjeta" back />
      <div className="page stack">
        {step.s === 'pick' && (
          <>
            <div className="card stack">
              <button className="btn primary block" style={{ minHeight: 64, fontSize: '1.1rem' }} onClick={() => camRef.current?.click()}>📷 Fotografiar tarjeta</button>
              <button className="btn block" onClick={() => galRef.current?.click()}>🖼 Elegir una foto de la galería</button>
              <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
              <input ref={galRef} type="file" accept="image/*" hidden onChange={onFile} />
              <label className="row"><input type="checkbox" checked={skipOcr} onChange={(e) => setSkipOcr(e.target.checked)} /> Sólo guardar la foto (sin OCR)</label>
              <div className="small">Consejo: tarjeta plana, bien iluminada, sin reflejos y ocupando casi todo el encuadre.</div>
            </div>
            <div className="card">
              <h2>Idiomas del OCR</h2>
              <div className="row">
                {Object.entries(OCR_LANG_LABEL).map(([k, v]) => {
                  const on = set.ocrLangs.includes(k);
                  return <button key={k} className={'btn sm ' + (on ? 'primary' : '')} onClick={() => {
                    const next = on ? set.ocrLangs.filter((x) => x !== k) : [...set.ocrLangs, k];
                    if (next.length) saveSettings({ ocrLangs: next });
                  }}>{v}</button>;
                })}
              </div>
              <div className="small">Menos idiomas = más rápido y a veces más preciso.</div>
              {cached === false && (
                <div className={'banner ' + (online ? 'info' : 'warn')} style={{ marginTop: 8 }}>
                  {online ? 'Los recursos OCR (~25 MB) aún no están guardados en este móvil. Descárgalos ahora con Wi-Fi para usarlo sin conexión en la feria.'
                    : 'Sin conexión y OCR no descargado: podrás hacer la foto y rellenar a mano.'}
                  {online && <div><button className="btn sm gold" disabled={!!prep} onClick={() => void prepare()}>{prep ?? 'Descargar OCR para uso sin conexión'}</button></div>}
                </div>
              )}
              {cached === true && <div className="saved" style={{ marginTop: 6 }}>✓ OCR disponible sin conexión</div>}
            </div>
          </>
        )}
        {step.s === 'busy' && (
          <div className="card"><Spinner label={step.label} />
            <div className="progress"><div style={{ width: `${Math.round(step.pct * 100)}%` }} /></div>
            <div className="small">La primera vez puede tardar. Todo se procesa en tu móvil.</div>
          </div>
        )}
        {step.s === 'confirm' && <Confirm step={step} companyId={companyId} />}
      </div>
    </>
  );
}

function Confirm({ step, companyId }: { step: Extract<Step, { s: 'confirm' }>; companyId?: string }) {
  const [text, setText] = useState(step.text);
  const parsed = useMemo(() => toFields(parseCardText(text)), [text]);
  return (
    <CaptureConfirm
      source="ocr" image={step.image} presetCompanyId={companyId} suggestCompany={parsed.company}
      initial={parsed.fields} flags={parsed.flags} banner={step.failed}
      raw={{ label: 'Texto detectado por OCR (corrígelo si hace falta)', text, onReparse: setText }}
    />
  );
}
