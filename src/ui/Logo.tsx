import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Globe, ImageIcon, Trash2 } from 'lucide-react';
import { db } from '../lib/db';
import { initials, normalizeWeb, removeCompanyLogo, renderLogo, searchWebLogos, setCompanyLogo, type CropRect, type FoundLogo } from '../lib/logo';
import type { Company, MediaItem } from '../lib/types';
import { describeSaveError } from '../lib/storage';
import { Modal, Spinner, useUi } from './kit';
import { useLive, useObjectUrl } from './hooks';

/** Tono estable (1-5) para el marcador de iniciales: cada empresa conserva su color. */
const tone = (name: string) => { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return (h % 5) + 1; };

/** Logo de la empresa o, si no hay, sus iniciales. */
export function Logo({ name, blob, size = 44 }: { name: string; blob?: Blob; size?: number }) {
  const url = useObjectUrl(blob);
  return (
    <span className={'logo ' + (url ? 'has-img' : 'c' + tone(name))} style={{ width: size, height: size, fontSize: size * 0.36, borderRadius: Math.round(size * 0.26) }} aria-hidden="true">
      {url ? <img src={url} alt="" /> : initials(name)}
    </span>
  );
}

/** Carga el blob del logo de una empresa (en vivo). */
export function useLogoBlob(company: Pick<Company, 'logoMediaId'>): Blob | undefined {
  const [b] = useLive(async () => (company.logoMediaId ? (await db.media.get(company.logoMediaId))?.blob : undefined), [company.logoMediaId], undefined as Blob | undefined);
  return b;
}

type Step = 'menu' | 'photos' | 'crop' | 'web';

export function LogoEditor({ company, onClose }: { company: Company; onClose: () => void }) {
  const ui = useUi();
  const current = useLogoBlob(company);
  const [step, setStep] = useState<Step>('menu');
  const [source, setSource] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);

  /** Guarda el logo; si ya hay uno, nunca lo sustituye sin confirmación. */
  const save = async (blob: Blob) => {
    if (company.logoMediaId && await ui.confirm({ title: '¿Reemplazar el logo actual?', message: 'El logo actual se eliminará y se usará el nuevo.', confirmLabel: 'Reemplazar' }) !== true) return;
    setBusy(true);
    try { await setCompanyLogo(company.id, blob); ui.toast('Logo guardado'); onClose(); }
    catch (e) { ui.toast(describeSaveError(e), 'err'); } finally { setBusy(false); }
  };

  const remove = async () => {
    if (await ui.confirm({ title: '¿Quitar el logo?', message: 'Se mostrarán las iniciales de la empresa.', confirmLabel: 'Quitar', danger: true }) === true) {
      await removeCompanyLogo(company.id); onClose();
    }
  };

  return (
    <Modal title="Logo de la empresa" onClose={onClose}>
      {step === 'menu' && (
        <div className="stack">
          <div className="row nowrap" style={{ gap: 14 }}><Logo name={company.name} blob={current} size={72} />
            <div className="small">{current ? 'Logo actual. Elige una opción para cambiarlo.' : 'Aún sin logo: se muestran las iniciales.'}</div></div>
          <div className="opt-list">
            <button className="btn" onClick={() => setStep('photos')}><span className="ic-tile"><ImageIcon /></span>Elegir de una foto guardada</button>
            <button className="btn" onClick={() => setStep('web')} disabled={!normalizeWeb(company.web ?? '')}><span className="ic-tile"><Globe /></span>Buscar logo desde la web</button>
          </div>
          {!normalizeWeb(company.web ?? '') && <div className="small">Añade la web de la empresa en «Datos de la empresa» para buscar su logo.</div>}
          {current && <button className="btn danger-ghost" onClick={() => void remove()}><Trash2 />Quitar logo</button>}
        </div>
      )}
      {step === 'photos' && <PhotoPicker companyId={company.id} onBack={() => setStep('menu')} onPick={(b) => { setSource(b); setStep('crop'); }} />}
      {step === 'crop' && source && <Cropper src={source} busy={busy} onBack={() => setStep('photos')} onUse={(b) => void save(b)} />}
      {step === 'web' && <WebPicker web={company.web ?? ''} busy={busy} onBack={() => setStep('menu')} onUse={(b) => void save(b)} />}
    </Modal>
  );
}

function PhotoPicker({ companyId, onBack, onPick }: { companyId: string; onBack: () => void; onPick: (b: Blob) => void }) {
  const [items, ready] = useLive(async () => (await db.media.where('companyId').equals(companyId).filter((m) => m.kind === 'photo' && m.category !== 'logo').toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [companyId], [] as MediaItem[]);
  return (
    <div className="stack">
      <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={onBack}><ChevronLeft />Volver</button>
      {ready && items.length === 0 && <div className="small">Esta empresa aún no tiene fotos. Haz una (por ejemplo del rótulo o la tarjeta) y vuelve aquí.</div>}
      <div className="photos">{items.map((m) => <PickThumb key={m.id} m={m} onPick={() => onPick(m.blob)} />)}</div>
    </div>
  );
}
function PickThumb({ m, onPick }: { m: MediaItem; onPick: () => void }) {
  const url = useObjectUrl(m.thumb ?? m.blob);
  return <button className="ph" onClick={onPick} aria-label="Usar esta foto">{url && <img src={url} alt="" />}</button>;
}

/** Recorte manual: arrastra el recuadro y ajusta su tamaño. */
function Cropper({ src, busy, onBack, onUse }: { src: Blob; busy: boolean; onBack: () => void; onUse: (b: Blob) => void }) {
  const url = useObjectUrl(src);
  const imgRef = useRef<HTMLImageElement>(null);
  const [aspect, setAspect] = useState<1 | 2>(1); // ancho/alto
  const [size, setSize] = useState(60); // % del ancho disponible
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 }); // centro (0..1)
  const drag = useRef(false);
  const [, setLoaded] = useState(false);

  // caja en proporciones (0..1) de la imagen
  const box = (() => {
    const im = imgRef.current; const iw = im?.naturalWidth || 1; const ih = im?.naturalHeight || 1;
    let w = size / 100; let h = (w * iw) / aspect / ih;
    if (h > 1) { h = 1; w = (h * ih * aspect) / iw; }
    const x = Math.min(1 - w, Math.max(0, pos.x - w / 2)); const y = Math.min(1 - h, Math.max(0, pos.y - h / 2));
    return { x, y, w, h };
  })();

  const move = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
  };
  const use = async (full: boolean) => {
    const im = imgRef.current; if (!im) return;
    const rect: CropRect | undefined = full ? undefined : { x: box.x * im.naturalWidth, y: box.y * im.naturalHeight, w: box.w * im.naturalWidth, h: box.h * im.naturalHeight };
    onUse(await renderLogo(src, rect));
  };

  return (
    <div className="stack">
      <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={onBack}><ChevronLeft />Otra foto</button>
      <div className="crop"><div className="crop-in" onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); move(e); }} onPointerMove={move} onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}>
        {url && <img ref={imgRef} src={url} alt="Foto" draggable={false} onLoad={() => setLoaded(true)} />}
        <div className="crop-box" style={{ left: box.x * 100 + '%', top: box.y * 100 + '%', width: box.w * 100 + '%', height: box.h * 100 + '%' }} />
      </div></div>
      <div className="row nowrap"><span className="small">Tamaño</span><input type="range" min={10} max={100} value={size} onChange={(e) => setSize(+e.target.value)} aria-label="Tamaño del recorte" style={{ flex: 1 }} /></div>
      <div className="seg"><button type="button" className={aspect === 1 ? 'on' : ''} onClick={() => setAspect(1)}>Cuadrado</button><button type="button" className={aspect === 2 ? 'on' : ''} onClick={() => setAspect(2)}>Horizontal</button></div>
      <div className="small">Toca o arrastra sobre la foto para mover el recuadro.</div>
      <div className="row"><button className="btn primary grow" disabled={busy} onClick={() => void use(false)}>Usar recorte</button><button className="btn" disabled={busy} onClick={() => void use(true)}>Imagen completa</button></div>
    </div>
  );
}

function WebPicker({ web, busy, onBack, onUse }: { web: string; busy: boolean; onBack: () => void; onUse: (b: Blob) => void }) {
  const [res, setRes] = useState<{ found: FoundLogo[]; htmlReadable: boolean; offline: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    void searchWebLogos(web).then((r) => { if (alive) setRes(r); }).catch(() => { if (alive) setRes({ found: [], htmlReadable: false, offline: false }); });
    return () => { alive = false; };
  }, [web]);
  return (
    <div className="stack">
      <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={onBack}><ChevronLeft />Volver</button>
      {!res && <Spinner label="Buscando en la web de la empresa…" />}
      {res?.offline && <div className="banner warn">Sin conexión. Los logos ya guardados siguen funcionando; vuelve a intentarlo con internet.</div>}
      {res && !res.offline && res.found.length === 0 && (
        <div className="banner warn">No se encontró ningún logo que el navegador permita leer. Muchas webs lo bloquean. Alternativa: guarda la imagen del logo en el móvil, añádela como foto de la empresa y úsala con «Elegir de una foto guardada».</div>
      )}
      {res && res.found.length > 0 && <div className="small">Toca el que quieras usar:</div>}
      <div className="cands">{res?.found.map((f) => <Cand key={f.url} f={f} disabled={busy} onUse={onUse} />)}</div>
    </div>
  );
}
function Cand({ f, disabled, onUse }: { f: FoundLogo; disabled: boolean; onUse: (b: Blob) => void }) {
  const url = useObjectUrl(f.blob);
  const label = { header: 'Cabecera', 'apple-touch-icon': 'Icono', 'og:image': 'Imagen principal', icon: 'Favicon', favicon: 'Favicon' }[f.source];
  return (
    <button className="cand" disabled={disabled} onClick={async () => { try { onUse(await renderLogo(f.blob)); } catch { onUse(f.blob); } }}>
      <span className="cand-img">{url && <img src={url} alt="" />}</span><span className="small">{label}</span>
    </button>
  );
}
