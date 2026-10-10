export class ImageError extends Error {}

export interface OptimizedImage { blob: Blob; thumb: Blob; width: number; height: number }

function canvasToBlob(c: HTMLCanvasElement, type: string, q: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new ImageError('No se pudo codificar la imagen'))), type, q));
}

function drawScaled(bmp: ImageBitmap, max: number): HTMLCanvasElement {
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  const ctx = c.getContext('2d');
  if (!ctx) throw new ImageError('Canvas no disponible');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

/**
 * Reduce el tamaño conservando legibilidad (lado largo máx. 2000 px / 2400 px para tarjetas, JPEG alta calidad).
 * Al recodificar se eliminan los metadatos EXIF (incluida la ubicación GPS).
 */
export async function optimizeImage(file: Blob, kind: 'photo' | 'card' = 'photo'): Promise<OptimizedImage> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageError('Formato de imagen no compatible (prueba con JPG o PNG)');
  }
  try {
    const main = drawScaled(bmp, kind === 'card' ? 2400 : 2000);
    const blob = await canvasToBlob(main, 'image/jpeg', kind === 'card' ? 0.9 : 0.85);
    const thumb = await canvasToBlob(drawScaled(bmp, 360), 'image/jpeg', 0.72);
    return { blob, thumb, width: main.width, height: main.height };
  } finally {
    bmp.close();
  }
}
