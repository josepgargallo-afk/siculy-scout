import { defineConfig } from 'vitest/config';
// Verificación EN VIVO de las fuentes de enriquecimiento (necesita Internet). No forma parte de `npm test`.
export default defineConfig({ test: { environment: 'node', include: ['bench/enrich/**/*.live.ts'], testTimeout: 90_000 } });
