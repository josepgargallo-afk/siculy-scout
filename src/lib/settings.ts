import { DEFAULT_EVENT, type OriginType } from './types';

// Preferencias del dispositivo (no son datos comerciales): localStorage con tolerancia a fallos.
export interface Settings {
  /** Interruptores P1: si algo falla en campo, se puede desactivar sin afectar al resto. */
  ocrEnabled: boolean;
  qrEnabled: boolean;
  /** Reconocimiento de voz del navegador: en Chrome ENVÍA el audio a Google. Desactivado por defecto. */
  dictationEnabled: boolean;
  ocrLangs: string[];
  /** Transcripción local de audios (Whisper). EXPERIMENTAL: desactivada hasta validarla en el móvil. */
  transcriptionEnabled: boolean;
  whisperModel: 'tiny' | 'base';
  whisperInstalled: 'tiny' | 'base' | null;
  transcriptionLang: string;
  event: { originType: OriginType; eventName: string; city: string; country: string };
}

export const DEFAULT_SETTINGS: Settings = {
  ocrEnabled: true,
  qrEnabled: true,
  dictationEnabled: false,
  ocrLangs: ['eng', 'spa', 'ita', 'fra'],
  transcriptionEnabled: false,
  whisperModel: 'base',
  whisperInstalled: null,
  transcriptionLang: 'es',
  event: { ...DEFAULT_EVENT, eventName: DEFAULT_EVENT.eventName } as Settings['event'],
};

const KEY = 'scout:settings';
let cache: Settings | null = null;
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Settings>;
      cache = { ...DEFAULT_SETTINGS, ...p, event: { ...DEFAULT_SETTINGS.event, ...(p.event ?? {}) } };
      return cache;
    }
  } catch { /* localStorage no disponible o corrupto */ }
  cache = DEFAULT_SETTINGS;
  return cache;
}

export function saveSettings(patch: Partial<Settings>) {
  cache = { ...getSettings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* sin almacenamiento: se mantiene en memoria */ }
  listeners.forEach((l) => l());
}

export function subscribeSettings(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ---- borradores (protección frente a pérdida accidental de cambios) ----
export function readDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem('scout:draft:' + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}
export function writeDraft(key: string, value: unknown) {
  try { localStorage.setItem('scout:draft:' + key, JSON.stringify(value)); } catch { /* ignorar */ }
}
export function clearDraft(key: string) {
  try { localStorage.removeItem('scout:draft:' + key); } catch { /* ignorar */ }
}
