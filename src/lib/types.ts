// Modelo de datos de Siculy Scout. Los ids son UUID permanentes (no se reutilizan ni cambian)
// para poder migrar a un CRM futuro sin ambigüedad. Las fechas son ISO-8601 UTC.

export const SCHEMA_VERSION = 1;

export type CompanyType = 'supplier' | 'prospect' | 'both';
export type Priority = 'high' | 'medium' | 'low';
export type OriginType = 'fair' | 'visit' | 'call' | 'web' | 'referral' | 'other';
export type MediaKind = 'photo' | 'audio';
export type PhotoCategory =
  | 'product' | 'stand' | 'catalog' | 'pricelist' | 'packaging' | 'document' | 'card' | 'other';

export interface Company {
  id: string;
  name: string; // nombre comercial (único obligatorio)
  legalName?: string;
  type: CompanyType;
  country?: string;
  city?: string;
  address?: string;
  web?: string;
  categories: string[];
  productsOfInterest: string[];
  notes?: string; // notas comerciales generales
  priority: Priority;
  createdAt: string;
  updatedAt: string;
}

/** Cada vez que se conoce/visita a la empresa: la primera es el origen. Permite varias visitas sin duplicar la empresa. */
export interface Touchpoint {
  id: string;
  companyId: string;
  originType: OriginType;
  eventName?: string;
  date: string; // YYYY-MM-DD
  city?: string;
  country?: string;
  stand?: string;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  companyId: string;
  fullName: string;
  role?: string;
  department?: string;
  email?: string;
  phone?: string;
  mobile?: string; // móvil / WhatsApp
  webOrLinkedin?: string;
  notes?: string;
  captureSource: 'manual' | 'ocr' | 'qr';
  cardPhotoId?: string; // media.id de la tarjeta
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaItem {
  id: string;
  companyId: string;
  contactId?: string;
  kind: MediaKind;
  category?: PhotoCategory;
  description?: string;
  mime: string;
  size: number;
  blob: Blob;
  thumb?: Blob; // sólo fotos
  durationMs?: number; // sólo audio
  createdAt: string;
  updatedAt: string;
}

export interface NoteItem {
  id: string;
  companyId: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface MetaRow { key: string; value: unknown }

export const TYPE_LABEL: Record<CompanyType, string> = { supplier: 'Proveedor', prospect: 'Potencial cliente', both: 'Ambos' };
export const PRIORITY_LABEL: Record<Priority, string> = { high: 'Alta', medium: 'Media', low: 'Baja' };
export const ORIGIN_LABEL: Record<OriginType, string> = {
  fair: 'Feria', visit: 'Visita', call: 'Llamada', web: 'Web', referral: 'Recomendación', other: 'Otro',
};
export const CATEGORY_LABEL: Record<PhotoCategory, string> = {
  product: 'Producto', stand: 'Stand', catalog: 'Catálogo', pricelist: 'Tarifa',
  packaging: 'Envase', document: 'Documentación', card: 'Tarjeta', other: 'Otra',
};

export const DEFAULT_EVENT = {
  originType: 'fair' as OriginType,
  eventName: 'SIAL París 2026',
  city: 'París',
  country: 'Francia',
};
