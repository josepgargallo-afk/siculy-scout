// Ejecuta el OCR sobre UNA foto local e imprime el resultado en la terminal (sin guardar nada).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const file = process.argv[2];
if (!file) { console.error('Uso: npm run ocr:photo -- "ruta/a/la-foto.jpg"'); process.exit(1); }
const r = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.ocr.config.ts', 'local-photo', '--reporter=dot'], {
  stdio: 'inherit', shell: true, env: { ...process.env, OCR_PHOTO: path.resolve(file) },
});
process.exit(r.status ?? 1);
