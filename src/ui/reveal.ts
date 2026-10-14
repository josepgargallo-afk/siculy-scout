// Estado de las secciones plegables de la ficha. Se guarda por empresa en sessionStorage para que, al volver
// de una pantalla hija (editar contacto, escanear tarjeta…), la ficha siga como estaba. Al pasar por el
// directorio se limpia, de modo que entrar en una empresa SIEMPRE la muestra plegada.
export type SecKey = 'data' | 'contacts' | 'photos' | 'notes' | 'visits';
export const SEC_KEYS: SecKey[] = ['data', 'contacts', 'photos', 'notes', 'visits'];

const KEY = (id: string) => 'scout.acc.' + id;

export function loadOpen(companyId: string): SecKey[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY(companyId)) ?? '[]');
    return Array.isArray(v) ? v.filter((k): k is SecKey => SEC_KEYS.includes(k)) : [];
  } catch { return []; }
}
export function saveOpen(companyId: string, open: SecKey[]) {
  try { sessionStorage.setItem(KEY(companyId), JSON.stringify(open)); } catch { /* sin almacenamiento: sólo se pierde la memoria */ }
}
export function clearAllOpen() {
  try { const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); if (k?.startsWith('scout.acc.')) keys.push(k); }
    keys.forEach((k) => sessionStorage.removeItem(k)); } catch { /* idem */ }
}

export interface Reveal { companyId: string; sec: SecKey; itemId?: string }
let pending: Reveal | null = null;

/** Pide que, al volver a la ficha, se abra la sección y se muestre el elemento recién creado. */
export function requestReveal(companyId: string, sec: SecKey, itemId?: string) {
  pending = { companyId, sec, itemId };
  saveOpen(companyId, [...new Set([...loadOpen(companyId), sec])]);
}
export function takeReveal(companyId: string): Reveal | null {
  const p = pending;
  if (p && p.companyId === companyId) { pending = null; return p; }
  return null;
}
