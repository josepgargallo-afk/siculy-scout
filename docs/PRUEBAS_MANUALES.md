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

---
## 9. Novedades v0.2.0 (críticas antes de la feria)

### 9.1 Rellenado automático de empresa desde la tarjeta
- [ ] Escanear la tarjeta real → «Datos de la empresa detectados» muestra nombre comercial/legal, país (⚠ revisar si lo dedujo del prefijo), ciudad, direcciones legal/operativa, web, email y teléfono corporativos. Contacto con cargo, emails y teléfonos.
- [ ] Guardar como **empresa nueva** → la ficha trae esos datos (revísalos en «Datos de la empresa»).
- [ ] Escanear otra tarjeta de una empresa **ya existente** → elegir «Empresa existente»: aparecen «Nuevo» / «Conflicto»; por defecto no se pisa nada. Elegir «Usar detectado» en un conflicto y comprobar que sólo cambia ese campo.
- [ ] Una tarjeta cuya empresa no coincide con la ficha elegida muestra el aviso ⚠ y pide confirmación.
- [ ] Categorías y productos NO se rellenan nunca solos.

### 9.2 Tarjetas digitales y vCard (.vcf)
- [ ] QR de **Avacard**: se ofrece abrir el enlace, «Importar archivo .vcf» y «Crear contacto sólo con este enlace». Abrir el enlace, pulsar en la página el botón de guardar/descargar contacto (.vcf) → **¿lo ofrece Avacard?** Anotar: ______
- [ ] «Importar archivo .vcf» → selector de Android → carpeta Descargas → elegir el .vcf → pantalla editable con persona, cargo, empresa, emails, teléfonos, web, dirección.
- [ ] **Compartir → Siculy Scout** desde el visor de archivos / Descargas con el .vcf (si «Siculy Scout» no aparece, desinstalar y reinstalar la app: el menú Compartir se registra al instalar).
- [ ] .vcf exportado desde la agenda de Android con varios contactos: lista para elegir e importar uno a uno.
- [ ] QR de vCard directo (sin internet, modo avión).
- [ ] Contacto con la empresa elegida distinta a la del vCard → aviso.

### 9.3 Transcripción de audio (EXPERIMENTAL, desactivada por defecto)
- [ ] Ajustes → Transcripción de audio: descargar modelo «Base» con Wi-Fi (76 MB). Tiempo: ______
- [ ] Probar un audio de 15 s en **español** y otro en **italiano**: tiempo ______ / ______; ¿correcto? ______
- [ ] Mientras transcribe, ¿la app sigue usable? ¿se calienta/ralentiza el móvil? ______
- [ ] **Modo avión**: grabar y transcribir (el modelo debe estar ya descargado).
- [ ] Cerrar la app a mitad de una transcripción y reabrir: debe retomarla sin duplicar notas.
- [ ] Editar la nota y pulsar «Transcribir de nuevo»: la nota editada no se pisa.
- [ ] Si falla o es demasiado lenta: desmarcar «Transcribir automáticamente»; el audio y las notas manuales siguen igual.

### 9.4 Migración y copias
- [ ] Abrir la app nueva sobre tus datos reales: empresas, contactos, fotos y audios siguen ahí. **Haz una copia ZIP ANTES de actualizar.**
- [ ] Copia ZIP nueva → restaurar en el ordenador (Reemplazar) → todo presente.
- [ ] Restaurar en la versión nueva una copia ZIP antigua (si la conservas) → se restaura sin errores.

---
## 10. Novedades v0.3.0 (críticas)

### 10.1 Notas y audios
- [ ] Abrir una empresa con audios y notas de la versión anterior: todo aparece en **una sola sección** «Notas y audios», sin duplicados; los audios sin transcribir en el grupo plegado.
- [ ] Grabar una nota **en español** y otra **en italiano** eligiendo el idioma (ES / IT) o AUTO junto a «Grabar». Anotar tiempo hasta ver el texto: ______ / ______
- [ ] Al parar la grabación, la tarjeta aparece **arriba** como «Transcribiendo…» y luego con el texto, sin tener que desplazarse.
- [ ] «Escuchar audio» muestra el reproductor; «Ocultar audio» lo pliega. «Ver más» en una nota larga.
- [ ] «Añadir comentario» → escribir → cerrar y reabrir la ficha: el comentario sigue, separado de la transcripción.
- [ ] «Editar» una transcripción, guardar, «↺ Texto original» restaura; «Volver a transcribir» NO pisa la edición ni duplica la nota.
- [ ] Eliminar: «Sólo la nota» conserva el audio (aparece en «Audios sin transcribir» con «Recuperar nota»).

### 10.2 Precisión (la prueba que decide)
Usa frases reales de tu trabajo, p. ej.: «Quiero cuarenta cajas de cannoli de dos kilos a doce euros con cincuenta el kilo», «crema di pistacchio di Bronte, barattoli da trecento grammi». Para cada modelo anota: palabras mal, cifras mal, texto inventado.
- [ ] **Base** (por defecto) español: ______  italiano: ______  tiempo: ______
- [ ] Probar con y sin «Grabar sin filtros de llamada»: ¿mejora? ______
- [ ] **Small** (descargar con Wi-Fi, 241 MB): español ______ italiano ______ tiempo ______; ¿la app sigue estable (no se cierra, no se calienta en exceso)? ______
- [ ] Grabar en silencio 10 s: debe dar «No se detectó voz», nunca texto.
- [ ] Hablar bajo / lejos del móvil: si dice «No se detectó voz», probar «Forzar sin filtro de voz» (puede inventar: revisar).
- [ ] Una grabación de **más de 40 s**: el texto debe cubrir todo el audio, no sólo los primeros 30 s.
- [ ] Los avisos «Contiene cifras» y «Aparecen términos de tu vocabulario» salen donde corresponde.
- [ ] **Modo avión** con el modelo ya descargado.
- [ ] Cerrar la app mientras transcribe y reabrir: retoma sin duplicar.

### 10.3 Datos
- [ ] **Copia ZIP antes de actualizar**; tras actualizar: empresas, fotos, audios, transcripciones y notas intactos.
- [ ] Copia nueva → restaurar en el ordenador: comentarios y transcripciones presentes.
