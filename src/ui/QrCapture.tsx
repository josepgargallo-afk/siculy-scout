import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, FileUp, Image as ImageIcon, ScanLine } from 'lucide-react';
import { decodeQrFromBlob, decodeQrFromImageData } from '../lib/qrDecode';
import type { QrResult } from '../lib/qrParse';
import { draftFromVcard, DIGITAL_CARD_HOSTS, type ImportDraft } from '../lib/importDraft';
import { describeMediaError } from '../lib/recorder';
import { CaptureConfirm, SaveLinkPanel } from './capture';
import { Header, Spinner, useUi } from './kit';
import { navigate } from './router';
import { useSettings } from './hooks';

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

  const draft: ImportDraft | null = useMemo(() => {
    if (!result) return null;
    if (result.contact) return draftFromVcard(result.contact);
    if (result.kind === 'email') return draftFromVcard({ extras: [], email: result.email, emails: [{ value: result.email ?? '', type: 'work' }] });
    if (result.kind === 'phone') return draftFromVcard({ extras: [], phone: result.phone, phones: [{ value: result.phone ?? '', type: 'work' }] });
    return null;
  }, [result]);
  const [asContact, setAsContact] = useState(false);
  const linkDraft = useMemo(() => (result?.url ? draftFromVcard({ extras: [] }, result.url) : null), [result]);

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
            <button className="btn block" onClick={() => fileRef.current?.click()}><ImageIcon />Leer QR desde una imagen</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={fromImage} />
            <button className="btn block" onClick={() => navigate('/import' + (companyId ? '?c=' + companyId : ''))}><FileUp />Importar archivo .vcf (tarjeta digital)</button>
          </>
        )}
        {result && (
          <>
            <div className="banner ok">
              <div className="banner-row"><CheckCircle2 /><b className="grow">{{ vcard: 'Tarjeta de contacto (vCard)', mecard: 'Tarjeta de contacto (MECARD)', url: 'Enlace web', email: 'Email', phone: 'Teléfono', text: 'Texto' }[result.kind]} detectado</b>
              <button className="btn sm" style={{ margin: 0 }} onClick={restart}><ScanLine />Escanear otro</button></div>
            </div>
            {(result.kind === 'vcard' || result.kind === 'mecard' || result.kind === 'email' || result.kind === 'phone') && (
              draft && <CaptureConfirm key={result.raw} source="qr" draft={draft} presetCompanyId={companyId} />
            )}
            {result.kind === 'url' && result.url && !asContact && (
              <div className="stack">
                <div className="card">
                  <div className="small">{DIGITAL_CARD_HOSTS.test(result.url) ? 'Parece una tarjeta digital' : 'Enlace'} (no se abre automáticamente):</div>
                  <div style={{ wordBreak: 'break-all' }}><b>{result.url}</b></div>
                  <button className="btn" style={{ marginTop: 10 }} onClick={() => void openLink(result.url!)}><ExternalLink />Abrir en el navegador…</button>
                </div>
                <div className="card stack">
                  <h2>Importar los datos del contacto</h2>
                  <div className="small">
                    La app <b>no puede leer</b> el contenido de páginas ajenas (el navegador lo bloquea por seguridad y privacidad) ni hace scraping.
                    Lo habitual es que la página tenga un botón <i>«Guardar contacto»</i>, <i>«Añadir a contactos»</i> o <i>«Descargar vCard»</i>:
                    púlsalo para bajar el archivo <b>.vcf</b> y luego impórtalo aquí. Desde Android también puedes <i>Compartir → OCCASORIO</i>.
                  </div>
                  <button className="btn primary" onClick={() => navigate('/import' + (companyId ? '?c=' + companyId : ''))}><FileUp />Importar archivo .vcf</button>
                  <button className="btn" onClick={() => setAsContact(true)}>Crear contacto sólo con este enlace</button>
                </div>
                <SaveLinkPanel text={result.url} url={result.url} presetCompanyId={companyId} suggestCompany={hostOf(result.url).replace(/^www\./, '').split('.')[0]} />
              </div>
            )}
            {result.kind === 'url' && asContact && linkDraft && (
              <CaptureConfirm key={result.raw + 'c'} source="qr" draft={linkDraft} presetCompanyId={companyId} banner="Sólo se conoce el enlace: completa a mano nombre, empresa y datos. El enlace queda guardado en el contacto." />
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
