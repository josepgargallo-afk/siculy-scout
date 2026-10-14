import { Component, createContext, useCallback, useContext, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { goBack } from './router';
import { AlertTriangle, CheckCircle2, ChevronLeft, MoreVertical, X } from 'lucide-react';

// ---------- Toast + Confirm ----------
interface ConfirmOpts { title: string; message?: ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean; extra?: { label: string; value: string }[] }
interface UiApi {
  toast(msg: string, kind?: 'ok' | 'err'): void;
  /** Devuelve true/false, o el `value` del botón extra elegido. */
  confirm(o: ConfirmOpts): Promise<boolean | string>;
}
const Ctx = createContext<UiApi>({ toast: () => undefined, confirm: async () => false });
export const useUi = () => useContext(Ctx);

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: string }[]>([]);
  const [dlg, setDlg] = useState<(ConfirmOpts & { resolve: (v: boolean | string) => void }) | null>(null);
  const seq = useRef(0);
  const toast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'err' ? 7000 : 2500);
  }, []);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean | string>((resolve) => setDlg({ ...o, resolve })), []);
  const close = (v: boolean | string) => { dlg?.resolve(v); setDlg(null); };
  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={'toast ' + t.kind} role={t.kind === 'err' ? 'alert' : 'status'}>{t.kind === 'err' ? <AlertTriangle /> : <CheckCircle2 />}<span>{t.msg}</span></div>)}
      </div>
      {dlg && (
        <div className="overlay" role="dialog" aria-modal="true" onClick={() => close(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{dlg.title}</h3>
            {dlg.message && <div className="dlg-msg">{dlg.message}</div>}
            <div className="dlg-actions">
              {dlg.extra?.map((x) => <button key={x.value} className="btn" onClick={() => close(x.value)}>{x.label}</button>)}
              <button className="btn" onClick={() => close(false)}>{dlg.cancelLabel ?? 'Cancelar'}</button>
              <button className={'btn ' + (dlg.danger ? 'danger' : 'primary')} onClick={() => close(true)}>{dlg.confirmLabel ?? 'Aceptar'}</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

// ---------- ErrorBoundary: un fallo en OCR/QR no tumba el resto ----------
export class Boundary extends Component<{ children: ReactNode; name: string }, { err?: Error }> {
  state: { err?: Error } = {};
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error, info: ErrorInfo) { console.error(this.props.name, err, info); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="page"><div className="card err-card">
        <h2>Algo falló en «{this.props.name}»</h2>
        <p>Tus datos guardados no se han perdido. Puedes volver y seguir trabajando; si se repite, desactiva esta función en Ajustes.</p>
        <pre className="small">{this.state.err.message}</pre>
        <button className="btn primary" onClick={() => { this.setState({ err: undefined }); goBack('/'); }}>Volver</button>
      </div></div>
    );
  }
}

// ---------- piezas pequeñas ----------
export function Header({ title, back, right, hideTitle }: { title: ReactNode; back?: string | true; right?: ReactNode; hideTitle?: boolean }) {
  return (
    <header className="topbar">
      {back ? <button className="icon-btn" aria-label="Atrás" onClick={() => goBack(typeof back === 'string' ? back : '/')}><ChevronLeft /></button> : <span className="icon-spacer" />}
      <h1 className={hideTitle ? 'hide' : ''} aria-hidden={hideTitle || undefined}>{title}</h1>
      <div className="topbar-right">{right}</div>
    </header>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span className="lbl">{label}</span>{children}{hint && <span className="hint">{hint}</span>}</label>;
}

export function Modal({ children, onClose, title }: { children: ReactNode; onClose: () => void; title?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="dialog wide" onClick={(e) => e.stopPropagation()}>
        <div className="dlg-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X /></button></div>
        {children}
      </div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return <div className="spinner-row"><span className="spinner" />{label && <span>{label}</span>}</div>;
}

export const fmtDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export function splitList(s: string): string[] {
  return s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
}

/** Menú secundario (⋮) para acciones poco frecuentes o destructivas. */
export function MoreMenu({ items, label = 'Más opciones' }: { items: { label: string; icon?: ReactNode; danger?: boolean; onClick: () => void }[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    // Un toque fuera lo cierra (la barra superior crea su propio contexto y una capa fija no cubriría toda la pantalla).
    const out = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', k);
    document.addEventListener('pointerdown', out, true);
    return () => { window.removeEventListener('keydown', k); document.removeEventListener('pointerdown', out, true); };
  }, [open]);
  return (
    <div className="menu-wrap" ref={wrap}>
      <button className="icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}><MoreVertical /></button>
      {open && (
        <>
          <div className="menu" role="menu">
            {items.map((it) => (
              <button key={it.label} role="menuitem" className={it.danger ? 'danger' : ''} onClick={() => { setOpen(false); it.onClick(); }}>{it.icon}{it.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Aviso con icono. */
export function Notice({ kind = 'info', icon, children }: { kind?: 'info' | 'warn' | 'err' | 'ok'; icon?: ReactNode; children: ReactNode }) {
  return <div className={'banner ' + kind}><div className="banner-row">{icon}<div className="grow">{children}</div></div></div>;
}
