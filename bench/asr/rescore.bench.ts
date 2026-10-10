// Recalcula las métricas de TODOS los resultados guardados con el corpus actual (sin volver a ejecutar el modelo)
// y imprime una tabla comparativa. Uso: npx vitest run --config vitest.asr.config.ts rescore
import { it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ES, IT, GLOSSARY_ES, GLOSSARY_IT, type Sentence } from './corpus.ts';
import { pct, scoreClip, sum, type ClipScore } from './metrics.ts';

const DIR = path.resolve('bench/asr/results');
const byId = new Map<string, Sentence>([...ES, ...IT].map((s) => [s.id, s]));

it('tabla comparativa', () => {
  const lines: string[] = [];
  const files = fs.readdirSync(DIR).filter((f) => /^(tiny|base|small)-.*\.json$/.test(f)).sort();
  const header = 'modelo/config'.padEnd(34) + ['WER', 'WER SAPI', 'WER es-eS', 'WER it-eS', 'núm%', 'glos%', 'otros%', 'ins'].map((h) => h.padStart(10)).join('');
  lines.push(header);
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) as { key: string; id: string; hyp: string }[];
    const groups: Record<string, ClipScore[]> = { all: [], 'es-SAPI': [], 'es-eSpeak': [], 'it-eSpeak': [] };
    for (const r of d) {
      const [voice] = r.key.split('|');
      const lang = voice.startsWith('it') ? 'it' : 'es';
      const gl = lang === 'es' ? GLOSSARY_ES : GLOSSARY_IT;
      let sent: Sentence | undefined = byId.get(r.id);
      if (r.id === 'long') {
        const set = lang === 'es' ? ES : IT;
        sent = { id: 'long', lang, spoken: '', ref: set.slice(0, 6).map((s) => s.ref).join(' '), nums: set.slice(0, 6).flatMap((s) => s.nums), terms: set.slice(0, 6).flatMap((s) => s.terms) };
      }
      if (!sent) continue;
      const sc = scoreClip(sent, r.hyp, gl);
      groups.all.push(sc); groups[voice]?.push(sc);
    }
    const t = sum(groups.all);
    const w = (g: string) => String(pct(sum(groups[g]).err, sum(groups[g]).words));
    lines.push(f.replace('.json', '').padEnd(34) + [pct(t.err, t.words), w('es-SAPI'), w('es-eSpeak'), w('it-eSpeak'), pct(t.numsOk, t.numsTotal), pct(t.termsGlossOk, t.termsGlossTotal), pct(t.termsOk, t.termsTotal), t.ins].map((v) => String(v).padStart(10)).join(''));
  }
  const out = lines.join('\n');
  fs.writeFileSync(path.join(DIR, 'comparativa.txt'), out + '\n');
  console.log('\n' + out);
});
