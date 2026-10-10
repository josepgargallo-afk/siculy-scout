export interface StorageInfo { usage: number | null; quota: number | null; persisted: boolean | null }

export async function getStorageInfo(): Promise<StorageInfo> {
  const out: StorageInfo = { usage: null, quota: null, persisted: null };
  try {
    const est = await navigator.storage?.estimate?.();
    out.usage = est?.usage ?? null; out.quota = est?.quota ?? null;
    out.persisted = (await navigator.storage?.persisted?.()) ?? null;
  } catch { /* no disponible */ }
  return out;
}

/** Pide al navegador que no borre los datos bajo presión de almacenamiento. */
export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function isQuotaError(e: unknown): boolean {
  const x = e as { name?: string; message?: string; inner?: { name?: string } };
  return x?.name === 'QuotaExceededError' || x?.inner?.name === 'QuotaExceededError' || /quota/i.test(x?.message ?? '');
}

/** Mensaje comprensible para errores al guardar. */
export function describeSaveError(e: unknown): string {
  if (isQuotaError(e)) return 'Sin espacio de almacenamiento. Haz una copia ZIP, bórrala del móvil y elimina fotos o audios innecesarios.';
  return 'No se pudo guardar: ' + ((e as Error)?.message ?? 'error desconocido');
}

export function saveBlobAs(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function shareFile(blob: Blob, filename: string, type: string): Promise<boolean> {
  try {
    const file = new File([blob], filename, { type });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return true; }
  } catch (e) { if ((e as Error).name === 'AbortError') return true; }
  return false;
}
