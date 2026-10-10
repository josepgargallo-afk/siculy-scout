import { useEffect, useRef, useState } from 'react';
import { db } from '../lib/db';
import {
  BackupError, exportAndVerify, getBackupStatus, parseBackup, planRestore, restoreBackup,
  type ExportResult, type ParsedBackup, type RestorePlan, type RestoreMode,
} from '../lib/backup';
import { companiesCsv, contactsCsv } from '../lib/csv';
import { describeSaveError, formatBytes, getStorageInfo, saveBlobAs, shareFile, type StorageInfo } from '../lib/storage';
import { Header, Spinner, useUi } from './kit';
import { useLive } from './hooks';

export function BackupScreen() {
  const ui = useUi();
  const [status] = useLive(() => getBackupStatus(), [], null);
  const [counts] = useLive(async () => ({
    companies: await db.companies.count(), contacts: await db.contacts.count(), media: await db.media.count(), notes: await db.notes.count(),
  }), [], { companies: 0, contacts: 0, media: 0, notes: 0 });
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<ExportResult | null>(null);
  const [parsed, setParsed] = useState<{ p: ParsedBackup; plan: RestorePlan; name: string } | null>(null);
  const [problems, setProblems] = useState<{ msg: string; list: string[] } | null>(null);
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [overwrite, setOverwrite] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void getStorageInfo().then(setStorage); }, []);

  const doBackup = async () => {
    setBusy('Creando copia…'); setLast(null);
    try {
      const res = await exportAndVerify((m) => setBusy(m));
      setLast(res);
      saveBlobAs(res.blob, res.filename);
      ui.toast('Copia creada y verificada');
    } catch (e) {
      ui.toast(e instanceof BackupError ? `${e.message} ${e.problems.join('; ')}` : describeSaveError(e), 'err');
    } finally { setBusy(null); }
  };

  const doCsv = async () => {
    const [c, k, t] = await Promise.all([db.companies.toArray(), db.contacts.toArray(), db.touchpoints.toArray()]);
    saveBlobAs(new Blob([companiesCsv(c, t)], { type: 'text/csv;charset=utf-8' }), 'siculy-scout-empresas.csv');
    setTimeout(() => saveBlobAs(new Blob([contactsCsv(k, c)], { type: 'text/csv;charset=utf-8' }), 'siculy-scout-contactos.csv'), 400);
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setProblems(null); setParsed(null); setBusy('Verificando archivo…');
    try {
      const p = await parseBackup(f);
      const plan = await planRestore(p, mode);
      setParsed({ p, plan, name: f.name });
    } catch (err) {
      setProblems(err instanceof BackupError ? { msg: err.message, list: err.problems } : { msg: 'No se pudo leer el archivo: ' + (err as Error).message, list: [] });
    } finally { setBusy(null); }
  };

  const doRestore = async () => {
    if (!parsed) return;
    const replace = mode === 'replace';
    const ok = await ui.confirm({
      title: replace ? 'Reemplazar TODOS los datos de este móvil' : 'Fusionar la copia con los datos actuales',
      message: replace
        ? <>Se sustituirán los datos actuales ({counts.companies} empresas) por los de la copia ({parsed.p.manifest.counts.companies}). La copia ya está verificada y el cambio es atómico: si algo falla no se pierde nada. Se recomienda hacer antes una copia de lo actual.</>
        : <>Se añadirán {parsed.plan.newCompanies} empresas nuevas. Las {parsed.plan.existingCompanies} que ya existen {overwrite ? 'se actualizarán sólo si la copia es más reciente' : 'se conservan sin cambios'}.</>,
      confirmLabel: replace ? 'Reemplazar' : 'Fusionar', danger: replace,
    });
    if (ok !== true) return;
    setBusy('Restaurando…');
    try {
      const rep = await restoreBackup(parsed.p, { mode, overwriteNewer: overwrite });
      ui.toast(replace ? 'Restauración completa' : `Fusionado: ${rep.added} nuevas, ${rep.updated} actualizadas, ${rep.skipped} sin cambios`);
      setParsed(null);
    } catch (e) { ui.toast('La restauración falló y no se modificó nada: ' + describeSaveError(e), 'err'); } finally { setBusy(null); }
  };

  const recent = status?.lastBackupAt && !status.unsaved;
  return (
    <>
      <Header title="Copias de seguridad" />
      <div className="page stack">
        <div className={'banner ' + (recent ? 'ok' : status?.hasData ? 'warn' : 'info')}>
          {!status?.hasData ? 'Aún no hay datos que copiar.'
            : recent ? `Todo está copiado (última copia: ${new Date(status!.lastBackupAt!).toLocaleString('es-ES')}).`
            : status?.lastBackupAt ? `Hay cambios posteriores a la última copia (${new Date(status.lastBackupAt).toLocaleString('es-ES')}).`
            : 'Nunca has hecho una copia. Si pierdes o reseteas el móvil, perderás los datos.'}
          <div className="small">Ahora: {counts.companies} empresas · {counts.contacts} contactos · {counts.media} fotos/audios · {counts.notes} notas</div>
        </div>

        <div className="card stack">
          <h2>Crear copia completa (ZIP)</h2>
          <div className="small">Incluye empresas, contactos, notas, fotos, audios y CSV para Excel. Se verifica al terminar: si falta cualquier archivo, no se da por buena.</div>
          <button className="btn primary block" disabled={!!busy} onClick={() => void doBackup()}>💾 Crear y descargar ZIP</button>
          {busy && <Spinner label={busy} />}
          {last && (
            <div className="banner ok">
              <b>Copia verificada ✓</b> {last.filename} · {formatBytes(last.bytes)}<br />
              {last.counts.companies} empresas · {last.counts.contacts} contactos · {last.counts.media} archivos multimedia
              <div className="row" style={{ marginTop: 6 }}>
                <button className="btn sm" onClick={() => saveBlobAs(last.blob, last.filename)}>Descargar de nuevo</button>
                <button className="btn sm" onClick={async () => { if (!(await shareFile(last.blob, last.filename, 'application/zip'))) ui.toast('Compartir no disponible: usa Descargar', 'err'); }}>Compartir / enviar</button>
              </div>
              <div className="small">Guarda el ZIP FUERA del móvil (Drive, PC, correo) para que sea una copia real.</div>
            </div>
          )}
          <button className="btn block" onClick={() => void doCsv()}>Exportar sólo CSV (Excel)</button>
        </div>

        <div className="card stack">
          <h2>Restaurar desde ZIP</h2>
          <div className="seg" role="group">
            <button className={mode === 'merge' ? 'on' : ''} onClick={() => setMode('merge')}>Fusionar</button>
            <button className={mode === 'replace' ? 'on' : ''} onClick={() => setMode('replace')}>Reemplazar todo</button>
          </div>
          <div className="small">{mode === 'merge' ? 'Añade lo que falta sin duplicar (se identifica por ID) y no pisa tus datos.' : 'Sustituye todo lo de este móvil por el contenido de la copia (útil en un móvil/ordenador nuevo).'}</div>
          {mode === 'merge' && <label className="row"><input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> Actualizar empresas existentes si la copia es más reciente</label>}
          <button className="btn block" disabled={!!busy} onClick={() => fileRef.current?.click()}>📂 Elegir archivo ZIP…</button>
          <input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={onPick} />
          {problems && (
            <div className="banner err"><b>{problems.msg}</b>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{problems.list.slice(0, 12).map((p, i) => <li key={i}>{p}</li>)}</ul>
              {problems.list.length > 12 && <div className="small">…y {problems.list.length - 12} más.</div>}
              <div className="small">Tus datos actuales no se han tocado.</div>
            </div>
          )}
          {parsed && (
            <div className="banner ok">
              <b>Archivo verificado ✓</b> ({parsed.name})<br />
              Contiene {parsed.p.manifest.counts.companies} empresas, {parsed.p.manifest.counts.contacts} contactos, {parsed.p.manifest.counts.media} archivos multimedia, {parsed.p.manifest.counts.notes} notas.<br />
              Creada {new Date(parsed.p.manifest.exportedAt).toLocaleString('es-ES')}. En este móvil ya existen {parsed.plan.existingCompanies} de esas empresas.
              <div><button className={'btn ' + (mode === 'replace' ? 'danger' : 'primary')} onClick={() => void doRestore()}>{mode === 'replace' ? 'Reemplazar…' : 'Fusionar…'}</button></div>
            </div>
          )}
        </div>

        <div className="card">
          <h2>Almacenamiento del móvil</h2>
          <dl className="kv">
            <dt>Usado</dt><dd>{formatBytes(storage?.usage)}</dd>
            <dt>Disponible (aprox.)</dt><dd>{formatBytes(storage?.quota)}</dd>
            <dt>Protegido</dt><dd>{storage?.persisted == null ? '—' : storage.persisted ? 'Sí (el navegador no lo borrará solo)' : 'No: el navegador podría borrarlo si falta espacio. Haz copias.'}</dd>
          </dl>
          <div className="small">Los datos viven sólo en este navegador. Borrar los datos de Chrome/la app, desinstalar la PWA o resetear el móvil los elimina: la copia ZIP es tu seguridad.</div>
        </div>
      </div>
    </>
  );
}
