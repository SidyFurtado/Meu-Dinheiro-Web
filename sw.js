// ============================================================
// sw.js — Service Worker do app instalável (PWA)
// ============================================================
// Guarda só os arquivos do próprio site (nunca dados financeiros) para o app
// abrir rápido e funcionar como aplicativo. Sempre tenta a rede primeiro, então
// quem está online recebe a versão nova logo após cada deploy.

const CACHE = 'meu-dinheiro-v1';
const ARQUIVOS = [
  './',
  'index.html',
  'app.js',
  'firebase-config.js',
  'style.css',
  'tailwind-output.css',
  'manifest.webmanifest',
  'vendor/chart.umd.min.js',
  'vendor/lucide.min.js',
  'assets/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Firebase, Google e qualquer outro domínio passam direto, sem cache
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok && res.type === 'basic') {
          const copia = res.clone();
          caches.open(CACHE).then(c => c.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
