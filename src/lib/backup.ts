import { Zip, ZipDeflate, ZipPassThrough, unzipSync, strFromU8, strToU8 } from 'fflate';
import { db } from './db';
import { companiesCsv, contactsCsv } from './csv';
import { getMeta, setMeta } from './repo';
import { nowIso } from './ids';
import {
  SCHEMA_VERSION, type Company, type Contact, type MediaItem, type NoteItem, type Touchpoint, type Transcript,
} from './types';

export const FORMAT = 'siculy-scout-backup';

export class BackupError extends Error {
  problems: string[];
  constructor(message: string, problems: string[] = []) {
    super(message);
    this.name = 'BackupError';
    this.problems = problems;
  }
}

type MediaMeta = Omit<MediaItem, 'blob' | 'thumb'> & { file: string; thumbFile?: string };

interface BackupData {
  companies: Company[];
  contacts: Contact[];
  touchpoints: Touchpoint[];
  notes: NoteItem[];
  media: MediaMeta[];
}

interface FileEntry { path: string; size: number; sha256: string }

interface Manifest {
  format: string;
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  counts: Record<keyof BackupData, number>;
  dataSha256: string;
  files: FileEntry[];
}

export const APP_VERSION = '0.3.0';

// ---------- utilidades ----------
async function sha256(data: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', data as unknown as BufferSource);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/gif': 'gif',
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-m4a': 'm4a',
};
const extFor = (mime: string) => EXT[mime.split(';')[0].trim().toLowerCase()] ?? 'bin';

async function blobBytes(b: Blob): Promise<Uint8Array> {
  return new Uint8Array(await b.arrayBuffer());
}

const README = `SICULY SCOUT - COPIA DE SEGURIDAD
==================================
manifest.json   : versión, recuentos y huellas SHA-256 de todos los archivos.
data.json       : empresas, contactos, visitas, notas y metadatos de fotos/audios.
files/media/    : fotografías y audios originales (nombre = id).
files/thumbs/   : miniaturas.
csv/            : empresas.csv y contactos.csv (Excel, separador ";").

Para restaurar: Siculy Scout > Copias > Restaurar. No modifique el contenido del ZIP.
Contiene datos personales: no lo suba a repositorios públicos.
`;

// ---------- exportación ----------
export interface ExportResult {
  blob: Blob;
  filename: string;
  counts: Manifest['counts'];
  fileCount: number;
  bytes: number;
}

export async function exportBackup(onProgress?: (msg: string) => void): Promise<ExportResult> {
  const [companies, contacts, touchpoints, notes] = await Promise.all([
    db.companies.toArray(), db.contacts.toArray(), db.touchpoints.toArray(), db.notes.toArray(),
  ]);
  const mediaIds = (await db.media.toCollection().primaryKeys()) as string[];

  const chunks: Uint8Array[] = [];
  let finished = false; let zipErr: Error | null = null;
  const zip = new Zip((err, chunk, final) => {
    if (err) { zipErr = err; return; }
    chunks.push(chunk);
    if (final) finished = true;
  });
  const addStored = (path: string, data: Uint8Array) => {
    const f = new ZipPassThrough(path); zip.add(f); f.push(data, true);
  };
  const addText = (path: string, text: string) => {
    const f = new ZipDeflate(path, { level: 6 }); zip.add(f); f.push(strToU8(text), true);
  };

  const files: FileEntry[] = [];
  const mediaMeta: MediaMeta[] = [];
  let i = 0;
  for (const id of mediaIds) {
    const m = await db.media.get(id);
    if (!m) throw new BackupError(`El elemento multimedia ${id} desapareció durante la copia`);
    onProgress?.(`Archivos ${++i}/${mediaIds.length}`);
    const bytes = await blobBytes(m.blob);
    const file = `files/media/${m.id}.${extFor(m.mime)}`;
    addStored(file, bytes);
    files.push({ path: file, size: bytes.length, sha256: await sha256(bytes) });
    let thumbFile: string | undefined;
    if (m.thumb) {
      const tb = await blobBytes(m.thumb);
      thumbFile = `files/thumbs/${m.id}.jpg`;
      addStored(thumbFile, tb);
      files.push({ path: thumbFile, size: tb.length, sha256: await sha256(tb) });
    }
    const { blob: _b, thumb: _t, ...rest } = m;
    void _b; void _t;
    mediaMeta.push({ ...rest, size: bytes.length, file, thumbFile });
  }

  const data: BackupData = { companies, contacts, touchpoints, notes, media: mediaMeta };
  const dataText = JSON.stringify(data);
  const counts = {
    companies: companies.length, contacts: contacts.length, touchpoints: touchpoints.length,
    notes: notes.length, media: mediaMeta.length,
  };
  const manifest: Manifest = {
    format: FORMAT, schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, exportedAt: nowIso(),
    counts, dataSha256: await sha256(strToU8(dataText)), files,
  };
  addText('manifest.json', JSON.stringify(manifest, null, 1));
  addText('data.json', dataText);
  addText('csv/empresas.csv', companiesCsv(companies, touchpoints));
  addText('csv/contactos.csv', contactsCsv(contacts, companies));
  addText('LEEME.txt', README);
  zip.end();
  if (zipErr) throw new BackupError('Error creando el ZIP: ' + (zipErr as Error).message);
  if (!finished) throw new BackupError('El ZIP no se completó');

  const blob = new Blob(chunks as BlobPart[], { type: 'application/zip' });
  const d = new Date(manifest.exportedAt);
  const p2 = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}`;
  return { blob, filename: `siculy-scout-${stamp}.zip`, counts, fileCount: files.length, bytes: blob.size };
}

/** Exporta, VERIFICA el ZIP resultante y sólo entonces registra la fecha de copia. */
export async function exportAndVerify(onProgress?: (msg: string) => void): Promise<ExportResult> {
  const res = await exportBackup(onProgress);
  onProgress?.('Verificando copia…');
  const parsed = await parseBackup(res.blob); // lanza BackupError si falta algo o no coincide
  for (const k of Object.keys(res.counts) as (keyof ExportResult["counts"])[]) {
    if (parsed.data[k].length !== res.counts[k]) throw new BackupError("La copia verificada no coincide con lo exportado (" + k + ")");
  }
  await setMeta("lastBackupAt", parsed.manifest.exportedAt);
  return res;
}

// ---------- lectura y validación ----------
export interface ParsedBackup {
  manifest: Manifest;
  data: BackupData;
  files: Map<string, Uint8Array>;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const optStr = (v: unknown) => v === undefined || v === null || isStr(v);

function pick<T extends object>(src: Record<string, unknown>, keys: string[]): T {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (src[k] !== undefined && src[k] !== null) out[k] = src[k];
  return out as T;
}

/** Transcripción: sólo campos conocidos y tipos válidos. Un estado «processing» no sobrevive a una restauración. */
function sanitizeTranscript(v: unknown): Transcript | undefined {
  if (!isObj(v)) return undefined;
  const st = ['pending', 'processing', 'done', 'error'].includes(String(v.status)) ? (v.status as Transcript['status']) : 'error';
  const t: Transcript = { status: st === 'processing' ? 'pending' : st, updatedAt: isStr(v.updatedAt) ? v.updatedAt : nowIso() };
  for (const k of ['text', 'language', 'detected', 'model', 'noteId', 'error', 'config'] as const) if (isStr(v[k])) t[k] = v[k] as string;
  if (typeof v.attempts === 'number') t.attempts = v.attempts;
  if (typeof v.speechSeconds === 'number') t.speechSeconds = v.speechSeconds;
  if (typeof v.suspicious === 'boolean') t.suspicious = v.suspicious;
  if (typeof v.noVad === 'boolean') t.noVad = v.noVad;
  if (Array.isArray(v.warnings)) t.warnings = v.warnings.filter(isStr).slice(0, 10);
  return t;
}

function validateData(raw: unknown): { data: BackupData; problems: string[] } {
  const problems: string[] = [];
  const empty: BackupData = { companies: [], contacts: [], touchpoints: [], notes: [], media: [] };
  if (!isObj(raw)) return { data: empty, problems: ['data.json no es un objeto'] };
  const arr = (k: keyof BackupData): Record<string, unknown>[] => {
    const v = raw[k];
    if (!Array.isArray(v)) { problems.push(`Falta la lista "${k}"`); return []; }
    return v.filter((x, i) => (isObj(x) ? true : (problems.push(`${k}[${i}] no es un objeto`), false))) as Record<string, unknown>[];
  };
  const seen = new Set<string>();
  const checkId = (k: string, o: Record<string, unknown>) => {
    if (!isStr(o.id) || !o.id) { problems.push(`${k}: registro sin id`); return false; }
    const key = k + ':' + o.id;
    if (seen.has(key)) { problems.push(`${k}: id duplicado ${o.id}`); return false; }
    seen.add(key); return true;
  };
  const d: BackupData = { companies: [], contacts: [], touchpoints: [], notes: [], media: [] };

  for (const o of arr('companies')) {
    if (!checkId('companies', o)) continue;
    if (!isStr(o.name) || !o.name.trim()) { problems.push(`Empresa ${o.id} sin nombre`); continue; }
    const c = pick<Company>(o, ['id', 'name', 'legalName', 'type', 'country', 'city', 'address', 'operationalAddress', 'web', 'email', 'phone', 'notes', 'priority', 'createdAt', 'updatedAt']);
    c.type = ['supplier', 'prospect', 'both'].includes(String(o.type)) ? (o.type as Company['type']) : 'prospect';
    c.priority = ['high', 'medium', 'low'].includes(String(o.priority)) ? (o.priority as Company['priority']) : 'medium';
    c.categories = Array.isArray(o.categories) ? o.categories.filter(isStr) : [];
    c.productsOfInterest = Array.isArray(o.productsOfInterest) ? o.productsOfInterest.filter(isStr) : [];
    c.createdAt = isStr(o.createdAt) ? o.createdAt : nowIso();
    c.updatedAt = isStr(o.updatedAt) ? o.updatedAt : c.createdAt;
    d.companies.push(c);
  }
  const companyIds = new Set(d.companies.map((c) => c.id));

  for (const o of arr('contacts')) {
    if (!checkId('contacts', o)) continue;
    if (!isStr(o.companyId) || !companyIds.has(o.companyId)) { problems.push(`Contacto ${o.id} apunta a una empresa inexistente`); continue; }
    if (!isStr(o.fullName)) { problems.push(`Contacto ${o.id} sin nombre`); continue; }
    const c = pick<Contact>(o, ['id', 'companyId', 'fullName', 'role', 'department', 'email', 'phone', 'mobile', 'webOrLinkedin', 'notes', 'cardPhotoId', 'capturedAt', 'createdAt', 'updatedAt']);
    c.captureSource = ['manual', 'ocr', 'qr'].includes(String(o.captureSource)) ? (o.captureSource as Contact['captureSource']) : 'manual';
    c.createdAt = isStr(o.createdAt) ? o.createdAt : nowIso();
    c.updatedAt = isStr(o.updatedAt) ? o.updatedAt : c.createdAt;
    c.capturedAt = isStr(o.capturedAt) ? o.capturedAt : c.createdAt;
    d.contacts.push(c);
  }
  for (const o of arr('touchpoints')) {
    if (!checkId('touchpoints', o)) continue;
    if (!isStr(o.companyId) || !companyIds.has(o.companyId)) { problems.push(`Visita ${o.id} apunta a una empresa inexistente`); continue; }
    const t = pick<Touchpoint>(o, ['id', 'companyId', 'eventName', 'date', 'city', 'country', 'stand', 'remarks', 'createdAt', 'updatedAt']);
    t.originType = ['fair', 'visit', 'call', 'web', 'referral', 'other'].includes(String(o.originType)) ? (o.originType as Touchpoint['originType']) : 'other';
    t.date = isStr(o.date) ? o.date : '';
    t.createdAt = isStr(o.createdAt) ? o.createdAt : nowIso();
    t.updatedAt = isStr(o.updatedAt) ? o.updatedAt : t.createdAt;
    d.touchpoints.push(t);
  }
  for (const o of arr('notes')) {
    if (!checkId('notes', o)) continue;
    if (!isStr(o.companyId) || !companyIds.has(o.companyId)) { problems.push(`Nota ${o.id} apunta a una empresa inexistente`); continue; }
    if (!isStr(o.text)) { problems.push(`Nota ${o.id} sin texto`); continue; }
    d.notes.push({
      id: o.id as string, companyId: o.companyId, text: o.text,
      ...(o.kind === 'transcript' || o.kind === 'text' ? { kind: o.kind } : {}),
      ...(isStr(o.sourceMediaId) ? { sourceMediaId: o.sourceMediaId } : {}),
      ...(isStr(o.comment) && o.comment ? { comment: o.comment } : {}),
      createdAt: isStr(o.createdAt) ? o.createdAt : nowIso(),
      updatedAt: isStr(o.updatedAt) ? o.updatedAt : (isStr(o.createdAt) ? o.createdAt : nowIso()),
    });
  }
  for (const o of arr('media')) {
    if (!checkId('media', o)) continue;
    if (!isStr(o.companyId) || !companyIds.has(o.companyId)) { problems.push(`Archivo ${o.id} apunta a una empresa inexistente`); continue; }
    if (!isStr(o.file) || !o.file.startsWith('files/')) { problems.push(`Archivo ${o.id} sin ruta válida`); continue; }
    if (o.kind !== 'photo' && o.kind !== 'audio') { problems.push(`Archivo ${o.id} de tipo desconocido`); continue; }
    if (!optStr(o.description) || !optStr(o.thumbFile)) { problems.push(`Archivo ${o.id} con campos inválidos`); continue; }
    const m = pick<MediaMeta>(o, ['id', 'companyId', 'contactId', 'kind', 'category', 'description', 'mime', 'durationMs', 'file', 'thumbFile', 'createdAt', 'updatedAt']);
    m.mime = isStr(o.mime) ? o.mime : 'application/octet-stream';
    const tr = sanitizeTranscript(o.transcript);
    if (tr) m.transcript = tr;
    m.size = typeof o.size === 'number' ? o.size : 0;
    m.createdAt = isStr(o.createdAt) ? o.createdAt : nowIso();
    m.updatedAt = isStr(o.updatedAt) ? o.updatedAt : m.createdAt;
    d.media.push(m);
  }
  return { data: d, problems };
}

/**
 * Lee y VERIFICA completamente un ZIP sin tocar la base de datos.
 * Lanza BackupError con la lista de problemas si algo falta, está corrupto o es de una versión no soportada.
 */
export async function parseBackup(file: Blob): Promise<ParsedBackup> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new BackupError('El archivo no es un ZIP válido o está dañado');
  }
  const mf = entries['manifest.json'];
  const df = entries['data.json'];
  if (!mf || !df) throw new BackupError('No es una copia de Siculy Scout (faltan manifest.json o data.json)');
  let manifest: Manifest;
  try { manifest = JSON.parse(strFromU8(mf)) as Manifest; } catch { throw new BackupError('manifest.json ilegible'); }
  if (!isObj(manifest) || manifest.format !== FORMAT) throw new BackupError('El ZIP no es una copia de Siculy Scout');
  if (typeof manifest.schemaVersion !== 'number' || manifest.schemaVersion > SCHEMA_VERSION) {
    throw new BackupError(`Copia de una versión más nueva (${String(manifest.schemaVersion)}). Actualiza la app antes de restaurar.`);
  }
  if (!Array.isArray(manifest.files)) throw new BackupError('manifest.json inválido');

  const problems: string[] = [];
  if ((await sha256(df)) !== manifest.dataSha256) problems.push('data.json no coincide con su huella: datos alterados o corruptos');

  const files = new Map<string, Uint8Array>();
  for (const fe of manifest.files) {
    const bytes = entries[fe.path];
    if (!bytes) { problems.push(`Falta el archivo ${fe.path}`); continue; }
    if (bytes.length !== fe.size) { problems.push(`Tamaño distinto en ${fe.path}`); continue; }
    if ((await sha256(bytes)) !== fe.sha256) { problems.push(`Huella incorrecta en ${fe.path}`); continue; }
    files.set(fe.path, bytes);
  }

  let raw: unknown;
  try { raw = JSON.parse(strFromU8(df)); } catch { throw new BackupError('data.json ilegible', problems); }
  const { data, problems: dp } = validateData(raw);
  problems.push(...dp);
  for (const m of data.media) {
    if (!files.has(m.file)) { if (!problems.some((p) => p.includes(m.file))) problems.push(`Falta el contenido de ${m.file}`); }
    if (m.thumbFile && !files.has(m.thumbFile)) problems.push(`Falta la miniatura ${m.thumbFile}`);
  }
  for (const k of Object.keys(manifest.counts || {}) as (keyof BackupData)[]) {
    if (data[k] && manifest.counts[k] !== data[k].length) problems.push(`Recuento de ${k} distinto del manifiesto`);
  }
  if (problems.length) throw new BackupError('La copia está incompleta o dañada. No se ha modificado nada.', problems);
  return { manifest, data, files };
}

// ---------- restauración ----------
export type RestoreMode = 'merge' | 'replace';

export interface RestorePlan {
  mode: RestoreMode;
  newCompanies: number;
  existingCompanies: number;
  newer: number; // registros presentes cuyo contenido en la copia es más nuevo
  total: Record<keyof BackupData, number>;
}

export async function planRestore(p: ParsedBackup, mode: RestoreMode): Promise<RestorePlan> {
  const existing = new Map((await db.companies.toArray()).map((c) => [c.id, c.updatedAt]));
  let newer = 0; let existingCount = 0;
  for (const c of p.data.companies) {
    const cur = existing.get(c.id);
    if (cur !== undefined) { existingCount++; if (c.updatedAt > cur) newer++; }
  }
  return {
    mode, newCompanies: p.data.companies.length - existingCount, existingCompanies: existingCount, newer,
    total: p.manifest.counts,
  };
}

export interface RestoreOptions {
  mode: RestoreMode;
  /** En fusión: sustituir los registros existentes por la versión de la copia si ésta es más reciente. */
  overwriteNewer?: boolean;
  /** Sólo pruebas: se invoca dentro de la transacción tras borrar/antes de escribir. */
  beforeWrite?: () => void | Promise<void>;
}

export interface RestoreReport { added: number; updated: number; skipped: number; replaced: boolean }

export async function restoreBackup(p: ParsedBackup, opts: RestoreOptions): Promise<RestoreReport> {
  const toMedia = (m: MediaMeta): MediaItem => {
    const { file, thumbFile, ...rest } = m;
    const bytes = p.files.get(file)!;
    const tb = thumbFile ? p.files.get(thumbFile) : undefined;
    return {
      ...rest,
      size: bytes.length,
      blob: new Blob([bytes as BlobPart], { type: m.mime }),
      thumb: tb ? new Blob([tb as BlobPart], { type: 'image/jpeg' }) : undefined,
    };
  };
  const report: RestoreReport = { added: 0, updated: 0, skipped: 0, replaced: opts.mode === 'replace' };
  // Todo en UNA transacción: si algo falla, Dexie revierte y la base de datos queda intacta.
  await db.transaction('rw', [db.companies, db.contacts, db.touchpoints, db.notes, db.media, db.meta], async () => {
    if (opts.mode === 'replace') {
      await Promise.all([db.companies.clear(), db.contacts.clear(), db.touchpoints.clear(), db.notes.clear(), db.media.clear()]);
      await opts.beforeWrite?.();
      await db.companies.bulkAdd(p.data.companies);
      await db.contacts.bulkAdd(p.data.contacts);
      await db.touchpoints.bulkAdd(p.data.touchpoints);
      await db.notes.bulkAdd(p.data.notes);
      for (const m of p.data.media) await db.media.add(toMedia(m));
      report.added = p.data.companies.length;
    } else {
      await opts.beforeWrite?.();
      const existingIds = new Map((await db.companies.toArray()).map((c) => [c.id, c.updatedAt]));
      const overwrite = new Set<string>();
      for (const c of p.data.companies) {
        const cur = existingIds.get(c.id);
        if (cur === undefined) { await db.companies.add(c); report.added++; }
        else if (opts.overwriteNewer && c.updatedAt > cur) { await db.companies.put(c); overwrite.add(c.id); report.updated++; }
        else report.skipped++;
      }
      const ids = async <T extends { id: string; companyId: string }>(table: { get(id: string): Promise<unknown> }, rows: T[], put: (r: T) => Promise<unknown>) => {
        for (const r of rows) {
          const exists = await table.get(r.id);
          if (!exists || overwrite.has(r.companyId)) await put(r);
        }
      };
      // Los hijos de empresas existentes (no sobrescritas) se añaden si faltan; nunca se pisan.
      await ids(db.contacts, p.data.contacts, (r) => db.contacts.put(r));
      await ids(db.touchpoints, p.data.touchpoints, (r) => db.touchpoints.put(r));
      await ids(db.notes, p.data.notes, (r) => db.notes.put(r));
      await ids(db.media, p.data.media, (r) => db.media.put(toMedia(r)));
    }
    await db.meta.put({ key: 'lastChangeAt', value: nowIso() });
  });
  return report;
}

// ---------- aviso de copia pendiente ----------
export interface BackupStatus {
  lastBackupAt: string | null;
  hasData: boolean;
  unsaved: boolean;
  hoursSince: number | null;
  /** true si procede avisar al usuario. */
  shouldWarn: boolean;
}

export async function getBackupStatus(warnAfterHours = 12): Promise<BackupStatus> {
  const lastBackupAt = await getMeta<string | null>('lastBackupAt', null);
  const lastChangeAt = await getMeta<string | null>('lastChangeAt', null);
  const hasData = (await db.companies.count()) > 0;
  const unsaved = hasData && (!lastBackupAt || (!!lastChangeAt && lastChangeAt > lastBackupAt));
  const hoursSince = lastBackupAt ? (Date.now() - Date.parse(lastBackupAt)) / 36e5 : null;
  const shouldWarn = unsaved && (hoursSince === null || hoursSince >= warnAfterHours);
  return { lastBackupAt, hasData, unsaved, hoursSince, shouldWarn };
}
