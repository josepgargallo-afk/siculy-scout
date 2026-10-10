import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/db';
import { addMedia, deleteMedia, deleteNote, saveNote } from '../lib/repo';
import { recordingSupported, startRecording, type ActiveRecorder } from '../lib/recorder';
import { speechSupported, startDictation } from '../lib/speech';
import { describeSaveError, formatBytes } from '../lib/storage';
import { getSettings, saveSettings } from '../lib/settings';
import { WHISPER_LANG_CHOICES } from '../lib/audioPrep';
import { deleteNoteKeepAudio, enqueueTranscription, originalTranscript, restoreNoteFromTranscript } from '../lib/transcribe';
import { kickTranscription } from '../lib/whisperClient';
import type { MediaItem, NoteItem } from '../lib/types';
import { buildTimeline } from '../lib/timeline';
import { fmtDate, useUi } from './kit';
import { useDraft, useLive, useObjectUrl, useSettings } from './hooks';

const fmtDur = (ms?: number) => { const s = Math.round((ms ?? 0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const langTag = (l?: string) => (l ? l.toUpperCase() : '');

function LangChips({ value, onChange, label }: { value: string; onChange: (l: string) => void; label?: string }) {
  return (
    <div className="row" role="group" aria-label={label ?? 'Idioma'} style={{ gap: 4 }}>
      {Object.keys(WHISPER_LANG_CHOICES).map((k) => (
        <button key={k} type="button" className={'btn sm ' + (value === k ? 'primary' : '')} style={{ minHeight: 32, padding: '0 10px' }} onClick={() => onChange(k)} title={WHISPER_LANG_CHOICES[k]}>{k === 'auto' ? 'AUTO' : k.toUpperCase()}</button>
      ))}
    </div>
  );
}

/** Reproductor SÓLO cuando se pide (plegado por defecto). */
function Player({ media }: { media: MediaItem }) {
  const url = useObjectUrl(media.blob);
  return url ? <audio controls autoPlay preload="auto" src={url} /> : null;
}

function StatusBadge({ media }: { media?: MediaItem }) {
  const t = media?.transcript;
  if (!t) return null;
  if (t.status === 'pending') return <span className="chip">⏳ En cola</span>;
  if (t.status === 'processing') return <span className="chip"><span className="spinner" style={{ display: 'inline-block', width: 10, height: 10, borderWidth: 2, verticalAlign: 'middle', marginRight: 4 }} />Transcribiendo</span>;
  if (t.status === 'error') return <span className="chip" style={{ background: '#fde8e6', color: '#9c2b20' }}>⚠ Error</span>;
  return t.suspicious ? <span className="chip" style={{ background: '#fff4d6', color: '#8a5a00' }}>⚠ Revisar</span> : <span className="chip supplier">✓ Transcrito</span>;
}

function NoteCard({ note, media }: { note: NoteItem; media?: MediaItem }) {
  const ui = useUi();
  const set = useSettings();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);
  const [expanded, setExpanded] = useState(false);
  const [player, setPlayer] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState(note.comment ?? '');
  const [lang, setLang] = useState(media?.transcript?.language ?? set.transcriptionLang);
  const t = media?.transcript;
  const long = note.text.length > 240 || note.text.split('\n').length > 4;
  const when = media?.createdAt ?? note.createdAt;
  const showComment = !!note.comment || commenting;
  const warns = (t?.warnings ?? []).filter((w) => !w.startsWith('Contiene cifras') && !w.startsWith('Aparecen términos'));
  const vocabWarn = (t?.warnings ?? []).find((w) => w.startsWith('Aparecen términos'));
  const hasDigits = (t?.warnings ?? []).some((w) => w.startsWith('Contiene cifras'));

  const saveText = async () => {
    const v = text.trim();
    if (!v) { ui.toast('El texto no puede quedar vacío', 'err'); return; }
    try { await saveNote({ id: note.id, companyId: note.companyId, text: v, kind: note.kind, sourceMediaId: note.sourceMediaId }); setEditing(false); } catch (e) { ui.toast(describeSaveError(e), 'err'); }
  };
  const saveComment = async () => {
    try { await saveNote({ id: note.id, companyId: note.companyId, text: note.text, comment: comment.trim() || null }); if (!comment.trim()) setCommenting(false); } catch (e) { ui.toast(describeSaveError(e), 'err'); }
  };
  // Autoguardado del comentario (además de al salir del campo): no se pierde si se cierra la app tras escribir.
  useEffect(() => {
    if (comment === (note.comment ?? '')) return;
    const t = window.setTimeout(() => { void saveComment(); }, 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comment]);
  const remove = async () => {
    if (media) {
      const ans = await ui.confirm({
        title: '¿Eliminar esta nota?',
        message: 'Es la transcripción de un audio. Puedes eliminar la nota y el audio, o sólo la nota (el audio y su texto original se conservan).',
        confirmLabel: 'Eliminar nota y audio', danger: true, extra: [{ label: 'Sólo la nota', value: 'note' }],
      });
      if (ans === 'note') await deleteNoteKeepAudio(note.id);
      else if (ans === true) { await deleteNote(note.id); await deleteMedia(media.id); }
    } else if (await ui.confirm({ title: '¿Eliminar la nota?', confirmLabel: 'Eliminar', danger: true }) === true) await deleteNote(note.id);
  };
  const retry = async (noVad = false) => {
    if (!media) return;
    if (!set.whisperInstalled) { ui.toast('Primero descarga el modelo en Ajustes → Transcripción de audio', 'err'); return; }
    await enqueueTranscription(media.id, lang, { noVad });
    void kickTranscription({ force: true });
  };
  const restoreOriginal = async () => {
    if (!media) return;
    const o = await originalTranscript(media.id);
    if (o) { await saveNote({ id: note.id, companyId: note.companyId, text: o, kind: note.kind, sourceMediaId: note.sourceMediaId }); setText(o); }
  };

  return (
    <article className="ncard" id={'note-' + note.id}>
      <div className="nhead">
        <span className="small">{fmtDate(when)}</span>
        {media && <span className="chip">🎙 {fmtDur(media.durationMs)}</span>}
        {t?.language && <span className="chip">{langTag(t.language)}</span>}
        {media ? <StatusBadge media={media} /> : <span className="chip">✎ Nota</span>}
      </div>

      {editing ? (
        <div className="stack">
          <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Editar texto" />
          <div className="row">
            <button className="btn primary sm" onClick={() => void saveText()}>Guardar</button>
            <button className="btn sm" onClick={() => { setText(note.text); setEditing(false); }}>Cancelar</button>
            {media?.transcript?.text && media.transcript.text !== text && <button className="btn sm" onClick={() => void restoreOriginal()}>↺ Texto original</button>}
          </div>
        </div>
      ) : (
        <>
          <div className={'ntext' + (long && !expanded ? ' clamp' : '')}>{note.text}</div>
          {long && <button className="linkbtn" onClick={() => setExpanded((v) => !v)}>{expanded ? 'Ver menos' : 'Ver más'}</button>}
        </>
      )}

      {warns.length > 0 && <div className="nwarn">⚠ Revisa esta transcripción: {warns.join(' ')}</div>}
      {vocabWarn && <div className="small">ℹ {vocabWarn}</div>}
      {hasDigits && !warns.length && <div className="small">Contiene cifras: comprueba cantidades, pesos y precios con el audio.</div>}
      {t?.status === 'error' && <div className="nwarn">⚠ {t.error ?? 'Error de transcripción'} — el audio se conserva.</div>}
      {media && t?.text && t.text !== note.text && !editing && <div className="small">Editada (el texto original del reconocimiento se conserva).</div>}

      {showComment && (
        <div className="ncomment">
          <div className="small"><b>💬 Comentario</b> (tuyo, separado de la transcripción)</div>
          <textarea value={comment} placeholder="Observaciones comerciales: precios, condiciones, próximos pasos…" onChange={(e) => setComment(e.target.value)} onBlur={() => void saveComment()} />
        </div>
      )}

      <div className="row nactions">
        {!editing && <button className="btn sm" onClick={() => { setText(note.text); setEditing(true); }}>✏ Editar</button>}
        {media && <button className="btn sm" onClick={() => setPlayer((v) => !v)}>{player ? '■ Ocultar audio' : '▶ Escuchar audio'}</button>}
        {!showComment && <button className="btn sm" onClick={() => setCommenting(true)}>💬 Añadir comentario</button>}
        <button className="btn sm" onClick={() => void remove()} aria-label="Eliminar">🗑</button>
      </div>
      {media && player && <Player media={media} />}
      {media && (t?.status === 'done' || t?.status === 'error') && (
        <details className="small">
          <summary>Volver a transcribir</summary>
          <div className="row" style={{ marginTop: 6 }}>
            <LangChips value={lang} onChange={setLang} label="Idioma del audio" />
            <button className="btn sm" onClick={() => void retry()}>↻ Transcribir de nuevo</button>
            {t?.status === 'error' && <button className="btn sm" onClick={() => void retry(true)}>Forzar sin filtro de voz</button>}
          </div>
          {t?.status === 'error' && <div className="small">«Forzar» sirve si el audio es muy bajo y se descartó como silencio; puede inventar texto: revisa el resultado.</div>}
          <div className="small">No se duplica la nota; si la editaste, no se pisa.</div>
        </details>
      )}
    </article>
  );
}

function JobCard({ media }: { media: MediaItem }) {
  const [player, setPlayer] = useState(false);
  const set = useSettings();
  return (
    <article className="ncard job">
      <div className="nhead">
        <span className="small">{fmtDate(media.createdAt)}</span>
        <span className="chip">🎙 {fmtDur(media.durationMs)}</span>
        {media.transcript?.language && <span className="chip">{langTag(media.transcript.language)}</span>}
        <StatusBadge media={media} />
      </div>
      <div className="small">{media.transcript?.status === 'processing' ? 'Transcribiendo… el audio ya está guardado; el texto aparecerá aquí.' : 'En cola para transcribir.'}
        {media.transcript?.status === 'pending' && set.whisperInstalled && !set.transcriptionEnabled && <> <button className="btn sm" onClick={() => void kickTranscription({ force: true })}>▶ Transcribir ahora</button></>}
      </div>
      <div className="row nactions"><button className="btn sm" onClick={() => setPlayer((v) => !v)}>{player ? '■ Ocultar audio' : '▶ Escuchar audio'}</button></div>
      {player && <Player media={media} />}
    </article>
  );
}

function UntranscribedRow({ media }: { media: MediaItem }) {
  const ui = useUi();
  const set = useSettings();
  const [player, setPlayer] = useState(false);
  const [lang, setLang] = useState(media.transcript?.language ?? set.transcriptionLang);
  const t = media.transcript;
  const run = async (noVad = false) => {
    if (!set.whisperInstalled) { ui.toast('Primero descarga el modelo en Ajustes → Transcripción de audio', 'err'); return; }
    await enqueueTranscription(media.id, lang, { noVad });
    void kickTranscription({ force: true });
  };
  return (
    <div className="urow">
      <div className="row nowrap">
        <span className="small grow">{fmtDate(media.createdAt)} · 🎙 {fmtDur(media.durationMs)} · {formatBytes(media.size)}{t?.status === 'error' ? ' · ⚠ ' + (t.error ?? 'error') : ''}</span>
        <button className="btn sm" onClick={() => setPlayer((v) => !v)}>{player ? '■' : '▶'}</button>
        <button className="btn sm" aria-label="Eliminar audio" onClick={async () => { if (await ui.confirm({ title: '¿Eliminar audio?', message: 'No se puede deshacer.', confirmLabel: 'Eliminar', danger: true }) === true) await deleteMedia(media.id); }}>🗑</button>
      </div>
      {player && <Player media={media} />}
      <div className="row">
        <LangChips value={lang} onChange={setLang} />
        {t?.text && <button className="btn sm" onClick={() => void restoreNoteFromTranscript(media.id)}>Recuperar nota</button>}
        <button className="btn sm" onClick={() => void run()}>{t?.status === 'error' ? '↻ Reintentar' : '📝 Transcribir'}</button>
        {t?.status === 'error' && /voz/.test(t.error ?? '') && <button className="btn sm" onClick={() => void run(true)}>Forzar sin filtro de voz</button>}
      </div>
    </div>
  );
}

export function NotesAudioSection({ companyId, startSignal }: { companyId: string; startSignal: number }) {
  const ui = useUi();
  const set = useSettings();
  const [notes] = useLive(() => db.notes.where('companyId').equals(companyId).toArray(), [companyId], [] as NoteItem[]);
  const [audios] = useLive(() => db.media.where('companyId').equals(companyId).filter((m) => m.kind === 'audio').toArray(), [companyId], [] as MediaItem[]);
  const [d, setD, discard] = useDraft<{ text: string }>('note:' + companyId, { text: '' });
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [lang, setLang] = useState(set.transcriptionLang);
  const [openGroup, setOpenGroup] = useState(false);
  const [dictating, setDictating] = useState<{ stop(): void } | null>(null);
  const rec = useRef<ActiveRecorder | null>(null);
  const timer = useRef<number>(undefined);
  const listRef = useRef<HTMLDivElement>(null);

  const { items, loose } = useMemo(() => buildTimeline(notes, audios), [notes, audios]);

  const addNote = async () => {
    const text = d.text.trim();
    if (!text) return;
    try { await saveNote({ companyId, text, kind: 'text' }); discard(); setD({ text: '' }); } catch (e) { ui.toast(describeSaveError(e), 'err'); }
  };

  const start = async () => {
    if (rec.current) return;
    try {
      rec.current = await startRecording({ raw: getSettings().rawMic });
      setRecording(true); setSecs(0);
      const t0 = Date.now();
      timer.current = window.setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 500);
    } catch (e) { ui.toast((e as Error).message, 'err'); }
  };
  const stop = async () => {
    const r = rec.current; rec.current = null;
    window.clearInterval(timer.current); setRecording(false);
    if (!r) return;
    try {
      const out = await r.stop();
      // 1) el audio original se guarda INMEDIATAMENTE
      const saved = await addMedia({ companyId, kind: 'audio', mime: out.mime, size: out.blob.size, blob: out.blob, durationMs: out.durationMs });
      saveSettings({ transcriptionLang: lang });
      const st = getSettings();
      if (st.transcriptionEnabled && st.whisperInstalled) {
        // 2) transcripción automática: aparece arriba como tarjeta «transcribiendo»
        await enqueueTranscription(saved.id, lang);
        void kickTranscription();
        ui.toast('Audio guardado · transcribiendo…');
      } else { setOpenGroup(true); ui.toast('Audio guardado'); }
      window.setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 150);
    } catch (e) { ui.toast(describeSaveError(e), 'err'); }
  };
  useEffect(() => { if (startSignal > 0) void start(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [startSignal]);
  // Si se sale de la ficha grabando, lo grabado se guarda en vez de perderse.
  useEffect(() => () => { if (rec.current) void stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dictate = () => {
    if (dictating) { dictating.stop(); return; }
    setDictating(startDictation(lang === 'it' ? 'it-IT' : lang === 'en' ? 'en-GB' : lang === 'fr' ? 'fr-FR' : 'es-ES', (chunk) => setD({ text: (d.text ? d.text + ' ' : '') + chunk }), (err) => { setDictating(null); if (err) ui.toast(err, 'err'); }));
  };

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const total = items.length + loose.length;

  return (
    <section className="card" id="sec-notes">
      <h2>Notas y audios <span className="sub">{total}</span></h2>

      <textarea value={d.text} onChange={(e) => setD({ text: e.target.value })} placeholder="Escribe o dicta una nota…" aria-label="Nueva nota" style={{ minHeight: 64 }} />
      <div className="row" style={{ margin: '6px 0' }}>
        <button className="btn primary grow" disabled={!d.text.trim()} onClick={() => void addNote()}>Añadir nota</button>
        {set.dictationEnabled && speechSupported() && <button className="btn" onClick={dictate}>{dictating ? '■ Parar' : '🎤'}</button>}
      </div>
      {d.text.trim() && <div className="small">Borrador guardado automáticamente.</div>}

      <div className="recbar">
        {!recordingSupported() ? <div className="banner warn" style={{ margin: 0 }}>Este navegador no permite grabar audio.</div> : recording ? (
          <div className="row"><span className="rec-dot" /><b>Grabando {mmss(secs)}</b><span className="grow" /><button className="btn danger" onClick={() => void stop()}>■ Parar y guardar</button></div>
        ) : (
          <div className="row">
            <button className="btn primary" onClick={() => void start()}>🎙 Grabar</button>
            <span className="small">Idioma:</span>
            <LangChips value={lang} onChange={(l) => { setLang(l); saveSettings({ transcriptionLang: l }); }} label="Idioma de la grabación" />
          </div>
        )}
        {!set.whisperInstalled && !recording && <div className="small">La transcripción automática es opcional (Ajustes). Sin ella, el audio se guarda y puedes escribir la nota.</div>}
      </div>

      <div ref={listRef}>
        {total === 0 && <div className="small" style={{ marginTop: 8 }}>Aún no hay notas ni audios.</div>}
        {items.map((it) => (it.node === 'job' ? <JobCard key={'j' + it.media!.id} media={it.media!} /> : <NoteCard key={it.note!.id} note={it.note!} media={it.media} />))}
      </div>

      {loose.length > 0 && (
        <details className="loose" open={openGroup} onToggle={(e) => setOpenGroup((e.target as HTMLDetailsElement).open)}>
          <summary>Audios sin transcribir ({loose.length})</summary>
          {loose.map((m) => <UntranscribedRow key={m.id} media={m} />)}
        </details>
      )}
    </section>
  );
}
