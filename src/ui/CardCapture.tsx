import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, Crop, Image as ImageIcon, Languages, RefreshCw, RotateCcw, RotateCw } from 'lucide-react';
import { parseCard } from '../lib/ocrParse';
import { draftFromCard } from '../lib/importDraft';
import { OCR_LANG_LABEL, decodeRaster, isOcrCached, prepareOcrOffline, rasterToJpeg, scanCardBlob, type CardScan } from '../lib/ocr';
import { cropRaster, rotateRaster, type Raster, type Rotation } from '../lib/raster';
import { saveSettings } from '../lib/settings';
import { CaptureConfirm } from './capture';
import { Header, Spinner, useUi } from './kit';
import { useObjectUrl, useOnline, useSettings } from './hooks';

type Step = { s: 'pick' } | { s: 'busy'; label: string; pct?: number } | { s: 'result' };

interface Work {
  original: Raster;
  origRotation: Rotation; // giro con el que se guarda la foto original
  base: Raster; // imagen sobre la que se lee (puede estar recortada)
  scan: CardScan;
  id: number;
}

export function CardCapture({ companyId }: { companyId?: string }) {
  const ui = useUi();
  const set = useSettings();
  const online = useOnline();
  const [step, setStep] = useState<Step>({ s: 'pick' });
  const [work, setWork] = useState<Work | null>(null);
  const [cached, setCached] = useState<boolean | null>(null);
  const [prep, setPrep] = useState<string | null>(null);
  const [skipOcr, setSkipOcr] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);
  const [cardJpeg, setCardJpeg] = useState<Blob | undefined>();
  const [preview, setPreview] = useState<Blob | undefined>();
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const previewUrl = useObjectUrl(preview);

  useEffect(() => { void isOcrCached(set.ocrLangs).then(setCached); }, [set.ocrLangs]);

  // Imagen orientada: miniatura de pantalla y JPEG final para guardar junto al contacto.
  useEffect(() => {
    if (!work) return;
    let alive = true;
    // El JPEG anterior deja de ser válido en cuanto cambia la lectura (giro, recorte, repetir): no puede guardarse por error.
    setCardJpeg(undefined); setPreview(undefined);
    void (async () => {
      const [p, full] = await Promise.all([rasterToJpeg(work.base, work.scan.rotation, 1100, 0.8), rasterToJpeg(work.original, work.origRotation, 2400, 0.9)]);
      if (alive) { setPreview(p); setCardJpeg(full); }
    })();
    return () => { alive = false; };
  }, [work]);

  const run = useCallback(async (input: Blob | Raster, rotation: Rotation | 'auto', original?: Raster, origRotation: Rotation = 0) => {
    setFailed(null); setCropping(false);
    setStep({ s: 'busy', label: 'Preparando…' });
    try {
      const scan = await scanCardBlob(input, set.ocrLangs, {
        rotation,
        onStage: (label) => setStep({ s: 'busy', label }),
        onProgress: (label, pct) => setStep((st) => (st.s === 'busy' ? { s: 'busy', label: /recogn/.test(label) ? st.label : 'Cargando OCR…', pct: /recogn/.test(label) ? undefined : pct } : st)),
      });
      const sameAsOriginal = !original || original === scan.raster;
      setWork({ original: original ?? scan.raster, origRotation: sameAsOriginal ? scan.rotation : origRotation, base: scan.raster, scan, id: ++seq.current });
      setStep({ s: 'result' });
    } catch (err) {
      setFailed(`El OCR no se pudo ejecutar (${(err as Error).message}). ${online ? '' : 'Estás sin conexión y los recursos OCR no están descargados. '}Rellena los datos a mano; la foto se guardará.`);
      // Conserva la foto aunque falle el OCR
      try {
        const raster = 'data' in input ? input : await decodeRaster(input);
        const scan = { raster, rotation: 0 as Rotation, pass: { text: '', lines: [], conf: 0 }, orientationScores: {}, orientationConfident: false, timings: { probeMs: 0, finalMs: 0, totalMs: 0, probes: 0, passMs: [] } };
        setWork({ original: raster, origRotation: 0, base: raster, scan, id: ++seq.current });
        setStep({ s: 'result' });
      } catch (e2) { ui.toast((e2 as Error).message, 'err'); setStep({ s: 'pick' }); }
    }
  }, [set.ocrLangs, online, ui]);

  if (!set.ocrEnabled) return <><Header title="Escanear tarjeta" back /><div className="page"><div className="banner info">El escáner de tarjetas está desactivado en Ajustes.</div></div></>;

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStep({ s: 'busy', label: 'Leyendo imagen…' });
    try {
      const raster = await decodeRaster(file);
      if (skipOcr) {
        const scan: CardScan = { raster, rotation: 0, pass: { text: '', lines: [], conf: 0 }, orientationScores: {}, orientationConfident: false, timings: { probeMs: 0, finalMs: 0, totalMs: 0, probes: 0, passMs: [] } };
        setWork({ original: raster, origRotation: 0, base: raster, scan, id: ++seq.current }); setStep({ s: 'result' }); return;
      }
      await run(raster, 'auto');
    } catch (err) { ui.toast((err as Error).message, 'err'); setStep({ s: 'pick' }); }
  };

  const rotate = (d: 90 | 270) => work && void run(work.base, ((work.scan.rotation + d) % 360) as Rotation, work.original, work.origRotation);
  const rescan = () => work && void run(work.base, 'auto', work.original, work.origRotation);

  const applyCrop = (r: { x: number; y: number; w: number; h: number }) => {
    if (!work) return;
    const oriented = rotateRaster(work.base, work.scan.rotation);
    const cropped = cropRaster(oriented, { x: r.x * oriented.width, y: r.y * oriented.height, w: r.w * oriented.width, h: r.h * oriented.height });
    void run(cropped, 0, work.original, work.base === work.original ? work.scan.rotation : work.origRotation);
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
            <div className="card stack capture-hero">
              <button className="btn primary block lg" onClick={() => camRef.current?.click()}><Camera />Fotografiar tarjeta</button>
              <button className="btn block" onClick={() => galRef.current?.click()}><ImageIcon />Elegir una foto de la galería</button>
              <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
              <input ref={galRef} type="file" accept="image/*" hidden onChange={onFile} />
              <label className="row"><input type="checkbox" checked={skipOcr} onChange={(e) => setSkipOcr(e.target.checked)} /> Sólo guardar la foto (sin OCR)</label>
              <div className="small">Consejo: tarjeta sobre una superficie lisa, bien iluminada, sin reflejos y ocupando buena parte del encuadre. Si sale girada, la app la endereza sola.</div>
            </div>
            <div className="card">
              <h2 className="card-title"><span className="ic-tile"><Languages /></span>Idiomas del OCR</h2>
              <div className="pills" style={{ marginBottom: 8 }}>
                {Object.entries(OCR_LANG_LABEL).map(([k, v]) => {
                  const on = set.ocrLangs.includes(k);
                  return <button key={k} className={'pill' + (on ? ' on' : '')} aria-pressed={on} onClick={() => {
                    const next = on ? set.ocrLangs.filter((x) => x !== k) : [...set.ocrLangs, k];
                    if (next.length) saveSettings({ ocrLangs: next });
                  }}>{v}</button>;
                })}
              </div>
              <div className="small">Menos idiomas = lectura más rápida. Inglés + italiano cubre la mayoría de tarjetas; los acentos de español/francés mejoran al activarlos.</div>
              {cached === false && (
                <div className={'banner ' + (online ? 'info' : 'warn')} style={{ marginTop: 8 }}>
                  {online ? 'Los recursos OCR (~25 MB) aún no están guardados en este móvil. Descárgalos ahora con Wi-Fi para usarlo sin conexión en la feria.'
                    : 'Sin conexión y OCR no descargado: podrás hacer la foto y rellenar a mano.'}
                  {online && <div><button className="btn sm gold" disabled={!!prep} onClick={() => void prepare()}>{prep ?? 'Descargar OCR para uso sin conexión'}</button></div>}
                </div>
              )}
              {cached === true && <div className="status-line ok" style={{ marginTop: 8 }}><CheckCircle2 />OCR disponible sin conexión</div>}
            </div>
          </>
        )}

        {step.s === 'busy' && (
          <div className="card"><Spinner label={step.label} />
            {step.pct !== undefined && <div className="progress"><div style={{ width: `${Math.round(step.pct * 100)}%` }} /></div>}
            <div className="small">Todo se procesa en tu móvil. La primera vez puede tardar más (carga del OCR).</div>
          </div>
        )}

        {step.s === 'result' && work && (
          <Result work={work} jpeg={cardJpeg} previewUrl={previewUrl} companyId={companyId} failed={failed}
            cropping={cropping} onCrop={() => setCropping(true)} onCancelCrop={() => setCropping(false)} onApplyCrop={applyCrop}
            onRotate={rotate} onRescan={rescan} onNew={() => { setWork(null); setStep({ s: 'pick' }); }} />
        )}
      </div>
    </>
  );
}

function Result({ work, jpeg, previewUrl, companyId, failed, cropping, onCrop, onCancelCrop, onApplyCrop, onRotate, onRescan, onNew }: {
  work: Work; jpeg?: Blob; previewUrl?: string; companyId?: string; failed: string | null; cropping: boolean;
  onCrop: () => void; onCancelCrop: () => void; onApplyCrop: (r: { x: number; y: number; w: number; h: number }) => void;
  onRotate: (d: 90 | 270) => void; onRescan: () => void; onNew: () => void;
}) {
  const { scan } = work;
  const draft = useMemo(() => draftFromCard(parseCard(scan.pass.lines.length ? scan.pass.lines : scan.pass.text.split('\n').map((text) => ({ text })))), [scan]);
  const noText = !scan.pass.text.trim();
  const f = draft.contact;
  const nothing = !draft.company.name && !f.fullName && !f.email && !f.phone && !f.mobile && !draft.company.web;
  const sc = scan.orientationScores;
  const banner = failed
    ?? (noText ? 'No se detectó texto. Prueba a girar la imagen, recortarla o repetir el escaneo; o rellena a mano (la foto se guardará).'
      : !scan.orientationConfident ? 'La lectura es poco fiable (orientación incierta). Revisa cada campo, gira la imagen o repite el escaneo.'
      : nothing ? 'No se reconoció ningún dato fiable (empresa, persona, email o teléfono). Prueba a girar la imagen, recortarla o repetir el escaneo; o rellena a mano.' : undefined);
  return (
    <div className="stack">
      {previewUrl && !cropping && <img className="preview" src={previewUrl} alt="Tarjeta orientada" />}
      {cropping && previewUrl && <CropTool src={previewUrl} onApply={onApplyCrop} onCancel={onCancelCrop} />}
      {!cropping && (
        <div className="toolbar">
          <button className="btn sm" onClick={() => onRotate(270)} aria-label="Girar a la izquierda"><RotateCcw /></button>
          <button className="btn sm" onClick={() => onRotate(90)} aria-label="Girar a la derecha"><RotateCw /></button>
          <button className="btn sm" disabled={!previewUrl} onClick={onCrop} aria-label="Recortar"><Crop /></button>
          <button className="btn sm" onClick={onRescan} aria-label="Repetir la lectura"><RefreshCw /></button>
          <button className="btn sm" onClick={onNew}>Otra tarjeta</button>
        </div>
      )}
      <CaptureConfirm
        key={work.id}
        source="ocr" image={jpeg} imagePending={!jpeg} presetCompanyId={companyId} draft={draft} banner={banner}
        raw={{ label: 'Texto detectado por OCR (original)', text: scan.pass.text }}
      />
      <details className="card">
        <summary>Diagnóstico de la lectura</summary>
        <div className="small">
          Giro aplicado: {scan.rotation}° · orientaciones evaluadas: {scan.timings.probes || '—'} · tiempo: {(scan.timings.totalMs / 1000).toFixed(1)} s
          (orientación {(scan.timings.probeMs / 1000).toFixed(1)} s, lectura {(scan.timings.finalMs / 1000).toFixed(1)} s; pasadas: {scan.timings.passMs.join(", ")} ms) · confianza media OCR: {Math.round(scan.pass.conf)}%
          {Object.keys(sc).length > 0 && <> · puntuaciones: {Object.entries(sc).map(([k, v]) => `${k}°=${(v as number).toFixed(0)}`).join(' ')}</>}
        </div>
      </details>
    </div>
  );
}

/** Recorte simple: arrastra sobre la imagen para marcar la tarjeta. */
function CropTool({ src, onApply, onCancel }: { src: string; onApply: (r: { x: number; y: number; w: number; h: number }) => void; onCancel: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const pos = (e: React.PointerEvent) => {
    const b = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) };
  };
  return (
    <div className="stack">
      <div className="small">Arrastra con el dedo para marcar sólo la tarjeta.</div>
      <div ref={box} className="cropbox"
        onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); start.current = pos(e); setRect({ ...start.current, w: 0, h: 0 }); }}
        onPointerMove={(e) => { if (!start.current) return; const p = pos(e); setRect({ x: Math.min(start.current.x, p.x), y: Math.min(start.current.y, p.y), w: Math.abs(p.x - start.current.x), h: Math.abs(p.y - start.current.y) }); }}
        onPointerUp={() => { start.current = null; }}>
        <img src={src} alt="Recortar tarjeta" draggable={false} />
        {rect && <div className="sel" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }} />}
      </div>
      <div className="row">
        <button className="btn" onClick={onCancel}>Cancelar</button>
        <button className="btn primary grow" disabled={!rect || rect.w < 0.1 || rect.h < 0.1} onClick={() => rect && onApply(rect)}>Leer el recorte</button>
      </div>
    </div>
  );
}
