/* Service worker du dashboard Chairow : notifications de vente + repli hors connexion. Portée : /admin */
const CACHE = "digishop-v2";
const OFFLINE = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(new Request(OFFLINE, { cache: "reload" }))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

// Réseau d'abord pour les pages ; la page hors ligne seulement si le réseau est coupé
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.match(OFFLINE, { ignoreVary: true, ignoreSearch: true })) || Response.error()));
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Chairow", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Chairow", {
      body: data.body || "",
      icon: "/pwa-icon/192",
      badge: "/pwa-icon/192",
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/admin" },
    }),
  );
});

// Clic : on remet au premier plan un onglet du dashboard (ou on en ouvre un) sur la bonne page
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/admin", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const win = wins.find((w) => new URL(w.url).pathname.startsWith("/admin"));
      if (win) {
        await win.focus();
        return win.navigate(url);
      }
      return self.clients.openWindow(url);
    })(),
  );
});
