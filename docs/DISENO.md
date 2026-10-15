# Sistema de diseño — Siculy Scout v0.5.0

> **v0.7.0:** la paleta y el logotipo pasan a ser los de **OCCASORIO** (ver [MARCA.md](MARCA.md)). Los tokens `--cream`, `--pistachio` y `--terracotta` se sustituyen por `--ivory`, `--teal` y `--coral` (con sus variantes `-ink` y `-soft`); la estructura y los componentes descritos aquí siguen igual.

Objetivo: una app de feria rápida de leer y de pulsar con una mano, con identidad mediterránea sobria. Todo vive en `src/styles.css` como tokens CSS; los componentes no usan colores sueltos.

## Decisiones
| Decisión | Por qué |
|---|---|
| Fondo **crema** `#F5F2EA`, tarjetas blancas | Más cálido y menos «formulario» que el gris; el blanco separa bloques sin sombras pesadas. |
| **Azul noche** `#102A3A` para acciones principales, iconos y estado activo | Máximo contraste (≈ 14:1 sobre crema) y coherente con la marca. |
| **Pistacho** para lo positivo (proveedor, «transcrito», pestaña activa) | Mediterráneo y distinto del verde «semáforo»: el éxito semántico usa un verde más oscuro (`--ok`). |
| **Terracota** sólo como acento (grabar, «hacer copia», comentario propio) | Llama la atención en pocas acciones clave sin competir con el azul. Relleno en su tono oscuro (`#9C4F36`) para que el texto blanco cumpla contraste AA. |
| Semánticos separados de la marca (`--ok`, `--warn`, `--err`, `--info`, `--danger`) | Un aviso o un error nunca se confunde con un color decorativo. |
| **Inter** integrada (48 KB, sólo latín, en la caché offline) | Muy legible en tamaños pequeños y cifras; no depende de Internet. Si no cargara, cae a la fuente del sistema (Roboto en Android). |
| Iconos **Lucide** (vectoriales, se empaquetan sólo los usados) | Sustituyen a los emojis: trazo uniforme, tamaño y color controlables. |
| Barra superior clara con desenfoque; el nombre de la empresa sólo aparece en ella al desplazarse | Evita repetir el nombre (ya está grande en la ficha) sin perder el contexto al bajar. |
| «Eliminar empresa» en el menú ⋮ (con la misma confirmación) | Acción destructiva fuera del camino del pulgar; sigue a dos toques. |
| Hojas inferiores para diálogos, con botones a todo el ancho | Se alcanzan con el pulgar y no se pulsan por error. |
| Texto base 16 px, mínimos de 13 px; objetivos táctiles ≥ 40–48 px | Legible de pie en un stand; campos de 16 px evitan el zoom de Android al enfocar. |

## Tokens principales
- Color: `--night`, `--cream`, `--pistachio(-ink/-soft)`, `--terracotta(-ink/-soft)`, `--surface`, `--line`, `--txt`, `--mut`, `--ok/--warn/--err/--info(-soft/-line)`, `--danger`, prioridad `--hi/--mid/--lo`.
- Tipografía: `--font`, `--fs-xs … --fs-xl`.
- Espaciado `--s1…--s6` (4–24 px), radios `--r-sm…--r-xl`, sombras `--sh-1…--sh-3`, movimiento `--t-fast` (120 ms; desactivado con «reducir movimiento»).
- Zonas seguras: `--safe-t`, `--safe-b`; barra inferior `--nav-h`.

## Componentes
`.btn` (primario, secundario, `accent`, `danger`, `danger-ghost`, `ghost`, `sm`, `lg`, `icon`), `.card` + `.card-title`/`.ic-tile`, `.field`, `.seg`, `.pills/.pill`, `.chip` (tipo, estado `ok/warn/err/info`, `outline`), `.banner` + `.banner-row`, `.acc` (acordeón), `.item.li` (fila de directorio), `.logo` (logo o iniciales con color estable por empresa), `.dialog` (hoja inferior), `MoreMenu` y `Notice` en `kit.tsx`, `.toast`, `.spinner`, `.progress`, `.empty`.

## Capturas (viewport 412 × 915, equivalente al S25 Ultra)
Datos ficticios. En `docs/capturas/`: `antes-*` (v0.4.0) y `despues-*` (v0.5.0): directorio con y sin empresas, ficha con y sin logo, menú ⋮, confirmación de borrado, varias secciones abiertas, notas/transcripción/comentario, tarjeta, revisión de captura, QR (estado de error de cámara), nueva empresa, copias y ajustes.
