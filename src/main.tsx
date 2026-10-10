import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// Service worker: la app funciona sin conexión tras la primera carga.
// registerType "prompt": nunca se recarga sola en mitad de una captura; se avisa en Ajustes/banner.
const updateSW = registerSW({
  onNeedRefresh() { window.dispatchEvent(new CustomEvent('scout:update-ready')); },
  onOfflineReady() { window.dispatchEvent(new CustomEvent('scout:offline-ready')); },
});
(window as unknown as { __scoutUpdate?: () => void }).__scoutUpdate = () => { void updateSW(true); };
