import { beforeEach, describe, expect, it } from 'vitest';

// Shim mínimo de localStorage para Node
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
  },
});

import { clearDraft, getSettings, readDraft, saveSettings, writeDraft } from '../lib/settings';
import { formatBytes, isQuotaError, describeSaveError } from '../lib/storage';

beforeEach(() => store.clear());

describe('borradores (protección frente a cierre accidental)', () => {
  it('un borrador escrito se recupera tras "reabrir" y se borra al descartarlo', () => {
    writeDraft('newCompany', { name: 'Frozen Foods', type: 'supplier' });
    expect(readDraft('newCompany')).toEqual({ name: 'Frozen Foods', type: 'supplier' });
    clearDraft('newCompany');
    expect(readDraft('newCompany')).toBeNull();
  });
  it('un borrador corrupto no rompe la app', () => {
    store.set('scout:draft:x', '{no es json');
    expect(readDraft('x')).toBeNull();
  });
});

describe('ajustes y errores de almacenamiento', () => {
  it('valores por defecto: SIAL París 2026, OCR/QR activos y dictado externo DESACTIVADO', () => {
    const s = getSettings();
    expect(s.event.eventName).toBe('SIAL París 2026');
    expect(s.ocrEnabled && s.qrEnabled).toBe(true);
    expect(s.dictationEnabled).toBe(false);
  });
  it('permite desactivar funciones P1 sin tocar el resto', () => {
    saveSettings({ ocrEnabled: false });
    expect(getSettings().ocrEnabled).toBe(false);
    expect(getSettings().qrEnabled).toBe(true);
  });
  it('detecta falta de espacio y da un mensaje comprensible', () => {
    const e = Object.assign(new Error('x'), { name: 'QuotaExceededError' });
    expect(isQuotaError(e)).toBe(true);
    expect(describeSaveError(e)).toMatch(/Sin espacio/);
    expect(formatBytes(1536 * 1024)).toBe('1.5 MB');
  });
});
