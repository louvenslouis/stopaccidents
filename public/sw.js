const offlinePage = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>Stop Accidents</title>
  </head>
  <body style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui;text-align:center">
    <main>
      <h1>Hors connexion</h1>
      <a href="">Réessayer</a>
    </main>
  </body>
</html>`;

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.mode !== 'navigate' || request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(fetch(request).catch(() => new Response(offlinePage, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })));
});
