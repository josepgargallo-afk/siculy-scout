# OCCASORIO — Brand Kit v2 (reconstrucción del tablero original)

**Fuente de verdad:** `docs/marca/tablero-original.webp` (imagen raster). El kit v1 queda descartado: no coincidía con el tablero.

## Qué es y qué no es
- **No es el vector original** (no se dispone de él). Es una **reconstrucción vectorial** del símbolo: corona (anillo) con cinta plegada y un punto exterior, medida sobre el tablero. Error medio de color ≈ 4/255 en la corona y el punto (el tablero está desenfocado, por lo que los bordes no son comparables).
- **Logotipo:** Outfit Medium (SIL OFL 1.1) convertido a contornos y colocado en las posiciones medidas; lema en Outfit Regular. La «r» es una adaptación (brazo comprimido) porque la del tablero es más estrecha que la de Outfit.
- **Aproximaciones:** el pliegue de la cinta, el sombreado interior y los degradados son aproximaciones por tramos; no hay garantía de geometría idéntica a la del diseñador.

## Discrepancias con el encargo (decididas por el tablero)
- El tablero **no contiene naranja ni coral**. Su paleta: Índigo #6366F1, Violeta #8B5CF6, Turquesa #06B6D4, Azul oscuro #0F172A, Gris neutro #64748B, Gris claro #E2E8F0.
- El tablero **sí tiene un punto exterior** (azul índigo, arriba a la derecha); se reproduce. No hay punto coral, trazo blanco interior ni anillo turquesa.
- El icono de app del tablero es una baldosa **blanca**; el maskable es blanco a sangre.

## Archivos
Símbolo: `simbolo.svg`, `simbolo_monocromo.svg`, `simbolo_blanco.svg`. Logotipo: `logo_horizontal_claro/oscuro.svg` (con lema), `logo_horizontal_sin_lema_*.svg`, `logo_monocromo.svg`, `logo_blanco.svg`. Iconos: `app_icon.svg`, `app_icon_maskable.svg`, PNG 192/512/1024, `app_icon_maskable_512.png`. Favicon: `favicon.svg`, `favicon_32/64.png`. `tokens.css`. Regenerar: `npm run brand`.

## Uso
Tipografía de la aplicación: Inter. Fondo cálido #FAF8F4. Lema «Discover. Capture. Grow.» (aspiracional; no anunciar funciones inexistentes). El maskable mantiene corona y punto dentro del círculo seguro (radio 0,4).

## Marca
Propuesta gráfica, no certifica derechos. La investigación de marca sigue en CONDITIONAL GO (OCCASIO, OCCASORIA).
