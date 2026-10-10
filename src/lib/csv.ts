import type { Company, Contact, Touchpoint } from './types';
import { ORIGIN_LABEL, PRIORITY_LABEL, TYPE_LABEL } from './types';

// CSV para Excel en configuración regional española: separador ';' y BOM UTF-8.
const SEP = ';';

/** Neutraliza "inyección de fórmulas" (=, +, -, @ al inicio) al abrir en Excel. */
export function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[";\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(SEP), ...rows.map((r) => r.map(csvCell).join(SEP))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function companiesCsv(companies: Company[], touchpoints: Touchpoint[]): string {
  const first = new Map<string, Touchpoint>();
  [...touchpoints].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach((t) => { if (!first.has(t.companyId)) first.set(t.companyId, t); });
  return toCsv(
    ['id', 'nombre_comercial', 'nombre_legal', 'tipo', 'pais', 'ciudad', 'direccion', 'web', 'categorias', 'productos_interes',
      'notas', 'prioridad', 'origen_tipo', 'evento', 'fecha_origen', 'stand', 'creado', 'modificado'],
    companies.map((c) => {
      const t = first.get(c.id);
      return [c.id, c.name, c.legalName, TYPE_LABEL[c.type], c.country, c.city, c.address, c.web,
        c.categories.join(', '), c.productsOfInterest.join(', '), c.notes, PRIORITY_LABEL[c.priority],
        t ? ORIGIN_LABEL[t.originType] : '', t?.eventName, t?.date, t?.stand, c.createdAt, c.updatedAt];
    }),
  );
}

export function contactsCsv(contacts: Contact[], companies: Company[]): string {
  const byId = new Map(companies.map((c) => [c.id, c.name]));
  return toCsv(
    ['id', 'empresa_id', 'empresa', 'nombre', 'cargo', 'departamento', 'email', 'telefono', 'movil_whatsapp', 'web_linkedin', 'notas', 'origen_captura', 'capturado'],
    contacts.map((c) => [c.id, c.companyId, byId.get(c.companyId) ?? '', c.fullName, c.role, c.department, c.email, c.phone, c.mobile,
      c.webOrLinkedin, c.notes, c.captureSource, c.capturedAt]),
  );
}
