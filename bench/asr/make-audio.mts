// Genera el audio de referencia con voz sintética local y gratuita.  Uso:  node bench/asr/make-audio.mts
// Voces: eSpeak (paquete mespeak) para español e italiano; Windows SAPI «Helena» para español si está instalada.
// OJO: son voces sintéticas (robóticas): sirven para comparar configuraciones entre sí, NO sustituyen a voz humana real.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ES, IT } from './corpus.ts';

const require = createRequire(import.meta.url);
const meSpeak = require('mespeak');
meSpeak.loadConfig(require('mespeak/src/mespeak_config.json'));
meSpeak.loadVoice(require('mespeak/voices/es.json'));
meSpeak.loadVoice(require('mespeak/voices/it.json'));

const out = path.resolve('bench/asr/audio');
for (const v of ['espeak-es', 'espeak-it', 'sapi-es']) mkdirSync(path.join(out, v), { recursive: true });

for (const s of [...ES, ...IT]) {
  const buf: ArrayBuffer = meSpeak.speak(s.spoken, { rawdata: 'buffer', voice: s.lang, speed: 150, pitch: 50, amplitude: 100 });
  writeFileSync(path.join(out, `espeak-${s.lang}`, `${s.id}.wav`), Buffer.from(buf));
}

// SAPI (sólo Windows)
try {
  const ps = ES.map((s, i) => `Say '${s.spoken.replace(/'/g, "''")}' '${path.join(out, 'sapi-es', s.id + '.wav').replace(/\\/g, '\\\\')}'`).join('\n');
  const script = `Add-Type -AssemblyName System.Speech
function Say($text, $file) { $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SelectVoice('Microsoft Helena Desktop');
  $f = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono);
  $s.SetOutputToWaveFile($file, $f); $s.Speak($text); $s.Dispose() }
${ps}`;
  const f = path.join(out, 'sapi.ps1');
  writeFileSync(f, '﻿' + script, 'utf8');
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', f], { stdio: 'inherit' });
} catch { console.warn('SAPI no disponible: se omite la voz Helena.'); }

console.log('Audio generado en', out, existsSync(path.join(out, 'sapi-es', 'es1.wav')) ? '(con SAPI)' : '(sin SAPI)');
