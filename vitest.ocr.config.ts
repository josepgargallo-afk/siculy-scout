import { defineConfig } from 'vitest/config';
// Pruebas de OCR real (lentas, necesitan public/ocr y fuentes del sistema). No forman parte de `npm test`.
export default defineConfig({
  test: { environment: 'node', include: ['src/__tests__/ocr/**/*.bench.ts'], testTimeout: 900_000, reporters: ['verbose'] },
});
