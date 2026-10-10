import jsQR from 'jsqr';
import { classifyQr, type QrResult } from './qrParse';

/** Decodifica un QR desde píxeles RGBA (funciona sin conexión; sin red ni workers). */
export function decodeQrFromImageData(data: Uint8ClampedArray, width: number, height: number): QrResult | null {
  const hit = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
  return hit && hit.data ? classifyQr(hit.data) : null;
}

/** Lee un QR desde un archivo de imagen, probando varias escalas (los QR pequeños en fotos grandes fallan a veces). */
export async function decodeQrFromBlob(file: Blob): Promise<QrResult | null> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    for (const max of [1600, 1000, 2400]) {
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * k));
      const h = Math.max(1, Math.round(bmp.height * k));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas no disponible');
      ctx.drawImage(bmp, 0, 0, w, h);
      const res = decodeQrFromImageData(ctx.getImageData(0, 0, w, h).data, w, h);
      if (res) return res;
    }
    return null;
  } finally {
    bmp.close();
  }
}
