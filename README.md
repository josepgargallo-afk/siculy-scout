# Siculy Scout

PWA instalable en Android para registrar proveedores y potenciales clientes en ferias (primer uso: **SIAL París 2026**).
Todo funciona **en el propio móvil**: sin servidores, sin cuentas, sin APIs de pago. Los datos quedan en tu control.

## Stack (y por qué)

| Necesidad | Solución | Coste |
|---|---|---|
| App | React + TypeScript + Vite, PWA (`vite-plugin-pwa`/Workbox) | 0 |
| Datos | IndexedDB vía Dexie (empresas, contactos, visitas, notas, fotos, audios) | 0 |
| OCR de tarjetas | Tesseract.js **autoalojado** (worker + WASM + idiomas es/it/en/fr servidos desde la propia app) | 0 |
| QR | `jsQR` (JS puro, sin red, sin workers) + cámara/imagen | 0 |
| Copias | ZIP con `fflate` (JSON + fotos + audios + CSV + huellas SHA‑256) | 0 |
| Hosting | GitHub Pages / Cloudflare Pages / Netlify (estático + HTTPS) | 0 |

`jsQR` en lugar de ZXing: es más pequeño y sencillo, funciona sin web‑workers ni WASM y se prueba en automático.
No lee códigos de barras 1D (no se pedía).

## Ejecutar en el ordenador

```bash
npm install
npm run dev        # http://localhost:5173 (también accesible desde la red local)
npm test           # 56 pruebas automáticas
npm run build      # genera dist/ (incluye los recursos OCR ≈ 20 MB)
npm run test:ocr   # OCR REAL sobre tarjetas sintéticas (lento): precisión por campo y tiempos
npm run ocr:photo -- "ruta\mi-tarjeta.jpg"   # prueba local con TU foto; sólo imprime en la terminal
npm run preview    # sirve dist/ en http://localhost:4173
```

Requiere Node 20+. `npm run dev`/`build` copian automáticamente los recursos OCR a `public/ocr/` (no se versionan).

> La cámara, el micrófono y el Service Worker exigen **HTTPS** (o `localhost`). Para probar en el móvil usa el despliegue (abajo).

## Desplegar gratis

**Opción A – GitHub Pages (workflow incluido en `.github/workflows/deploy.yml`)**
1. Crea un repositorio (puede ser privado en planes que lo permitan, o público: **no contiene datos personales**, los datos viven sólo en cada navegador).
2. `git init && git add . && git commit -m "Siculy Scout" && git remote add origin <url> && git push -u origin main`.
3. En GitHub: *Settings → Pages → Source: GitHub Actions*. Cada push a `main` ejecuta pruebas, compila y publica.
4. La app queda en `https://<usuario>.github.io/<repo>/`.

**Opción B – Cloudflare Pages / Netlify**: conecta el repo con *Build command* `npm run build` y *Output* `dist`, o arrastra la carpeta `dist/` (Netlify Drop). La app usa rutas relativas y hash‑routing: funciona en cualquier subruta.

⚠️ No subas nunca copias ZIP ni CSV a un repositorio público (`.gitignore` ya los excluye).

## Instalar en el Samsung (Android)

1. Con **Wi‑Fi**, abre la URL de la app en **Chrome**.
2. Menú ⋮ → **Instalar aplicación** (o «Añadir a pantalla de inicio»). Aparece el icono «Scout».
3. Ábrela **una vez con conexión** y espera el aviso «Lista para funcionar sin conexión».
4. En **Ajustes → OCR sin conexión → Descargar ahora** (≈ 25 MB, una sola vez) para poder escanear tarjetas sin red.
5. Haz una copia de prueba y comprueba que el ZIP llega a tu ordenador/Drive **antes** de la feria.
6. Concede permisos de cámara y micrófono la primera vez (o en Ajustes de Android → Apps → Chrome → Permisos).

## Copias de seguridad y restauración

- **Copia**: pestaña **Copias → Crear y descargar ZIP**. La app crea el ZIP, lo **verifica entero** (cada archivo contra su huella SHA‑256) y sólo entonces lo da por bueno y registra la fecha. Pulsa *Compartir / enviar* para mandarlo a Drive/correo. Guárdalo **fuera del móvil**.
- **Qué contiene**: `manifest.json` (versión, recuentos, huellas), `data.json` (empresas, contactos, visitas, notas, metadatos), `files/media/` (fotos y audios), `files/thumbs/`, `csv/empresas.csv` y `csv/contactos.csv` (Excel, separador `;`, UTF‑8), `LEEME.txt`.
- **Aviso**: el Directorio muestra un banner si hay cambios sin copiar (y nunca se ha copiado o hace > 12 h).
- **Restaurar**: **Copias → Restaurar desde ZIP**.
  - El archivo se verifica **antes** de tocar nada (ZIP válido, versión, huellas, referencias, archivos presentes). Si falta o está corrupto algún archivo se rechaza y se listan los problemas.
  - **Fusionar** (por defecto): añade lo que falta, identifica por ID (no duplica), no pisa datos existentes (opcional: actualizar los más antiguos).
  - **Reemplazar todo**: para móvil/ordenador nuevo. Es atómico (una transacción): si falla a mitad, los datos actuales quedan intactos.
- **En el ordenador**: abre `csv/empresas.csv` y `csv/contactos.csv` con Excel. Para ver fotos/audios descomprime el ZIP (`files/media/<id>.jpg|webm`), o abre la app en Chrome de escritorio y restaura el ZIP (el mismo despliegue funciona en PC).

## Qué se ha implementado

- **P0**: crear/editar/eliminar empresas (sólo el nombre es obligatorio), contactos múltiples, fotos (cámara/galería, miniaturas, visor, categoría y descripción), notas, grabación y reproducción de audio, directorio con búsqueda y filtros (tipo, país, evento, prioridad), origen/visitas múltiples (por defecto SIAL París 2026, editable), autoguardado + borradores, almacenamiento offline, copias ZIP/CSV con verificación.
- **P1** (desactivables en Ajustes sin afectar a P0): escáner QR (cámara trasera o imagen; vCard, MECARD, URL, email, teléfono), OCR de tarjetas con reglas conservadoras y texto OCR editable, detección de duplicados (empresas y contactos), dictado opcional.

## Decisiones y límites reales (leer)

- **Dictado**: la solución recomendada y 100 % gratuita/local es el **micrófono del teclado del móvil** (Gboard) en cualquier campo de texto. El botón «Dictar» del navegador (Web Speech) **envía el audio a Google** y necesita Internet, por eso viene **desactivado**; se activa en Ajustes con aviso. **La transcripción automática de audios (Whisper local) existe pero es **experimental y está desactivada** hasta validarla en el móvil: ver [docs/TRANSCRIPCION.md](docs/TRANSCRIPCION.md). Mientras tanto se conserva el audio y se puede escribir/dictar la nota.**
- **OCR de tarjetas** (pipeline v2): la imagen se decodifica respetando EXIF, se evalúa la orientación con lecturas rápidas (1 si la foto ya está derecha; hasta 4 si está girada), se mejora el contraste y se lee con Tesseract a `psm 11` (texto disperso, adecuado para logotipos y bloques). Un parser **independiente** del OCR asigna campos con puntuaciones: empresa (forma jurídica estricta o coincidencia con el dominio del email/web), persona (apoyada en el email y en la cercanía al cargo), cargo multilingüe, todos los emails (corporativo/personal), móvil vs fijo vs fax (por etiqueta o por formato del número), web, varias direcciones, CIF/IVA como dato extra. Cada campo lleva confianza: lo dudoso se marca «⚠ revisar» y los valores alternativos aparecen como botones; lo ilegible **no se rellena** ni se usa como nombre de empresa. Siempre se ve el texto OCR original y se puede girar (⟲ ⟳), recortar, repetir o rellenar a mano; la foto se guarda enderezada. **Límites**: sin corrección de perspectiva (tarjeta muy inclinada), poca fiabilidad con tipografías muy decorativas, reflejos o texto pequeño; en el móvil real el tiempo es **desconocido** (en escritorio: ~2 s con la foto derecha y ~3-4 s si está girada; en el navegador de pruebas 7-15 s). Probar siempre con tarjetas reales (ver docs/PRUEBAS_MANUALES.md).
- **QR de enlace**: sólo se guarda la URL; no se abre sola ni se lee su contenido. «Abrir» pide confirmación y se abre externamente.
- **Fotos** se redimensionan (lado largo 2000 px, tarjetas 2400 px, JPEG 85–90 %), lo que además elimina metadatos EXIF/GPS. Se conserva la foto recodificada, no el archivo original bit a bit. HEIC no soportado por el navegador se rechaza con aviso.
- **Almacenamiento**: IndexedDB del navegador; la cuota depende del móvil (suele ser de varios GB). La app pide almacenamiento persistente y muestra el uso. **Borrar datos de Chrome, desinstalar la PWA o resetear el móvil elimina los datos**: haz copias.
- **Copias muy grandes** (cientos de MB de audio/foto) se procesan en memoria: si el móvil se queda sin RAM, haz la copia en varias tandas o exporta desde el ordenador.
- **Grabación de audio**: si la pantalla se apaga o se cambia de app, Android puede cortar el micrófono; la app guarda lo grabado hasta ese momento al salir de la ficha. Mantén la pantalla encendida mientras grabas.
- **Compartición de datos**: ninguna petición a servicios externos con datos de contactos. Las únicas redes: descarga de la propia app y, si el usuario lo activa, el dictado del navegador.
- **iPhone/Safari** no es objetivo (APIs de cámara/audio y almacenamiento distintas).
- Actualizaciones: al publicar una versión nueva aparece un aviso «Actualizar ahora»; nunca se recarga sola en mitad de una captura.

## Estructura

```
src/lib/      lógica pura y datos (db, repo, backup, ocrParse, qrParse, duplicates, csv…)
src/ui/       pantallas React
src/__tests__ pruebas (Vitest + fake-indexeddb)
scripts/      copy-ocr.mjs (recursos OCR), make-icons.mjs, ocr-photo.mjs (foto local)
src/__tests__/ocr/  banco de OCR real (tarjetas sintéticas ficticias, no entra en `npm test`)
docs/         PRUEBAS_MANUALES.md
```

Modelo de datos listo para un CRM: `companies`, `contacts`, `touchpoints` (primer registro = origen; añade visitas futuras sin duplicar la empresa), `media`, `notes`; ids UUID permanentes y `schemaVersion` en cada copia.

## Novedades v0.2.0
- **Empresa completa desde la tarjeta/QR/.vcf**: nombre comercial y legal, país, ciudad, dirección legal y operativa, web, email y teléfono corporativos; revisión editable antes de guardar; con empresa existente sólo se rellenan huecos y los conflictos se eligen a mano. No se deducen productos ni categorías.
- **Importación .vcf / vCard** (varios contactos por archivo), `Compartir → Siculy Scout` en Android y QR de tarjetas digitales. **Limitación real**: la app no puede leer páginas ajenas (CORS, privacidad) ni hace scraping; si la plataforma ofrece «Guardar contacto / .vcf», se descarga y se importa; si no, queda el escáner de la foto o la entrada manual.
- **Modelo de datos v2** con migración Dexie automática y compatible con copias v1 (todos los campos nuevos son opcionales). Los ids no cambian.
- **Transcripción local de audio (experimental, desactivada)** con cola, estados, reintento sin duplicar y copias ZIP compatibles.

## Novedades v0.3.0
- **Sección única «Notas y audios»** (más reciente primero): la transcripción es el contenido principal; el audio queda plegado («Escuchar audio»); notas largas con «Ver más»; **comentario escrito** aparte de la transcripción literal; editar con «↺ Texto original»; borrar nota+audio o sólo la nota; audios sin transcribir en un grupo plegado.
- **Transcripción más fiable** (causas y mediciones en [docs/TRANSCRIPCION.md](docs/TRANSCRIPCION.md)): audio completo (antes se truncaba a 30 s), detección de voz (adiós a las frases inventadas sobre silencio), idioma por grabación o **Auto** (es/it/en/fr), **vocabulario propio**, avisos de revisión, y **Small** opcional (241 MB). Sigue experimental hasta validarla en el móvil.
- Esquema de datos v3 (comentarios y avisos) compatible con copias v1/v2.

## Novedades v0.4.0
- **Ficha compacta con secciones plegables**: nombre, tipo, prioridad y botones rápidos (Tarjeta, QR, Foto, Audio) siempre visibles; debajo, Datos de la empresa, Contactos, Fotografías, Notas y audios, Origen y visitas, **todas plegadas al entrar** y con un resumen calculado de los datos reales. Se pueden abrir varias a la vez. El contenido plegado sigue montado (no se pierde un formulario sin guardar ni se interrumpe una grabación o transcripción).
- Al crear algo (foto, contacto, tarjeta/QR, audio) se abre su sección y se desplaza/resalta el elemento nuevo.
- **Logo de empresa** (opcional): desde una foto guardada (recorte manual) o buscándolo en la web de la empresa (apple-touch-icon, og:image, logo de cabecera, favicon). Se muestra en la ficha y en el directorio; sin logo, iniciales. Se guarda como un archivo más (`category: 'logo'`), así viaja en las copias ZIP; no cambia el esquema de la base de datos. La búsqueda web sólo ofrece lo que el navegador deja leer (CORS); si falla, la app sigue igual.

## Novedades v0.5.0 (diseño)
- Rediseño visual completo con un sistema de diseño propio (tokens CSS): azul noche, crema, pistacho y terracota; colores semánticos separados; tipografía Inter integrada (funciona sin conexión); iconos vectoriales Lucide en lugar de emojis. Detalles y justificación en [docs/DISENO.md](docs/DISENO.md); capturas antes/después en `docs/capturas/`.
- Directorio con logos o iniciales de color, tipo, prioridad y país en una fila limpia; búsqueda y filtros compactos; botón «Nueva empresa» destacado; estado vacío.
- Ficha: nombre grande con logo y clasificación (la barra superior sólo muestra el nombre al desplazarse); acciones rápidas con iconos; cinco acordeones; «Eliminar empresa» pasa al menú ⋮ con la misma confirmación.
- Notas y audios: grabación arriba, transcripción como texto principal, comentario propio en un bloque terracota, estados (en cola, transcribiendo, transcrito, revisar, error) con etiquetas de color e icono.
- Corrección: al pasar directamente de una empresa a otra, la ficha podía mostrar (y dejar editar) los datos de la anterior; ahora cada ficha se monta de cero.

## Novedades v0.6.0 (buscar empresa)
- **Buscar empresa** al crear una ficha y **Completar datos online…** en el menú ⋮ de una ficha: busca por nombre en fuentes públicas y gratuitas (Sirene FR, Brønnøysund NO, ARES CZ, GLEIF, Wikidata, OpenStreetMap), muestra coincidencias con país/ciudad/fuente, vista previa editable y rellena solo lo confirmado, conservando la procedencia de cada dato. Sin claves, sin proxies, sin scraping. Cobertura y límites reales (Italia/España solo vía GLEIF, Wikidata y OSM) en [docs/ENRIQUECIMIENTO.md](docs/ENRIQUECIMIENTO.md).
- Campos nuevos en la ficha: Sector y Descripción de la actividad, y «Procedencia de los datos». Copias ZIP en esquema 4 (se siguen restaurando las v1–v3).
