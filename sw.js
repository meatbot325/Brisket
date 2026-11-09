// Minimal service worker: required for "Add to Home Screen" + share target. Network-first, no caching of API calls.
const CACHE = "brisket-v2";
const SHELL = ["./", "./index.html", "./manifest.json", "./icon.svg", "./icon-maskable.svg",
  "./art/brisket-idle.svg", "./art/brisket-clear.svg", "./art/brisket-unsure.svg", "./art/brisket-nope.svg", "./art/brisket-sniff.svg"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {}); return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match("./index.html"))));
});
