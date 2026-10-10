// Genera el audio de referencia (voz sintética local, gratuita). Uso: node bench/asr/make-audio.mjs
// Voces: eSpeak (mespeak) para español e italiano; Windows SAPI «Helena» para español (si existe).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const { ES, IT } = await import(pathToFileURL(new URL('./corpus.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href).catch(() => ({}));
