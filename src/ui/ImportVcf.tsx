import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { draftFromVcard, DIGITAL_CARD_HOSTS } from '../lib/importDraft';
import { parseVCards, safeHttpUrl, type QrContact } from '../lib/qrParse';
import { CaptureConfirm } from './capture';
import { Header, useUi } from './kit';
import { navigate, useRoute } from './router';

const MAX_BYTES = 10 * 1024 * 1024;

/** Lee un archivo como texto UTF-8; si no es UTF-8 válido (agendas antiguas) reintenta como Windows-1252. */
async function readText(f: Blob): Promise<string> {
  const buf = await f.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf);
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf8;
}

interface Shared { text: string; files: string[] }

/** Recupera lo que el service worker guardó al recibir un «Compartir → Siculy Scout» de Android. */
async function takeShared(id: string): Promise<Shared | null> {
  try {
    const cache = await caches.open('scout-share');
    const meta = await cache.match(`/__share/${id}/meta`);
    if (!meta) return null;
    const m = (await meta.json()) as { text?: string; url?: string; title?: string; files: number };
    const files: string[] = [];
    for (let i = 0; i < m.files; i++) {
      const r = await cache.match(`/__share/${id}/${i}`);
      if (r) { const b = await r.blob(); if (b.size <= MAX_BYTES) files.push(await readText(b)); }
    }
    for (const k of await cache.keys()) if (k.url.includes(`/__share/${id}/`)) await cache.delete(k);
    return { text: [m.text, m.url].filter(Boolean).join('\n'), files };
  } catch { return null; }
}

export function ImportVcf() {
  const { query } = useRoute();
  const companyId = query.get('c') ?? undefined;
  const shareId = query.get('share');
  const ui = useUi();
  const [contacts, setContacts] = useState<QrContact[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [picked, setPicked] = useState<boolean[]>([]);
  const [queue, setQueue] = useState<number[] | null>(null); // índices en proceso
  const [pos, setPos] = useState(0);
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = (texts: string[]) => {
    const all = texts.flatMap((t) => parseVCards(t));
    setMsg(null); setLink(null);
    if (!all.length) {
      // sin vCard: ¿es un enlace compartido (p. ej. la página de una tarjeta digital)?
      const url = texts.join('\n').split(/\s+/).map(safeHttpUrl).find(Boolean);
      if (url) { setLink(url); return; }
      setMsg('No se encontró ningún contacto vCard en el archivo. Comprueba que es un .vcf (vCard) válido.');
      return;
    }
    setContacts(all); setPicked(all.map(() => true));
    setQueue(all.length === 1 ? [0] : null); setPos(0);
  };

  useEffect(() => {
    if (!shareId) return;
    void takeShared(shareId).then((sh) => { if (sh) load([...sh.files, sh.text].filter(Boolean)); else setMsg('No se pudo recuperar lo compartido. Importa el archivo .vcf desde «Elegir archivo».'); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId]);

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []); e.target.value = '';
    if (!files.length) return;
    const big = files.find((f) => f.size > MAX_BYTES);
    if (big) { setMsg(`«${big.name}» es demasiado grande (máx. 10 MB).`); return; }
    try { load(await Promise.all(files.map(readText))); } catch { setMsg('No se pudo leer el archivo.'); }
  };

  const current = queue ? contacts[queue[pos]] : null;
  const draft = useMemo(() => (current ? draftFromVcard(current) : null), [current]);
  const linkDraft = useMemo(() => (link ? draftFromVcard({ extras: [] }, link) : null), [link]);

  const next = (cid: string) => {
    if (queue && pos + 1 < queue.length) { setPos(pos + 1); return; }
    navigate(companyId ? '/c/' + companyId : '/c/' + cid, { replace: true });
  };

  return (
    <>
      <Header title="Importar tarjeta (.vcf)" back />
      <div className="page stack">
        {!draft && !linkDraft && (
          <>
            <div className="card stack">
              <button className="btn primary block lg" onClick={() => fileRef.current?.click()}><FolderOpen />Elegir archivo .vcf</button>
              <input ref={fileRef} type="file" accept=".vcf,.vcard,text/vcard,text/x-vcard,text/directory,text/plain" multiple hidden onChange={onFiles} />
              <div className="small">
                Elige el archivo descargado (carpeta <b>Descargas</b>) desde el selector de Android. Admite varios contactos en un mismo archivo.
                Los datos no salen del móvil.
              </div>
            </div>
            <div className="card stack">
              <h2>O pega el contenido vCard</h2>
              <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="BEGIN:VCARD…END:VCARD" spellCheck={false} />
              <button className="btn" disabled={!paste.trim()} onClick={() => load([paste])}>Leer</button>
            </div>
            <div className="card small">
              <b>Tarjetas digitales (Avacard, HiHello, Blinq…)</b>: abre su enlace, pulsa «Guardar contacto / Añadir a contactos / Descargar vCard» y vuelve aquí.
              Si la plataforma no ofrece descarga, no hay forma fiable ni permitida de leerla automáticamente: usa el escáner de tarjeta (foto) o crea el contacto a mano.
              Con la app instalada, también puedes usar <i>Compartir → Siculy Scout</i> desde el visor de archivos o la página.
            </div>
          </>
        )}
        {msg && <div className="banner warn">{msg}</div>}

        {contacts.length > 1 && !queue && (
          <div className="card stack">
            <h2>{contacts.length} contactos en el archivo</h2>
            {contacts.map((c, i) => (
              <label key={i} className="row nowrap">
                <input type="checkbox" checked={picked[i]} onChange={(e) => setPicked((p) => p.map((v, j) => (j === i ? e.target.checked : v)))} />
                <span><b>{c.fullName || c.email || '(sin nombre)'}</b>{c.company ? ' · ' + c.company : ''}</span>
              </label>
            ))}
            <button className="btn primary" disabled={!picked.some(Boolean)} onClick={() => { setQueue(picked.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)); setPos(0); }}>
              Importar seleccionados (uno a uno, revisando cada uno)
            </button>
          </div>
        )}

        {draft && queue && (
          <>
            {queue.length > 1 && <div className="banner info">Contacto {pos + 1} de {queue.length}. <button className="btn sm" onClick={() => { ui.toast('Omitido'); next(''); }}>Omitir este</button></div>}
            <CaptureConfirm key={queue[pos]} source="qr" draft={draft} presetCompanyId={companyId} onSaved={next}
              />
          </>
        )}
        {linkDraft && !draft && (
          <>
            <div className="banner info">
              Se compartió un <b>enlace</b>{DIGITAL_CARD_HOSTS.test(link ?? '') ? ' de tarjeta digital' : ''}, no un archivo vCard. La app no lee páginas ajenas:
              abre el enlace, descarga el .vcf con «Guardar contacto» e impórtalo; o guarda sólo el enlace en un contacto.
            </div>
            <CaptureConfirm key={link} source="qr" draft={linkDraft} presetCompanyId={companyId} />
          </>
        )}
      </div>
    </>
  );
}
