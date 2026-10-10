import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { decodeQrFromBlob, decodeQrFromImageData } from '../lib/qrDecode';
import type { QrContact, QrResult } from '../lib/qrParse';
import { describeMediaError } from '../lib/recorder';
import { CaptureConfirm, SaveLinkPanel } from './capture';
import { emptyContact, type ContactFields } from './ContactForm';
import { Header, Spinner, useUi } from './kit';
import { useSettings } from './hooks';

function fieldsFromQr(c: QrContact): ContactFields {
  return {
    ...emptyContact,
    fullName: c.fullName ?? '', role: c.role ?? '', department: c.department ?? '', email: c.email ?? '', phone: c.phone ?? '',
    mobile: c.mobile ?? '', webOrLinkedin: c.web ?? '',
    notes: [c.company && `Empresa: ${c.company}`, c.address && `Dirección: ${c.address}`, c.notes, ...c.extras].filter(Boolean).join('\n'),
  };
}

const hostOf = (u: string) => { try { return new URL(u).hostname; } catch { return u; } };

export function QrCapture({ companyId }: { companyId?: string }) {
  const set = useSettings();
  const ui = useUi();
  const [result, setResult] = useState<QrResult | null>(null);
  const [camOn, setCamOn] = useState(true);
  const [camError, setCamError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [noQr, setNoQr] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!set.qrEnabled || result || !camOn) return;
    let alive = true;
    let raf = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let last = 0;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('Sin API de cámara'), { name: 'NotFoundError' });
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play().catch(() => undefined);
        const tick = (now: number) => {
          if (!alive) return;
          raf = requestAnimationFrame(tick);
          if (now - last < 130 || v.readyState < 2 || !v.videoWidth || !ctx) return;
          last = now;
          const k = Math.min(1, 800 / v.videoWidth);
          canvas.width = Math.round(v.videoWidth * k); canvas.height = Math.round(v.videoHeight * k);
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          const res = decodeQrFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
          if (res) { alive = false; stopCam(); navigator.vibrate?.(60); setResult(res); }
        };
        raf = requestAnimationFrame(tick);
      } catch (e) { if (alive) setCamError(describeMediaError(e, 'cámara')); }
    })();
    const onHide = () => { if (document.visibilityState === 'hidden') { alive = false; stopCam(); setCamOn(false); } };
    document.addEventListener('visibilitychange', onHide);
    return () => { alive = false; cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onHide); stopCam(); };
  }, [set.qrEnabled, result, camOn, stopCam]);

  const initial = useMemo(() => {
    if (!result) return emptyContact;
    if (result.contact) return fieldsFromQr(result.contact);
    if (result.kind === 'email') return { ...emptyContact, email: result.email ?? '' };
    if (result.kind === 'phone') return { ...emptyContact, phone: result.phone ?? '' };
    return emptyContact;
  }, [result]);

  if (!set.qrEnabled) return <><Header title="Escanear QR" back /><div className="page"><div className="banner info">El escáner QR está desactivado en Ajustes.</div></div></>;

  const fromImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setBusy(true); setNoQr(false);
    try {
      const r = await decodeQrFromBlob(f);
      if (r) { stopCam(); setResult(r); } else setNoQr(true);
    } catch { ui.toast('No se pudo leer la imagen (formato no compatible)', 'err'); } finally { setBusy(false); }
  };

  const restart = () => { setResult(null); setNoQr(false); setCamError(null); setCamOn(true); };

  const openLink = async (url: string) => {
    const ok = await ui.confirm({
      title: 'Abrir enlace externo', message: <>Se abrirá <b>{hostOf(url)}</b> en el navegador. Comprueba que lo reconoces.<div className="small" style={{ wordBreak: 'break-all', marginTop: 6 }}>{url}</div></>,
      confirmLabel: 'Abrir',
    });
    if (ok === true) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const company = result?.contact?.company;

  return (
    <>
      <Header title="Escanear QR" back />
      <div className="page stack">
        {!result && (
          <>
            {camError ? <div className="banner err">{camError}</div> : camOn ? (
              <div className="camera"><video ref={videoRef} playsInline muted /><div className="reticle" /></div>
            ) : <div className="banner info">Cámara detenida. <button className="btn sm" onClick={restart}>Reanudar</button></div>}
            {busy && <Spinner label="Leyendo imagen…" />}
            {noQr && <div className="banner warn">No se encontró ningún QR en la imagen. Prueba con una foto más cercana y nítida.</div>}
            <div className="small">Apunta al código QR. Funciona sin conexión si el QR contiene los datos directamente (vCard/MECARD).</div>
            <button className="btn block" onClick={() => fileRef.current?.click()}>🖼 Leer QR desde una imagen</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={fromImage} />
          </>
        )}
        {result && (
          <>
            <div className="banner ok">
              {{ vcard: 'Tarjeta de contacto (vCard)', mecard: 'Tarjeta de contacto (MECARD)', url: 'Enlace web', email: 'Email', phone: 'Teléfono', text: 'Texto' }[result.kind]} detectado
              <button className="btn sm" style={{ marginLeft: 8 }} onClick={restart}>Escanear otro</button>
            </div>
            {(result.kind === 'vcard' || result.kind === 'mecard' || result.kind === 'email' || result.kind === 'phone') && (
              <CaptureConfirm key={result.raw} source="qr" initial={initial} presetCompanyId={companyId} suggestCompany={company} />
            )}
            {result.kind === 'url' && result.url && (
              <div className="stack">
                <div className="card"><div className="small">Enlace (no se abre automáticamente):</div><div style={{ wordBreak: 'break-all' }}><b>{result.url}</b></div>
                  <div className="small">Es sólo un enlace: la app no descarga ni lee su contenido.</div>
                  <button className="btn" style={{ marginTop: 8 }} onClick={() => void openLink(result.url!)}>Abrir en el navegador…</button></div>
                <SaveLinkPanel text={result.url} url={result.url} presetCompanyId={companyId} suggestCompany={hostOf(result.url).replace(/^www\./, '').split('.')[0]} />
              </div>
            )}
            {result.kind === 'text' && (
              <div className="stack">
                <div className="card"><div className="small">Contenido del QR (texto sin interpretar):</div><pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>{result.raw.slice(0, 2000)}</pre></div>
                <SaveLinkPanel text={result.raw.slice(0, 2000)} presetCompanyId={companyId} />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
