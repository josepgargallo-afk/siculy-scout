import { useSyncExternalStore } from 'react';

// Router mínimo por hash (#/ruta?x=y): funciona en cualquier hosting estático y offline.
function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}
const snapshot = () => window.location.hash.replace(/^#/, '') || '/';

export function useRoute() {
  const full = useSyncExternalStore(subscribe, snapshot, () => '/');
  const [path, qs = ''] = full.split('?');
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(qs), full };
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) window.location.replace('#' + to); else window.location.hash = to;
}

export function goBack(fallback = '/') {
  if (window.history.length > 1) window.history.back(); else navigate(fallback);
}
