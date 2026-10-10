# Transcripción local de audio (experimental)

Estado: **integrada pero DESACTIVADA por defecto**. No está validada en Android. El sistema anterior (grabar, guardar el audio, escribir o dictar con el teclado) sigue intacto y es la alternativa.

## Tecnología
Whisper multilingüe cuantizado (q8) ejecutado con **Transformers.js + ONNX Runtime WASM** dentro de un Web Worker.
- Coste: 0 € (modelo abierto, sin API, sin clave, sin cuota).
- Privacidad: el audio **no sale del móvil**. La única petición externa es la descarga única de los *pesos del modelo* desde Hugging Face (acción explícita en Ajustes). El runtime WASM se sirve desde la propia app (`/ort/`).
- GitHub Pages no permite cabeceras COOP/COEP → **sin hilos WASM** (un solo hilo). WebGPU no se usa (no fiable en Android/PWA).

## Medición (escritorio, Chrome, 1 hilo WASM; **NO es un móvil**)
Audio de prueba: voz sintética (Windows SAPI: español e inglés), 8-9 s. No había voz italiana disponible.

| | tiny q8 | base q8 |
|---|---|---|
| Tamaño de descarga | 41,6 MB (encoder 9,7 + decoder 29,3 + tokenizer 2,4) | 76 MB (encoder 22,1 + decoder 51,2 + tokenizer 2,4) |
| Carga/descarga (red de escritorio) | 10,7 s | 6,2 s |
| Memoria (heap JS; el WASM no se ve aquí) | — | 114 → 249 MB tras cargar, 197 MB tras transcribir |
| Tiempo (factor de tiempo real) | 0,7–1,3× (≈ 7–11 s por 9 s de audio) | **0,5×** (≈ 4,2 s por 9 s de audio) |
| Español (voz sintética limpia) | frase 1 perfecta, frase 2 con 3 acentos perdidos | frases perfectas (acentos correctos) |
| Inglés | perfecto | — |
| Audio de `MediaRecorder` (webm/opus) | idéntico resultado al WAV (+1 s) | — |
| Integración en la app (build de producción, tiny) | descarga desde Ajustes 6,6 s; audio de 9 s → nota en 16 s (incluye carga del motor) | — |

### Hallazgos importantes
1. **Nunca usar idioma automático**: con `tiny` y audio en español el modo automático *tradujo al inglés y entró en bucle* repitiendo una frase (38 s, factor 4×). La app **siempre** indica el idioma (Ajustes + selector por audio), limita los tokens de salida según la duración y recorta repeticiones.
2. **Silencio/ruido**: Whisper inventa frases. La app no transcribe audios sin voz detectable (error claro «No se detectó voz»).
3. Un móvil será **más lento** que este escritorio (estimación: 2–4×; no medida). `base` podría tardar ~1–2× el tiempo real: un audio de 30 s, de 30 s a 1 min. Por eso la cola trabaja en segundo plano y la app sigue usable.

### NO medido (requiere el Samsung)
- Tiempo y memoria reales en el S25 Ultra y si Chrome/PWA mata la pestaña al transcribir.
- Precisión con voz humana real (ruido de feria, acentos), en español **e italiano** (sólo se dispone de las cifras publicadas de Whisper; `base` es claramente peor en italiano/francés que en español e inglés).
- Funcionamiento sin conexión tras descargar: los pesos quedan en la caché del navegador (`transformers-cache`) y el runtime en `scout-ort`; **hay que probarlo en modo avión**.

## Comportamiento implementado
Grabar → Detener → se guarda el audio → (si está activado) cola → transcribe → **una nota** «🎙 Transcripción de audio» en la ficha.
- Estados: pendiente / procesando / completado / error, visibles en cada audio. Cola persistente (sobrevive a cerrar la app: lo «procesando» vuelve a «pendiente»).
- Reintento sin duplicar: reutiliza la misma nota. Si el usuario la editó, **no se pisa**; el texto literal del motor queda en el audio.
- Transcripción **literal**, no resumen. No se añade, corrige ni inventa contenido.
- El audio se conserva siempre. La transcripción, el vínculo audio↔nota y los estados van en las copias ZIP (esquema v2; restaurar convierte «procesando» en «pendiente»).
- Se puede quitar el modelo desde Ajustes para liberar espacio.

## Cómo repetir la medición
`experiments/whisper-bench.ts` (no forma parte de la app): `npm run dev`, abrir la consola del navegador y `await import('/experiments/whisper-bench.ts')`. Los audios de prueba (`experiments/audio/`) no se versionan.
