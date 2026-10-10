# Checklist de pruebas reales — Samsung Galaxy S25 Ultra

Marca cada punto sólo tras ejecutarlo en el móvil. **Ninguna de estas pruebas de hardware se ha ejecutado todavía** (las pruebas automáticas y las de navegador de escritorio no sustituyen al dispositivo).

Prepara: tarjetas de visita reales (ES/IT/EN/FR si es posible, una con fondo oscuro/brillante), un QR vCard (puedes generarlo con cualquier generador gratuito), un QR de URL, Wi‑Fi para la instalación.

## 0. Instalación
- [ ] Abrir la URL en Chrome con Wi‑Fi, instalar como app, aparece el icono «Scout».
- [ ] Abrir la app instalada: pantalla completa, sin barra del navegador.
- [ ] Aviso «Lista para funcionar sin conexión».
- [ ] Ajustes → Descargar OCR → «✓ Recursos OCR guardados».
- [ ] Ajustes → almacenamiento «Protegido: sí» (si no, pulsar «Solicitar protección»).

## 1. Altas y datos (P0)
- [ ] Nueva empresa sólo con nombre → ficha creada con origen «SIAL París 2026».
- [ ] Escribir una empresa parecida a otra (p. ej. «Surgelati Mare» vs «Surgelati Mare SRL») → avisa de duplicado y permite abrir la existente o continuar.
- [ ] Editar campos de la ficha, salir sin pulsar nada → al volver, todo guardado (autoguardado).
- [ ] Escribir un nombre en «Nueva empresa», cambiar a otra app, matar la app desde recientes y reabrir → se recupera el borrador.
- [ ] Añadir 3 contactos manuales a una empresa; editar y eliminar uno (confirmación).
- [ ] Añadir un contacto con el mismo email que otro → pide confirmación, no sobrescribe.
- [ ] Notas: escribir, dictar con el micrófono del teclado (es/it/en/fr), editar y borrar.
- [ ] Directorio: buscar, filtrar por tipo, país, evento y prioridad; orden por última modificación.

## 2. Fotos
- [ ] «Foto» (cámara trasera) de un producto: aparece miniatura; abrir a tamaño completo; el texto pequeño de un envase sigue legible al ampliar.
- [ ] Varias fotos desde la galería a la vez; cambiar categoría y añadir descripción; eliminar con confirmación.
- [ ] Foto de una imagen HEIC/no compatible → mensaje claro, sin bloquear.

## 3. Audio
- [ ] Grabar 30 s, parar, reproducir. Repetir en **modo avión**.
- [ ] Denegar el permiso de micrófono → mensaje explicativo, la app sigue operativa.
- [ ] Grabar y salir de la ficha mientras graba → el audio queda guardado.
- [ ] Anotar si la grabación se corta con la pantalla bloqueada.

## 4. Escáner de tarjetas (P1) — PRUEBA CRÍTICA TRAS LA CORRECCIÓN DEL OCR
Usa la tarjeta real que falló y 3-4 más. Anota para cada una lo que ves.
- [ ] **Foto girada**: con el móvil en vertical, fotografía la tarjeta horizontal SIN girarla. La pantalla de resultado debe mostrarla **derecha** y rellenar empresa, persona, cargo, email(s) y teléfonos. Diagnóstico (desplegable al final): giro aplicado ______°, tiempo ______ s.
- [ ] **Foto derecha** (misma tarjeta): resultado equivalente; tiempo ______ s (primera vez) / ______ s (siguientes).
- [ ] Empresa: ¿es el nombre correcto o queda vacío con alternativas? **Nunca** debe aparecer texto ininteligible (p. ej. «7a 7 sa À»).
- [ ] Emails: ¿aparecen los dos (personal y corporativo)? El principal debe ser el corporativo; el otro va en Notas como «Email personal».
- [ ] Teléfonos: móvil en «Móvil» y el de la empresa en «Teléfono». Direcciones en Notas.
- [ ] Los campos dudosos salen «⚠ revisar» y las alternativas aparecen como botones tocables.
- [ ] Botones **⟲ ⟳ Girar**, **✂ Recortar** (arrastra sobre la tarjeta y «Leer el recorte»), **↻ Repetir**, **Otra tarjeta**: todos responden.
- [ ] Girar a propósito a una orientación mala → no rellena basura y avisa.
- [ ] Guardar: el contacto queda con la **foto de la tarjeta derecha** (ábrela desde el contacto). Probar «empresa nueva» y «empresa existente».
- [ ] Tarjeta ilegible/foto borrosa → se puede guardar la foto y rellenar a mano.
- [ ] Tarjeta en español, italiano, inglés y francés (una de cada): campos acertados / fallados: ______
- [ ] Tarjeta con fondo oscuro o muy decorada: ______
- [ ] **Modo avión** (con OCR descargado): repetir una de las anteriores.
- [ ] Si es muy lento (> 30 s) o falla: Ajustes → dejar sólo Inglés + Italiano; probar de nuevo. Si sigue mal, usar «Sólo guardar la foto» y rellenar a mano.

## 5. Escáner QR (P1)
- [ ] Cámara trasera: leer un QR vCard → formulario editable → asignar a empresa existente y a una nueva.
- [ ] Leer un QR MECARD, uno de URL (no se abre sola; «Abrir…» pide confirmación), uno de email y uno de teléfono.
- [ ] Leer un QR desde una imagen de la galería.
- [ ] Denegar permiso de cámara → mensaje claro; «Leer QR desde una imagen» sigue disponible.
- [ ] **Modo avión**: leer un QR vCard (debe funcionar).

## 6. Persistencia y fallos
- [ ] Cerrar la app desde recientes y reabrir → todo sigue ahí (incluidas fotos y audios).
- [ ] Reiniciar el móvil y reabrir.
- [ ] Modo avión: crear empresa, contactos, foto, nota, audio; salir y volver a entrar.

## 7. Copias
- [ ] Copias → Crear ZIP: aparece «Copia verificada ✓» con recuentos correctos. Enviar por «Compartir» a Drive/correo.
- [ ] Banner del Directorio: aparece al haber cambios nuevos y desaparece tras la copia.
- [ ] En el **ordenador**: abrir `empresas.csv` y `contactos.csv` en Excel (tildes y ñ correctas, columnas separadas).
- [ ] En el ordenador: abrir la app (Chrome) → Copias → Restaurar el ZIP en modo «Reemplazar» → todo recuperado, fotos y audios reproducibles.
- [ ] Restaurar el mismo ZIP otra vez en modo «Fusionar» → 0 nuevas, nada duplicado.
- [ ] Probar con un ZIP renombrado/editado a mano (borrar un archivo dentro) → rechazado con la lista de problemas y datos intactos.
- [ ] Con el móvil casi sin espacio (si es posible): comprobar mensaje de «sin espacio».

## 8. Desactivar funciones P1
- [ ] Ajustes → desactivar OCR y QR: desaparecen de menús y fichas; el resto funciona. Reactivar.

## Resultado
Fecha: ____  Versión (Ajustes): ____  Incidencias: ______________________________
