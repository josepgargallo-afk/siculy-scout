import { db } from './db';
import { addMedia, deleteMedia, markChanged } from './repo';
import { nowIso } from './ids';

/** Iniciales para el marcador de posición cuando no hay logo (máx. 2 letras). */
export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const [a, b] = words;
  return (a[0] + (b ? b[0] : a[1] ?? '')).toUpperCase();
}

export interface CropRect { x: number; y: number; w: number; h: number }

/** Recorta (opcional) y reduce a un PNG pequeño (lado largo ≤ 320 px). */
export async function renderLogo(src: Blob, rect?: CropRect, max = 320): Promise<Blob> {
  const bmp = await createImageBitmap(src, { imageOrientation: 'from-image' });
  try {
    const r = rect ?? { x: 0, y: 0, w: bmp.width, h: bmp.height };
    const k = Math.min(1, max / Math.max(r.w, r.h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(r.w * k)); c.height = Math.max(1, Math.round(r.h * k));
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Canvas no disponible');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('No se pudo codificar el logo'))), 'image/png'));
  } finally { bmp.close(); }
}

/**
 * Guarda `blob` como logo de la empresa. Si ya había uno, se elimina SU archivo (la confirmación la pide la interfaz antes).
 * El logo es un archivo más de la empresa (category 'logo'), así que viaja en las copias ZIP sin cambiar su formato.
 */
export async function setCompanyLogo(companyId: string, blob: Blob): Promise<string> {
  const company = await db.companies.get(companyId);
  if (!company) throw new Error('Empresa no encontrada');
  const old = company.logoMediaId;
  const m = await addMedia({ companyId, kind: 'photo', category: 'logo', mime: blob.type || 'image/png', size: blob.size, blob });
  await db.companies.update(companyId, { logoMediaId: m.id, updatedAt: nowIso() });
  await markChanged();
  if (old && old !== m.id) await deleteMedia(old).catch(() => undefined);
  return m.id;
}

export async function removeCompanyLogo(companyId: string): Promise<void> {
  const company = await db.companies.get(companyId);
  if (!company?.logoMediaId) return;
  const old = company.logoMediaId;
  await db.companies.update(companyId, { logoMediaId: undefined, updatedAt: nowIso() });
  await deleteMedia(old).catch(() => undefined);
  await markChanged();
}

// ---------- búsqueda en la web de la empresa ----------
export interface LogoCandidate { url: string; source: 'header' | 'apple-touch-icon' | 'og:image' | 'icon' | 'favicon' }

const abs = (href: string | null | undefined, base: URL): string | null => {
  if (!href) return null;
  try { const u = new URL(href.trim(), base); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; }
};

/** Extrae candidatos de un HTML (sin dependencias: expresiones simples sobre las etiquetas). Orden = preferencia. */
export function parseLogoCandidates(html: string, base: URL): LogoCandidate[] {
  const out: LogoCandidate[] = [];
  const add = (href: string | null | undefined, source: LogoCandidate['source']) => {
    const u = abs(href, base);
    if (u && !u.startsWith('data:') && !out.some((c) => c.url === u)) out.push({ url: u, source });
  };
  const attr = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)?.slice(2).find((x) => x !== undefined);
  // 1) imágenes de cabecera con «logo» en src/clase/id/alt
  let n = 0;
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const t = m[0];
    const hay = [attr(t, 'src'), attr(t, 'class'), attr(t, 'id'), attr(t, 'alt')].join(' ');
    if (/logo/i.test(hay) && !/\.svg(\?|$)/i.test(attr(t, 'src') ?? '') && n < 4) { add(attr(t, 'src') ?? attr(t, 'data-src'), 'header'); n++; }
  }
  // 2) iconos y og:image
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  for (const t of links) if (/apple-touch-icon/i.test(attr(t, 'rel') ?? '')) add(attr(t, 'href'), 'apple-touch-icon');
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const t = m[0]; const key = (attr(t, 'property') ?? attr(t, 'name') ?? '').toLowerCase();
    if (key === 'og:image' || key === 'og:image:url' || key === 'twitter:image') add(attr(t, 'content'), 'og:image');
  }
  for (const t of links) if (/\bicon\b/i.test(attr(t, 'rel') ?? '') && !/apple-touch/i.test(attr(t, 'rel') ?? '') && !/\.svg(\?|$)/i.test(attr(t, 'href') ?? '')) add(attr(t, 'href'), 'icon');
  return out;
}

export function normalizeWeb(web: string): URL | null {
  const s = web.trim();
  if (!s) return null;
  try { return new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch { return null; }
}

async function timed<T>(ms: number, f: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { return await f(ac.signal); } finally { clearTimeout(t); }
}

export interface FoundLogo extends LogoCandidate { blob: Blob }
export interface WebSearchResult { found: FoundLogo[]; htmlReadable: boolean; offline: boolean }

/**
 * Busca logos en la propia web de la empresa (sin servicios de terceros). Los navegadores sólo permiten LEER una imagen
 * de otro sitio si ese sitio lo autoriza (CORS); lo que no sea legible simplemente no se ofrece. Nunca lanza.
 */
export async function searchWebLogos(web: string, doFetch: typeof fetch = (...a) => fetch(...a)): Promise<WebSearchResult> {
  const base = normalizeWeb(web);
  if (!base || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { found: [], htmlReadable: false, offline: !!base };
  let cands: LogoCandidate[] = [];
  let htmlReadable = false;
  try {
    const html = await timed(7000, async (signal) => {
      const r = await doFetch(base.href, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!r.ok) throw new Error('http');
      return (await r.text()).slice(0, 400_000);
    });
    htmlReadable = true;
    cands = parseLogoCandidates(html, new URL(base.href));
  } catch { /* la web no permite leer su HTML desde otra página: se prueban las rutas habituales */ }
  for (const [p, source] of [['/apple-touch-icon.png', 'apple-touch-icon'], ['/favicon.png', 'favicon'], ['/favicon.ico', 'favicon']] as const) {
    const u = abs(p, base);
    if (u && !cands.some((c) => c.url === u)) cands.push({ url: u, source });
  }
  const found: FoundLogo[] = [];
  await Promise.all(cands.slice(0, 8).map(async (c) => {
    try {
      const blob = await timed(7000, async (signal) => {
        const r = await doFetch(c.url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!r.ok) throw new Error('http');
        const b = await r.blob();
        if (b.size < 100 || b.size > 3_000_000) throw new Error('size');
        return b;
      });
      const bmp = await createImageBitmap(blob); // comprueba que es una imagen legible
      const ok = bmp.width >= 16 && bmp.height >= 16; bmp.close();
      if (ok) found.push({ ...c, blob });
    } catch { /* candidato no legible */ }
  }));
  found.sort((a, b) => cands.findIndex((x) => x.url === a.url) - cands.findIndex((x) => x.url === b.url));
  return { found, htmlReadable, offline: false };
}
