# Identidad OCCASORIO (v0.7.0)

Siculy Scout pasa a mostrarse como **OCCASORIO** («Discover. Capture. Grow.»). Es un cambio **sólo visual y de textos**: datos, esquema, copias y comportamiento no cambian.

Origen: `OCCASORIO_Brand_Kit_v1.zip`. Copias íntegras del kit en `public/brand/` (SVG) y `docs/marca/` (guía, tokens y vista previa originales). Ningún SVG del kit se ha editado.

> El propio kit avisa de que es una **propuesta gráfica** y de que la investigación de marca terminó en **CONDITIONAL GO** (posibles conflictos con OCCASIO y OCCASORIA). Esta rama implementa la identidad en local; **no se ha publicado**.

## Recursos y uso

| Recurso del kit | Dónde se usa | Notas |
|---|---|---|
| `simbolo_color.svg` (trazados) | `src/ui/Brand.tsx` → `BrandSymbol`: cabecera del directorio, bienvenida, pie de Ajustes | En línea (sin red), mismos trazados y degradados; los ids de degradado son únicos por instancia |
| `logo_horizontal_claro.svg` | `BrandLogo`: símbolo + «occasorio» | El kit escribe la palabra como **texto** SVG (Inter Display/Inter 700, interletraje −2,4 sobre 73 px). En un `<img>` esa fuente no cargaría y saldría Arial; por eso se compone con la Inter integrada de la app, con el mismo peso, interletraje (−0,033 em) y proporción símbolo/texto (≈ 1,6) |
| `app_icon.svg` | `icons/icon-192.png`, `icons/icon-512.png` (`scripts/make-icons.mjs`) | Renderizado con sharp desde el SVG |
| `app_icon.svg` a sangre | `icons/maskable-512.png`, `icons/apple-touch-icon.png` | Mismo dibujo con `rx="0"`: Android e iOS aplican su propia máscara. Comprobado: 0 píxeles fuera de la zona segura (círculo del 80 %) |
| `favicon.svg` | `favicon.svg`, `icons/favicon-32.png`, `icons/favicon-64.png` | — |
| Resto (`logo_horizontal_oscuro`, `con_claim`, monocromos, `app_icon_claro`) | `public/brand/` | Disponibles y precacheados para usos futuros |

Los PNG del kit (`app_icon_192/512/1024`, `favicon_64`) tienen buena calidad y resolución, pero se regeneran desde el SVG para tener exactamente los tamaños del manifest y la variante maskable.

## Paleta: kit frente a la app

| Token del kit | Valor del kit | En la app | Diferencia o derivado y por qué |
|---|---|---|---|
| Noche | `#0E1B34` | `--night`, texto (`--txt`) y acciones principales | Igual. Blanco sobre noche 17,1:1 |
| Índigo | `#4B67C5` | `--indigo` (anillo de foco, borde de campo activo) y `--indigo-ink` `#3E58B0` | El *ink* es para enlaces y texto pequeño: 6,5:1 sobre blanco (el índigo base da 5,2:1) |
| Turquesa | `#2CBDB9` | `--teal` (icono del aviso, realce de lo nuevo); `--teal-soft` `#E0F5F4` (pestaña activa, chip «Proveedor»); `--teal-ink` `#0F7472` (texto del chip) | Turquesa sobre blanco da 2,3:1: **nunca se usa para texto**. El *ink* da 4,9:1 sobre su fondo suave |
| Salvia | `#728A84` | `--sage`; `--sage-ink` `#5A6E69` (color de iniciales) | Blanco sobre `#5A6E69`: 5,4:1 |
| Coral | `#FF816C` | `--coral`: «Grabar audio», «Hacer copia ahora», «Descargar OCR» | Texto **noche** sobre coral (7,0:1); blanco sobre coral daría 2,4:1. `--coral-soft` `#FFECE8` y `--coral-ink` `#B8432F` para «Tu comentario» y el chip «Ambos» (4,7:1) |
| Marfil | `#F8FAF9` | `--ivory` (fondo), `theme_color` | Igual |
| Gris texto | `#566577` | `--txt-2` | Igual (5,7:1 sobre marfil) |
| — | — | `--mut` `#647283` | Texto terciario: 4,7:1 sobre marfil, 4,9:1 sobre blanco |
| Degradado | `#4B67C5 → #2CBDB9 → #1C8EAD` | Sólo dentro del símbolo | `#1C8EAD` aparece en el degradado del kit pero no en la tabla de colores; se respeta tal cual. No se añaden degradados a la interfaz |

Los colores semánticos (`--ok`, `--warn`, `--err`, `--danger`) siguen separados de la marca. `--info` se acerca al índigo (`#3E58B0` sobre `#EAEEFA`, 5,6:1).

Tipografía: Inter, ya integrada y precacheada (sin Internet). El kit sugiere «Inter Display», que no se distribuye: se usa Inter en peso 700.

## Textos

- **Nombre:** OCCASORIO. Logotipo en minúsculas (`occasorio`), como el kit.
- **Firma:** «Discover. Capture. Grow.» Se deja en inglés, como en el kit. Es un mensaje aspiracional: la guía pide **no** presentarlo como capacidad.
- **Mensaje:** «Las oportunidades están en todas partes.» (bienvenida del directorio vacío).
- **Descripción:** «Captura empresas, contactos e ideas comerciales dondequiera que aparezcan. Conserva fotografías, notas y contexto para volver a ellas cuando lo necesites.» (bienvenida, manifest y `<meta description>`).
- **Idiomas:** la app no tiene sistema de traducciones; toda la interfaz está en español y así sigue. No se anuncian funciones inexistentes (detección automática, IA predictiva, CRM, automatizaciones).
- La mención «antes Siculy Scout» se mantiene en Ajustes, en el README de las copias y en los errores de restauración, para reconocer copias antiguas.

## Identidad técnica conservada (no cambiar)

| Elemento | Valor | Motivo |
|---|---|---|
| Nombre de IndexedDB | `siculy-scout` (versión Dexie 2) | Cambiarlo dejaría la app vacía: los datos están en esa base |
| Formato de copia | `siculy-scout-backup`, esquema 4 | Compatibilidad con las copias ya hechas en el móvil |
| Manifest | `start_url: './'`, `scope: './'`, **sin `id`** | Chrome identifica la PWA instalada por su `id`, que si falta es el `start_url`. Añadir un `id` o cambiar `start_url` crearía otra app instalada |
| Cachés | `scout-ocr`, `scout-ort`, `scout-share`, precache de Workbox | Recursos OCR y Whisper ya descargados en el móvil |
| `localStorage` / `sessionStorage` | `scout:settings`, `scout:draft:*`, `scout.acc.*` | Ajustes y borradores |
| Eventos internos | `scout:update-ready`, `scout:offline-ready` | Sin efecto visible |
| `package.json` `name` | `siculy-scout` | Identificador técnico |

`src/__tests__/branding.test.ts` comprueba todo lo anterior, junto con los iconos, sus tamaños y la zona segura maskable. El service worker no cambia de lógica: sólo precachea los nuevos SVG y PNG (ya cubiertos por `globPatterns`).

Lo que **sí cambia** y verá el usuario: el nombre y el icono instalados. Chrome en Android actualiza el nombre y el icono de la app instalada cuando detecta el nuevo manifest; según la versión, puede pedir confirmación. La URL, los datos y la instalación son los mismos.

Las copias se descargan ahora como `occasorio-AAAA-MM-DD_HHMM.zip` y los CSV como `occasorio-empresas.csv` y `occasorio-contactos.csv`. Las copias `siculy-scout-*.zip` se siguen restaurando igual: lo que se valida es el contenido, no el nombre del archivo.

## Capturas

En `docs/capturas/occasorio-*.jpg`, con viewport de 412 × 915 (S25 Ultra), datos **ficticios** y la build de producción servida en local. La de escritorio (`occasorio-11-escritorio-1024.jpg`, viewport de 1024 px) tiene poca resolución por el tamaño del panel de pruebas.
