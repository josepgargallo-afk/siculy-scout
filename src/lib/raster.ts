// Operaciones de imagen en JS puro sobre píxeles RGBA. Se usan igual en el navegador y en las pruebas de Node,
// de modo que lo que se mide en las pruebas es exactamente lo que ejecuta el móvil.

export interface Raster { data: Uint8ClampedArray; width: number; height: number }
export type Rotation = 0 | 90 | 180 | 270;

export function makeRaster(width: number, height: number): Raster {
  return { data: new Uint8ClampedArray(width * height * 4), width, height };
}

/** Giro en sentido horario (múltiplos de 90°). */
export function rotateRaster(r: Raster, deg: Rotation): Raster {
  if (deg === 0) return r;
  const { width: w, height: h, data: s } = r;
  const out = deg === 180 ? makeRaster(w, h) : makeRaster(h, w);
  const d = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      let dx: number; let dy: number;
      if (deg === 90) { dx = h - 1 - y; dy = x; }
      else if (deg === 270) { dx = y; dy = w - 1 - x; }
      else { dx = w - 1 - x; dy = h - 1 - y; }
      const di = (dy * out.width + dx) * 4;
      d[di] = s[si]; d[di + 1] = s[si + 1]; d[di + 2] = s[si + 2]; d[di + 3] = s[si + 3];
    }
  }
  return out;
}

export interface Rect { x: number; y: number; w: number; h: number }

export function cropRaster(r: Raster, c: Rect): Raster {
  const x0 = Math.max(0, Math.round(c.x)); const y0 = Math.max(0, Math.round(c.y));
  const w = Math.max(1, Math.min(r.width - x0, Math.round(c.w))); const h = Math.max(1, Math.min(r.height - y0, Math.round(c.h)));
  const out = makeRaster(w, h);
  for (let y = 0; y < h; y++) {
    const so = ((y0 + y) * r.width + x0) * 4;
    out.data.set(r.data.subarray(so, so + w * 4), y * w * 4);
  }
  return out;
}

/** Reducción por promedio de área (conserva la legibilidad del texto fino mejor que el vecino más próximo). */
export function downscale(r: Raster, maxSide: number): Raster {
  const k = maxSide / Math.max(r.width, r.height);
  if (k >= 1) return r;
  const ow = Math.max(1, Math.round(r.width * k)); const oh = Math.max(1, Math.round(r.height * k));
  const out = makeRaster(ow, oh);
  const sx = r.width / ow; const sy = r.height / oh;
  for (let y = 0; y < oh; y++) {
    const y0 = Math.floor(y * sy); const y1 = Math.min(r.height, Math.max(y0 + 1, Math.ceil((y + 1) * sy)));
    for (let x = 0; x < ow; x++) {
      const x0 = Math.floor(x * sx); const x1 = Math.min(r.width, Math.max(x0 + 1, Math.ceil((x + 1) * sx)));
      let a = 0; let g = 0; let b = 0; let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        let i = (yy * r.width + x0) * 4;
        for (let xx = x0; xx < x1; xx++, i += 4) { a += r.data[i]; g += r.data[i + 1]; b += r.data[i + 2]; n++; }
      }
      const o = (y * ow + x) * 4;
      out.data[o] = a / n; out.data[o + 1] = g / n; out.data[o + 2] = b / n; out.data[o + 3] = 255;
    }
  }
  return out;
}

/**
 * Escala de grises + estiramiento de contraste por percentiles (1 %–99 %), con una compensación suave de
 * iluminación desigual (resta del fondo local a baja resolución). Si la mayor parte de la imagen es oscura
 * se invierte para dejar texto oscuro sobre fondo claro.
 */
export function enhanceForOcr(r: Raster, opts: { flatten?: boolean } = {}): Raster {
  const n = r.width * r.height;
  const gray = new Uint8ClampedArray(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) gray[i] = (r.data[p] * 299 + r.data[p + 1] * 587 + r.data[p + 2] * 114) / 1000;

  let src: Uint8ClampedArray = gray;
  if (opts.flatten) src = flattenBackground(gray, r.width, r.height);

  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[src[i]]++;
  const pct = (q: number) => { let acc = 0; const t = n * q; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= t) return v; } return 255; };
  const lo = pct(0.01); const hi = Math.max(lo + 8, pct(0.99));
  let mean = 0; for (let i = 0; i < n; i++) mean += src[i]; mean /= n;
  const invert = mean < 105; // fondo mayoritariamente oscuro

  const out = makeRaster(r.width, r.height);
  const scale = 255 / (hi - lo);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    let v = (src[i] - lo) * scale;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    if (invert) v = 255 - v;
    out.data[p] = out.data[p + 1] = out.data[p + 2] = v; out.data[p + 3] = 255;
  }
  return out;
}

/** Divide cada píxel por el fondo local (máximo filtrado a baja resolución): elimina sombras y degradados. */
function flattenBackground(gray: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const bs = Math.max(16, Math.round(Math.min(w, h) / 20));
  const gw = Math.ceil(w / bs); const gh = Math.ceil(h / bs);
  const bg = new Float32Array(gw * gh);
  for (let by = 0; by < gh; by++) for (let bx = 0; bx < gw; bx++) {
    let mx = 0;
    for (let y = by * bs; y < Math.min(h, (by + 1) * bs); y += 2) for (let x = bx * bs; x < Math.min(w, (bx + 1) * bs); x += 2) { const v = gray[y * w + x]; if (v > mx) mx = v; }
    bg[by * gw + bx] = mx;
  }
  // suavizado 3x3 del mapa de fondo
  const sm = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    let s = 0; let c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy; const xx = x + dx; if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) { s += bg[yy * gw + xx]; c++; } }
    sm[y * gw + x] = s / c;
  }
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(gh - 1, y / bs); const y0 = Math.floor(fy);
    for (let x = 0; x < w; x++) {
      const fx = Math.min(gw - 1, x / bs); const x0 = Math.floor(fx);
      const b = sm[y0 * gw + x0] || 1;
      const v = (gray[y * w + x] / Math.max(b, 40)) * 255;
      out[y * w + x] = v > 255 ? 255 : v;
    }
  }
  return out;
}
