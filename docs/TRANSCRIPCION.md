# Transcripción local de audio (Whisper) — auditoría, medición y configuración

Estado v0.3.0: integrada, **sigue siendo experimental** hasta validarla con voz real en el Samsung. El audio original se conserva siempre y las notas escritas / dictado con teclado siguen funcionando igual.

## 1. Causas identificadas de los errores (v0.2.0)
Verificadas leyendo el código instalado de Transformers.js 4.3 y midiendo (ver §3):

| # | Causa | Evidencia | Corrección |
|---|---|---|---|
| 1 | **Se transcribía una sola ventana de 30 s**: `chunk_length_s` se ignora en Whisper y el audio posterior se descartaba en silencio (textos «incompletos»). | `_call_whisper` procesa una ventana; el extractor de características trunca a 30 s. | El audio se divide por pausas en segmentos de voz ≤ 28 s y se transcriben todos (grabaciones de 44–53 s completas). |
| 2 | **Silencio y ruido llegaban al modelo**, que inventa texto fluido («cabras que trepan montañas»…). No hay umbral de «no hay voz». | Controles sin voz (silencio, ruido, zumbido, tecleo): **8/8 con texto inventado** en v0.2.0 → **0/8** con detección de voz. | Detección de voz por energía adaptativa: lo que no es voz no se envía. Audio sin voz → error claro, sin nota. |
| 3 | **Idioma equivocado**: con italiano decodificado como español el error de palabras pasa de **56 % a 98 %** (frases italianas «deformadas»). La configuración era un único idioma global (por defecto español). | Prueba `x_wronglang_it_as_es`. | Selector de idioma junto al botón Grabar (ES/IT/EN/FR) y modo **Auto** restringido a esos 4 idiomas: **59/60 (98 %)** de acierto. Aviso si el texto parece de otro idioma. |
| 4 | **Nombres de producto** (cannoli, pistacchio di Bronte, arancini…) desconocidos para el modelo. | Términos del glosario: 36–39 % de acierto. | **Vocabulario propio** (prompt): **74 %** con Base, **93 %** con Small, sin degradar el resto (§3). |
| 5 | Tope de tokens bajo (6/s) que podía cortar frases largas; sin normalización de nivel. | Código. | 12 tokens/s por segmento; normalización (+24 dB máx.). |
| 6 | **No se encontraron** problemas en: decodificación de WebM/Opus y remuestreo a 16 kHz (resultado idéntico a WAV), `task` (siempre «transcribe», nunca «translate»), canales (mono). | §3 y prueba en navegador. | — |

Descartado por no aportar nada medible: **búsqueda por haces** (`num_beams` 3/5 produjo transcripciones idénticas en las 80 pruebas), y solo normalizar el volumen sin segmentar (empeoró: sigue truncando a 30 s).

## 2. Configuración elegida
- **Por defecto: Base q8 (76 MB) + segmentación por voz + normalización + vocabulario propio + idioma Auto.** Estable y con los mejores tiempos.
- **Opcional (Ajustes): Small q8 (241 MB)** — el modelo más preciso; solo con Wi-Fi, confirmación antes de descargar, ≈ 1,3 GB de RAM y más lento. **Base se conserva como alternativa** (y Tiny, 42 MB, solo por velocidad).
- No hay corrección automática del texto: la transcripción es literal. Los avisos nunca modifican el contenido.

## 3. Comparativa reproducible (Node, mismos pesos q8; `npm run asr:bench`)
Corpus: 20 frases comerciales (10 es + 10 it) con productos sicilianos, importes, pesos, cantidades y nombres; 3 voces sintéticas locales (SAPI «Helena», eSpeak es, eSpeak it); condiciones limpia y «móvil» (volumen bajo + ruido SNR 14 dB + silencios); 3 grabaciones largas (44–53 s) y 8 controles sin voz. 1222 palabras de referencia. Datos completos en [asr-comparativa.txt](asr-comparativa.txt).

| Modelo · configuración | WER total | WER es (SAPI) | WER it (eSpeak) | Números | Nombres glosario | Otros términos | Texto inventado (controles) |
|---|---|---|---|---|---|---|---|
| Base · **v0.2.0 (antes)** | 49,8 % | 22,6 % | 66,3 % | 65 % | 36 % | 23 % | **8/8** |
| Base · + detección de voz | 48,4 % | 22,6 % | 60,5 % | 68 % | 39 % | 21 % | 0/8 |
| Base · + normalización (sin segmentar) | 56,1 % | 27,7 % | 70,8 % | 62 % | 29 % | 22 % | 8/8 |
| Base · voz + normalización | 46,8 % | 23,1 % | 56,0 % | 70 % | 39 % | 29 % | 0/8 |
| Base · + haces (3) | 46,8 % | = | = | = | = | = | 0/8 |
| **Base · + vocabulario (elegido por defecto)** | **41,1 %** | **18,2 %** | **51,3 %** | 67 % | **74 %** | 28 % | 0/8 |
| Base · vocabulario único (italiano) para es+it | 40,3 % | 20,0 % | 51,3 % | 67 % | 73 % | 29 % | 0/8 |
| Base · italiano decodificado como español (error de usuario) | 60,6 % | 23,1 % | **98,0 %** | 67 % | 27 % | 22 % | 0/8 |
| Small · voz + normalización | 25,0 % | 13,6 % | 28,3 % | 88 % | 55 % | 54 % | 0/8 |
| **Small · + vocabulario** | **18,8 %** | **7,5 %** | **27,5 %** | **90 %** | **93 %** | 61 % | 0/8 |

Recursos medidos (Node nativo): Base ≈ 0,3 s de cálculo por s de audio, RSS máx. 720–760 MB; Small ≈ 0,65–1,0 s/s, RSS máx. 1,2–1,3 GB. Descargas: Tiny 41,6 MB, Base 76 MB (22,1 encoder + 51,2 decoder + tokenizer), Small ≈ 241 MB (88,0 + 149,5 + tokenizer).
En el navegador de escritorio (WASM, 1 hilo): Tiny 7–11 s por 9 s de audio (con la ventana oculta); Base ≈ 4 s por 9 s (v0.2.0). Idioma Auto: acierta 59/60.

### Cautelas (importante)
- **El audio es sintético** (voces robóticas). Sirve para comparar configuraciones entre sí —y las diferencias son grandes—, pero **no prueba la precisión con voz humana real**: los porcentajes absolutos no son los que verás. Italiano: solo eSpeak (peor que una voz natural).
- Con vocabulario propio el modelo puede «colar» un término que no se dijo (visto con Tiny: «…di Bronte» en una frase donde no estaba). La app avisa siempre que aparece un término del vocabulario: «comprueba en el audio que se dijeron de verdad».
- Los números siguen siendo el punto débil de Base (≈ 67–70 %: «12 euros con 50» por 12,50 etc.); **la app marca «Contiene cifras: comprueba cantidades, pesos y precios»** en toda transcripción con dígitos. Small sube a ≈ 90 %.

## 4. Pendiente de verificar en el Samsung (no extrapolable de esta medición)
Tiempo y memoria reales con Base y con Small (WASM de 1 hilo; esperable 2–4× más lento que en escritorio), si Chrome/PWA cierra la pestaña con Small, precisión con voz humana real en español e italiano, efecto de «Grabar sin filtros de llamada» (micrófono sin supresión de ruido/eco/ganancia; experimental) y funcionamiento en modo avión con el modelo ya descargado.

## 5. Garantías de datos
Audio original intacto siempre; la nota es una copia editable y el texto literal del motor se conserva (`media.transcript.text`, con «↺ Texto original»); reintentar no duplica notas ni pisa las editadas; los comentarios son un campo aparte; todo viaja en las copias ZIP (esquema v3; las copias v1/v2 se restauran).

## 6. Repetir las mediciones
```bash
npm run asr:audio                      # genera el audio sintético (bench/asr/audio, no versionado)
npm run asr:bench                      # todas las configuraciones (Base)
ASR_MODEL=small ASR_CONFIG=c4_normvad_gloss npm run asr:bench
```
Con **tus** grabaciones reales: crea `bench/asr/audio/mias/` con `x.wav` y su texto correcto; los datos personales no se versionan (`.gitignore`).
