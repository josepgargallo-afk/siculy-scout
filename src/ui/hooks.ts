import { liveQuery } from 'dexie';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { clearDraft, getSettings, readDraft, subscribeSettings, writeDraft } from '../lib/settings';

/** Consulta reactiva a IndexedDB (se actualiza sola cuando cambian los datos). */
export function useLive<T>(querier: () => Promise<T> | T, deps: unknown[], initial: T): [T, boolean] {
  const [val, setVal] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sub = liveQuery(querier).subscribe({
      next: (v) => { setVal(v); setReady(true); },
      error: (e) => { console.error('liveQuery', e); setReady(true); },
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return [val, ready];
}

export function useSettings() {
  return useSyncExternalStore(subscribeSettings, getSettings, getSettings);
}

export function useOnline() {
  return useSyncExternalStore(
    (cb) => { window.addEventListener('online', cb); window.addEventListener('offline', cb); return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb); }; },
    () => navigator.onLine, () => true,
  );
}

export function useObjectUrl(blob?: Blob | null): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) { setUrl(undefined); return; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

/**
 * Estado de formulario con borrador persistente: se restaura tras cierre accidental o recarga.
 * Devuelve [valor, setValor, descartarBorrador, hayBorradorRecuperado].
 */
export function useDraft<T extends object>(key: string, initial: T, enabled = true): [T, (p: Partial<T>) => void, () => void, boolean] {
  const [recovered] = useState(() => (enabled ? readDraft<T>(key) : null));
  const [val, setVal] = useState<T>(() => ({ ...initial, ...(recovered ?? {}) }));
  const timer = useRef<number>(undefined);
  const latest = useRef(val);
  latest.current = val;
  const dirty = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const flush = () => { if (dirty.current) writeDraft(key, latest.current); };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', flush); flush(); };
  }, [key, enabled]);

  const set = (p: Partial<T>) => {
    dirty.current = true;
    setVal((v) => {
      const n = { ...v, ...p };
      latest.current = n;
      window.clearTimeout(timer.current);
      if (enabled) timer.current = window.setTimeout(() => writeDraft(key, n), 300);
      return n;
    });
  };
  const discard = () => { dirty.current = false; window.clearTimeout(timer.current); clearDraft(key); };
  return [val, set, discard, !!recovered];
}
