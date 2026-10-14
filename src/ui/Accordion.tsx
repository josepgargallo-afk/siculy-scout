import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Sección plegable. El contenido SIEMPRE queda montado (sólo se oculta): así un formulario con cambios sin guardar,
 * una grabación o una transcripción en curso no se interrumpen al plegar.
 */
export function Acc({ id, icon, title, summary, badge, open, onToggle, children }: {
  id: string; icon: ReactNode; title: string; summary: ReactNode; badge?: ReactNode; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  return (
    <section className={'acc' + (open ? ' open' : '')} id={id}>
      <button type="button" className="acc-h" aria-expanded={open} aria-controls={id + '-body'} onClick={onToggle}>
        <span className="acc-ic" aria-hidden="true">{icon}</span>
        <span className="acc-t"><b>{title}</b><span className="acc-s">{summary}</span></span>
        {badge}
        <span className="acc-ch" aria-hidden="true"><ChevronDown /></span>
      </button>
      <div className="acc-b" id={id + '-body'} hidden={!open}>{children}</div>
    </section>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const summaries = {
  data: (c: { country?: string; city?: string; type: string }, typeLabel: string) => [c.country || c.city, typeLabel].filter(Boolean).join(' · '),
  contacts: (n: number) => (n ? plural(n, 'contacto', 'contactos') : 'Sin contactos'),
  photos: (n: number) => (n ? plural(n, 'fotografía', 'fotografías') : 'Sin fotografías'),
  notes: (n: number, busy: number) => (n ? plural(n, 'nota', 'notas') : 'Sin notas') + (busy ? ` · ${busy} transcribiendo…` : ''),
  visits: (first: string | undefined, n: number) => (first ? first + (n > 1 ? ` · ${n} registros` : '') : 'Sin registros'),
};
