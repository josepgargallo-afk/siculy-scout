import { defineConfig } from 'vitest/config';
// Banco de precisión de Whisper (lento, descarga el modelo la primera vez). No forma parte de `npm test`.
export default defineConfig({ test: { environment: 'node', include: ['bench/asr/**/*.bench.ts'], testTimeout: 3_600_000, hookTimeout: 600_000 } });
