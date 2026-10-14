// Modelo de datos de Siculy Scout. Los ids son UUID permanentes (no se reutilizan ni cambian)
// para poder migrar a un CRM futuro sin ambigüedad. Las fechas son ISO-8601 UTC.

// v2: datos corporativos de empresa (email, teléfono, dirección operativa), transcripciones de audio y notas vinculadas.
// Todos los campos nuevos son opcionales: los datos y copias v1 siguen siendo válidos sin conversión.
// v3: comentario escrito en cada nota (separado de la transcripción literal) y avisos de calidad de la transcripción.
export const SCHEMA_VERSION = 4;

export type CompanyType = 'supplier' | 'prospect' | 'both';
export type Priority = 'high' | 'medium' | 'low';
export type OriginType = 'fair' | 'visit' | 'call' | 'web' | 'referral' | 'other';
export type MediaKind = 'photo' | 'audio';
export type PhotoCategory =
  | 'product' | 'stand' | 'catalog' | 'pricelist' | 'packaging' | 'document' | 'card' | 'logo' | 'other';

/** De dónde salió un dato de la ficha (búsqueda de empresa). */
export interface FieldSource {
  source: string; // «GLEIF», «Wikidata», «OpenStreetMap»…
  url?: string; // página del registro (sólo http/https)
  at: string; // ISO
  /** El usuario modificó el valor propuesto antes de guardarlo. */
  edited?: boolean;
}

export interface Company {
  id: string;
  name: string; // nombre comercial (único obligatorio)
  legalName?: string;
  type: CompanyType;
  country?: string;
  city?: string;
  address?: string; // dirección legal / sede
  operationalAddress?: string; // dirección operativa (almacén, planta…)
  web?: string;
  email?: string; // email corporativo genérico (info@, ventas@…)
  phone?: string; // teléfono corporativo
  categories: string[];
  productsOfInterest: string[];
  notes?: string; // notas comerciales generales
  /** Logo / imagen principal: id de un archivo (kind 'photo', category 'logo') de esta empresa. Opcional: sin migración. */
  logoMediaId?: string;
  /** Sector de actividad (texto libre; p. ej. «Industria alimentaria»). Opcional. */
  sector?: string;
  /** Descripción de la actividad (texto libre). Opcional. */
  description?: string;
  /** Procedencia de los datos obtenidos automáticamente: campo → fuente y fecha. Opcional. */
  provenance?: Record<string, FieldSource>;
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

export type TranscriptStatus = 'pending' | 'processing' | 'done' | 'error';

/** Transcripción literal de un audio. `text` es lo que dijo el motor; la nota vinculada es la copia editable. */
export interface Transcript {
  status: TranscriptStatus;
  text?: string;
  language?: string; // idioma pedido al motor ('es', 'it'… o 'auto')
  detected?: string;
  model?: string;
  noteId?: string; // nota creada a partir de esta transcripción (no se duplica al reintentar)
  error?: string;
  attempts?: number;
  /** Avisos de revisión (idioma dudoso, frase inventada, cifras…). No cambian el texto. */
  warnings?: string[];
  /** true si algún aviso indica que el resultado es sospechoso (no basta con «contiene cifras»). */
  suspicious?: boolean;
  speechSeconds?: number;
  /** Reintento sin filtro de voz (audio muy bajo): más riesgo de frases inventadas. */
  noVad?: boolean;
  /** Configuración del motor usada (modelo, haces, vocabulario) para poder comparar. */
  config?: string;
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
  transcript?: Transcript; // sólo audio
  createdAt: string;
  updatedAt: string;
}

export interface NoteItem {
  id: string;
  companyId: string;
  text: string;
  kind?: 'text' | 'transcript';
  sourceMediaId?: string; // audio del que procede la transcripción
  /** Observaciones comerciales del usuario, SEPARADAS del texto (que puede ser una transcripción literal). */
  comment?: string;
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
  packaging: 'Envase', document: 'Documentación', card: 'Tarjeta', logo: 'Logo', other: 'Otra',
};

export const DEFAULT_EVENT = {
  originType: 'fair' as OriginType,
  eventName: 'SIAL París 2026',
  city: 'París',
  country: 'Francia',
};
