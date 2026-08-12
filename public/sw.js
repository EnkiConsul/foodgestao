// One-release cleanup worker for the previous Workbox app-shell cache.
// Keep this file at /sw.js so returning browsers receive the replacement.
// It never navigates open tabs: doing so could loop the page in a permanent
// "loading" state. Cleaning the caches + unregistering is enough.
function isAppWorkboxCache(name) {
  const isWorkboxBucket = /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-|^html$/.test(name);
  return isWorkboxBucket && (name.endsWith(self.registration.scope) || name === "html");
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        const appCacheNames = cacheNames.filter(isAppWorkboxCache);
        await Promise.allSettled(appCacheNames.map((name) => caches.delete(name)));
      } finally {
        await self.registration.unregister();
      }
    })(),
  );
});
