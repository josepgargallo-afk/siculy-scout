/* Web Share Target: recibe en Android «Compartir → Siculy Scout» (un .vcf o un enlace/texto).
 * Se importa desde el service worker generado (workbox.importScripts). Guarda lo recibido en una caché local
 * temporal y redirige a la pantalla de importación. No hace ninguna petición de red ni envía datos a ningún sitio. */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'POST') return;
  const url = new URL(req.url);
  if (!url.pathname.endsWith('/share-target')) return;
  event.respondWith((async () => {
    try {
      const form = await req.formData();
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const cache = await caches.open('scout-share');
      let n = 0;
      for (const f of form.getAll('file')) {
        if (typeof f === 'object' && f && 'size' in f && f.size <= 10 * 1024 * 1024) {
          await cache.put('/__share/' + id + '/' + n, new Response(f, { headers: { 'content-type': f.type || 'text/vcard' } }));
          n++;
        }
      }
      const str = (k) => { const v = form.get(k); return typeof v === 'string' ? v.slice(0, 20000) : ''; };
      await cache.put('/__share/' + id + '/meta', new Response(JSON.stringify({ text: str('text'), url: str('url'), title: str('title'), files: n })));
      return Response.redirect(new URL('./#/import?share=' + id, self.registration.scope).href, 303);
    } catch (e) {
      return Response.redirect(new URL('./#/import', self.registration.scope).href, 303);
    }
  })());
});
