import { useEffect, useState, type ReactNode } from 'react';
import { Building2, DatabaseBackup, IdCard, QrCode, RefreshCw, Settings } from 'lucide-react';
import { db } from './lib/db';
import { requestPersistence } from './lib/storage';
import { Boundary, UiProvider, useUi } from './ui/kit';
import { useRoute } from './ui/router';
import { useSettings } from './ui/hooks';
import { Directory } from './ui/Directory';
import { NewCompany } from './ui/NewCompany';
import { CompanyView } from './ui/CompanyView';
import { ContactEditor } from './ui/ContactEditor';
import { CardCapture } from './ui/CardCapture';
import { QrCapture } from './ui/QrCapture';
import { BackupScreen } from './ui/BackupScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { ImportVcf } from './ui/ImportVcf';
import { resumeTranscriptionOnStart } from './lib/whisperClient';

function Shell() {
  const { path, parts, query } = useRoute();
  const s = useSettings();
  const ui = useUi();
  const [dbError, setDbError] = useState<string | null>(null);
  const [update, setUpdate] = useState(false);

  useEffect(() => {
    db.open().catch((e) => setDbError(String(e?.message ?? e)));
    void requestPersistence();
    const u = () => setUpdate(true);
    const o = () => ui.toast('Lista para funcionar sin conexión');
    window.addEventListener('scout:update-ready', u);
    window.addEventListener('scout:offline-ready', o);
    return () => { window.removeEventListener('scout:update-ready', u); window.removeEventListener('scout:offline-ready', o); };
  }, [ui]);

  // Una sola vez por carga de la app: retoma la cola de transcripciones (no debe reejecutarse en cada render).
  useEffect(() => { void db.open().then(() => resumeTranscriptionOnStart()).catch(() => undefined); }, []);

  if (dbError) {
    return (
      <div className="page"><div className="banner err">
        <b>No se puede abrir el almacenamiento local.</b><br />
        {dbError}<br />Comprueba que no estás en modo incógnito y que hay espacio libre en el móvil.
      </div></div>
    );
  }

  // key = id: cada ficha/contacto se monta de cero; así nunca se muestran (ni se editan) datos de la empresa anterior.
  let screen;
  if (path === '/') screen = <Directory />;
  else if (path === '/new') screen = <NewCompany initialName={query.get('name') ?? ''} />;
  else if (parts[0] === 'c' && parts[2] === 'contact') screen = <ContactEditor key={parts[1] + '/' + parts[3]} companyId={parts[1]} contactId={parts[3]} />;
  else if (parts[0] === 'c') screen = <CompanyView key={parts[1]} id={parts[1]} />;
  else if (path === '/scan/card') screen = <Boundary name="Escáner de tarjetas"><CardCapture companyId={query.get('c') ?? undefined} /></Boundary>;
  else if (path === '/scan/qr') screen = <Boundary name="Escáner QR"><QrCapture companyId={query.get('c') ?? undefined} /></Boundary>;
  else if (path === '/import') screen = <Boundary name="Importar vCard"><ImportVcf /></Boundary>;
  else if (path === '/backup') screen = <BackupScreen />;
  else if (path === '/settings') screen = <SettingsScreen />;
  else screen = <Directory />;

  const nav = (to: string, ic: ReactNode, label: string, on: boolean) => <a key={to} href={'#' + to} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}><span className="ic">{ic}</span>{label}</a>;
  return (
    <div className="app">
      {update && (
        <div className="banner info update-bar">
          <span className="grow"><b>Hay una versión nueva.</b> Termina antes lo que estés capturando.</span>
          <button className="btn sm primary" onClick={() => (window as unknown as { __scoutUpdate?: () => void }).__scoutUpdate?.()}><RefreshCw />Actualizar</button>
        </div>
      )}
      <Boundary name="Pantalla">{screen}</Boundary>
      <nav className="bottomnav">
        {nav('/', <Building2 />, 'Empresas', path === '/' || parts[0] === 'c' || path === '/new')}
        {s.qrEnabled && nav('/scan/qr', <QrCode />, 'QR', path === '/scan/qr')}
        {s.ocrEnabled && nav('/scan/card', <IdCard />, 'Tarjeta', path === '/scan/card')}
        {nav('/backup', <DatabaseBackup />, 'Copias', path === '/backup')}
        {nav('/settings', <Settings />, 'Ajustes', path === '/settings')}
      </nav>
    </div>
  );
}

export function App() {
  return <UiProvider><Shell /></UiProvider>;
}
