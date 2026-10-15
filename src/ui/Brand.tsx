import { useId } from 'react';

// Identidad OCCASORIO (kit v1). El símbolo reproduce exactamente los trazados de
// public/brand/simbolo_color.svg; va en línea para que funcione sin red y sin peticiones extra.
// El logotipo del kit escribe «occasorio» como texto (Inter Display/Inter 700, interletraje -2,4 sobre 73 px):
// aquí se compone igual, con la Inter integrada en la app, para que no dependa de fuentes del sistema.

export const BRAND_NAME = 'OCCASORIO';
export const BRAND_TAGLINE = 'Discover. Capture. Grow.';
export const BRAND_MESSAGE = 'Las oportunidades están en todas partes.';
export const BRAND_DESCRIPTION = 'Captura empresas, contactos e ideas comerciales dondequiera que aparezcan. Conserva fotografías, notas y contexto para volver a ellas cuando lo necesites.';

type Tone = 'color' | 'white' | 'mono';

export function BrandSymbol({ size = 28, tone = 'color', title }: { size?: number; tone?: Tone; title?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const outer = tone === 'color' ? `url(#occ-b-${uid})` : tone === 'white' ? '#ffffff' : 'var(--night)';
  const inner = tone === 'color' ? `url(#occ-g-${uid})` : outer;
  const dot = tone === 'color' ? '#FF816C' : outer;
  const spark = tone === 'white' ? '#ffffff' : '#F9FFFF';
  return (
    <svg className="brand-symbol" viewBox="0 0 128 128" width={size} height={size} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      {tone === 'color' && (
        <defs>
          <linearGradient id={`occ-b-${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#4B67C5" /><stop offset="48%" stopColor="#2CBDB9" /><stop offset="100%" stopColor="#1C8EAD" /></linearGradient>
          <linearGradient id={`occ-g-${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#2CBDB9" /><stop offset="100%" stopColor="#4B67C5" /></linearGradient>
        </defs>
      )}
      <path d="M 42 31 C 59 18 82 20 96 35 C 104 44 107 55 106 65" stroke={outer} strokeWidth="19" fill="none" strokeLinecap="round" />
      <path d="M 100 88 C 88 105 63 111 43 100 C 24 90 17 70 24 51 C 27 44 32 38 36 35" stroke={inner} strokeWidth="19" fill="none" strokeLinecap="round" />
      <path d="M 47 80 Q 65 79 82 61" stroke={spark} strokeWidth="9" fill="none" strokeLinecap="round" opacity="0.96" />
      <circle cx="107" cy="83" r="8.5" fill={dot} />
    </svg>
  );
}

/**
 * Icono de aplicación aprobado (public/brand/app_icon.svg, trazados idénticos): símbolo completo sobre
 * azul noche. El trazo blanco interior sólo se ve sobre fondo oscuro; sobre marfil queda invisible y el
 * símbolo parece un simple anillo. Por eso, sobre fondos claros la marca se muestra con este icono
 * (el mismo que el de la app instalada) y no con el símbolo suelto.
 */
export function BrandAppIcon({ size = 32, title }: { size?: number; title?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg className="brand-symbol" viewBox="0 0 512 512" width={size} height={size} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      <defs>
        <linearGradient id={`occ-ib-${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#4B67C5" /><stop offset="48%" stopColor="#2CBDB9" /><stop offset="100%" stopColor="#1C8EAD" /></linearGradient>
        <linearGradient id={`occ-ig-${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#2CBDB9" /><stop offset="100%" stopColor="#4B67C5" /></linearGradient>
      </defs>
      <rect x="0" y="0" width="512" height="512" rx="114" fill="#0E1B34" />
      <g transform="translate(48 48) scale(3.25)">
        <path d="M 42 31 C 59 18 82 20 96 35 C 104 44 107 55 106 65" stroke={`url(#occ-ib-${uid})`} strokeWidth="19" fill="none" strokeLinecap="round" />
        <path d="M 100 88 C 88 105 63 111 43 100 C 24 90 17 70 24 51 C 27 44 32 38 36 35" stroke={`url(#occ-ig-${uid})`} strokeWidth="19" fill="none" strokeLinecap="round" />
        <path d="M 47 80 Q 65 79 82 61" stroke="#F9FFFF" strokeWidth="9" fill="none" strokeLinecap="round" opacity="0.96" />
        <circle cx="107" cy="83" r="8.5" fill="#FF816C" />
      </g>
    </svg>
  );
}

/** Logotipo horizontal: marca + «occasorio». `dark` = sobre fondo oscuro (símbolo del kit y letras blancas). */
export function BrandLogo({ size = 28, dark = false, claim = false }: { size?: number; dark?: boolean; claim?: boolean }) {
  return (
    <span className={'brand-logo' + (dark ? ' dark' : '')} role="img" aria-label={BRAND_NAME} style={{ ['--bl' as string]: size + 'px' }}>
      {dark ? <BrandSymbol size={size} /> : <BrandAppIcon size={size} />}
      <span className="brand-text" aria-hidden="true">
        <span className="brand-word">occasorio</span>
        {claim && <span className="brand-claim">{BRAND_TAGLINE}</span>}
      </span>
    </span>
  );
}
