// Identidad OCCASORIO (Brand Kit v2, docs/marca/MARCA.md). El logotipo y el símbolo son imágenes SVG del kit
// (public/brand/), precacheadas por el service worker: funcionan sin conexión y no dependen de fuentes.
// El símbolo es una reconstrucción vectorial del tablero original; el logotipo está en contornos (Outfit, OFL).

export const BRAND_NAME = 'OCCASORIO';
export const BRAND_TAGLINE = 'Discover. Capture. Grow.';
export const BRAND_MESSAGE = 'Las oportunidades están en todas partes.';
export const BRAND_DESCRIPTION = 'Captura empresas, contactos e ideas comerciales dondequiera que aparezcan. Conserva fotografías, notas y contexto para volver a ellas cuando lo necesites.';

const BASE = import.meta.env.BASE_URL;
// Proporción del kit (viewBox 644×164, con y sin lema); símbolo suelto 800×800.
const RATIO = 644 / 164;

/** Logotipo horizontal. `claim` añade el lema «Discover. Capture. Grow.»; `dark` = para fondos oscuros. */
export function BrandLogo({ height = 28, claim = false, dark = false }: { height?: number; claim?: boolean; dark?: boolean }) {
  const file = `logo_horizontal_${claim ? '' : 'sin_lema_'}${dark ? 'oscuro' : 'claro'}.svg`;
  const w = Math.round(height * RATIO);
  return <img className="brand-img" src={`${BASE}brand/${file}`} alt={BRAND_NAME} width={w} height={height} decoding="async" />;
}

/** Símbolo suelto (corona con cinta y punto). */
export function BrandSymbol({ size = 32 }: { size?: number }) {
  return <img className="brand-img" src={`${BASE}brand/simbolo.svg`} alt={BRAND_NAME} width={size} height={size} decoding="async" />;
}
