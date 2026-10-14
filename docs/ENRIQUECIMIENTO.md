# Buscar empresa y rellenar la ficha (v0.6.0)

Botón **«Buscar empresa»** (en *Nueva empresa*) y **«Completar datos online…»** (menú ⋮ de una ficha). Coste cero, sin claves, sin proxies de terceros y sin scraping: la app solo lee las respuestas JSON de APIs públicas gratuitas que permiten acceso desde un navegador (CORS abierto). Nada se guarda hasta que el usuario confirma.

## Cómo funciona
1. El usuario escribe el nombre y pulsa **Buscar empresa**. Se consultan en paralelo las fuentes de la tabla (máx. 9 s cada una; una caída no afecta a las demás).
2. Se listan las coincidencias con **nombre, país, ciudad, nº de registro y fuente**, etiquetadas «Nombre idéntico» o «Nombre parecido» e «Inactiva/baja». Se descartan las de nombre poco parecido. **El parecido de nombre nunca confirma nada**: el usuario marca la correcta (o varias de la misma empresa para combinar datos).
3. Vista previa **editable** campo a campo, con la fuente y un enlace al registro. En una ficha existente solo se marcan por defecto los huecos; lo que ya tiene la ficha **no se sobrescribe** salvo que el usuario lo marque. El nombre comercial de una ficha existente nunca se cambia.
4. Se guardan solo los campos marcados, con su **procedencia** (fuente, enlace, fecha, «editado» si el usuario cambió el texto). Si más tarde se edita a mano un dato, su procedencia se retira. Visible en *Datos de la empresa → Procedencia de los datos*.
5. Sin resultados fiables o sin conexión: aviso y la ficha se crea o completa a mano como siempre.

Al buscar, **solo el nombre** viaja a esas fuentes (con el origen de la app como referer a OpenStreetMap, como exige su política). El diálogo lo indica antes de buscar.

## Fuentes y cobertura (verificadas contra los servidores reales)
| Fuente | Cobertura | Campos reales | Licencia |
|---|---|---|---|
| **Sirene** (INSEE, `recherche-entreprises.api.gouv.fr`) | Francia | razón social, ciudad, dirección, actividad (código NAF, sin descripción) | Licence Ouverte 2.0 |
| **Brønnøysund** (`data.brreg.no`) | Noruega | razón social, dirección, **web, teléfono, email**, sector y descripción de actividad | NLOD 2.0 |
| **ARES** (`ares.gov.cz`) | Chequia | razón social, ciudad, dirección, actividad (código CZ-NACE) | Datos abiertos |
| **GLEIF** (`api.gleif.org`) | Mundial, **solo entidades con código LEI** (normalmente medianas/grandes). Verificado con Italia, España, Francia, Alemania, Finlandia, Noruega… | razón social, país, ciudad, dirección legal, nº de registro, estado | CC0 |
| **Wikidata** + Commons | Mundial, **solo empresas con ficha en Wikidata** (suelen ser conocidas) | nombre, país, ciudad de la sede, **web, sector, descripción, logo** | CC0 |
| **OpenStreetMap** (Nominatim) | Mundial: comercios y empresas cartografiados | nombre, dirección, ciudad, país y — **solo si están etiquetados** — web, teléfono, email, operador (razón social) | © colaboradores de OpenStreetMap (ODbL) |

**Italia y España** (principales mercados) **no tienen registro mercantil gratuito con API accesible**: el Registro Imprese italiano y el Registro Mercantil español son de pago o sin API pública. Su cobertura aquí es solo vía GLEIF, Wikidata y OpenStreetMap: funciona bien para empresas medianas/grandes y comercios conocidos (p. ej. Pastificio Di Martino por GLEIF, Pasticceria Cappello con teléfono, email y web por OpenStreetMap, Barilla con web, sector y logo por Wikidata) y **no encontrará muchas empresas pequeñas**.

## Campos: qué fuente los aporta de verdad
- **Razón social**: GLEIF, Sirene, Brønnøysund, ARES, OSM (operador).
- **País / ciudad / dirección**: todas menos Wikidata (país y ciudad de la sede, sin calle).
- **Web**: Wikidata, Brønnøysund, OSM (si está etiquetada).
- **Teléfono / email general**: Brønnøysund (Noruega) y OSM si están etiquetados. **No existe fuente gratuita general para teléfono/email**; no se inventan ni se deducen.
- **Sector**: Wikidata (texto), Brønnøysund (texto); Sirene y ARES solo dan un **código** de actividad (se muestra como código, sin traducir).
- **Descripción de la actividad**: Wikidata (una línea), Brønnøysund (texto oficial en noruego), OSM (si hay).
- **Logo**: solo Wikidata/Commons (descarga con CORS verificado). Para otras empresas sigue disponible el logo desde foto o desde la web de la empresa.

## Lo que NO se implementa (y por qué)
- **Web oficial de la empresa**: los navegadores no dejan leer su HTML desde otra página (CORS) y no hay proxy gratuito fiable; sigue disponible el buscador de logo existente.
- **Directorios de ferias** (SIAL, etc.): no hay una API pública autorizada.
- **Registros de pago o con clave** (OpenCorporates, Companies House, Zefix, CVR danés con cuota…): fuera de «coste cero sin claves». Finlandia (PRH) tiene API abierta pero su formato es complejo; no se ha incluido.
- **Empresarios individuales** (personas físicas) en Sirene, Brønnøysund y ARES: se excluyen a propósito (datos personales sin interés comercial).

## Límites de uso
Nominatim: una sola petición por búsqueda y solo cuando el usuario la pide (su política prohíbe el autocompletado y el uso intensivo). Wikidata puede responder 429 si se encadenan muchas búsquedas seguidas: la app lo indica («límite de uso alcanzado, reintenta en un minuto») y sigue con el resto de fuentes.

## Datos y copias ZIP
Campos nuevos **opcionales** en la empresa: `sector`, `description`, `provenance`. No cambia el esquema de IndexedDB (no hay migración). La copia ZIP pasa a esquema 4 (los ZIP v1–v3 se restauran igual; una app anterior rechazará un ZIP v4 en lugar de perder datos en silencio). La procedencia se sanea al restaurar (solo URLs http/https, tamaños acotados) y el CSV de empresas añade `sector` y `descripcion_actividad` al final.

## Repetir la verificación
```bash
npm run enrich:live   # consulta las fuentes reales con 10 empresas de ejemplo (necesita Internet)
```
Las pruebas automáticas (`npm test`) usan respuestas reales abreviadas, sin red.
