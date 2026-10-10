// Prueba LOCAL con una fotografía real (tuya). Sólo imprime en tu terminal: no copia la imagen, no escribe logs
// ni fixtures. Uso:  npm run ocr:photo -- "C:\ruta\mi-tarjeta.jpg"     (la carpeta local-photos/ está en .gitignore)
import { it } from 'vitest';
import fs from 'node:fs';
import { decodeToRaster, makeNodeWorker } from './engine';
import { scanCard } from '../../lib/cardOcr';
import { parseCard } from '../../lib/ocrParse';

const file = process.env.OCR_PHOTO;
const run = file ? it : it.skip;

run('foto local', async () => {
  const eng = await makeNodeWorker(process.env.OCR_LANGS ?? 'eng+spa+ita+fra');
  try {
    const raster = await decodeToRaster(fs.readFileSync(file!));
    const t0 = performance.now();
    const r = await scanCard(raster, eng.recognize);
    const f = parseCard(r.pass.lines);
    const show = (k: string, v: unknown) => console.log(`  ${k.padEnd(10)} ${v ?? '—'}`);
    console.log(`\nFoto ${raster.width}x${raster.height} · giro aplicado ${r.rotation}° · puntuaciones ${JSON.stringify(r.orientationScores)} · ${Math.round(performance.now() - t0)} ms · orientación fiable: ${r.orientationConfident}`);
    show('empresa', f.company); show('persona', f.fullName); show('cargo', f.role); show('email', f.email);
    show('emails', f.emails.map((e) => `${e.address} (${e.kind})`).join(', ')); show('móvil', f.mobile); show('teléfono', f.phone); show('web', f.web);
    show('direcciones', f.addresses.join(' | ')); show('revisar', f.uncertain.join(', '));
    show('alternativas', JSON.stringify(Object.fromEntries(Object.entries(f.info).filter(([, v]) => v?.alternatives.length).map(([k, v]) => [k, v!.alternatives]))));
    show('extras', f.extras.join(' | '));
    console.log('\n--- texto OCR ---\n' + r.pass.text);
  } finally { await eng.close(); }
}, 300_000);
