/* Jet Lag Coach service worker — offline cache + reminder helper */
const CACHE = "jetlag-coach-v10";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/trip-data.js",
  "./js/notifications.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith(
    caches.match(req).then((cached) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res && res.ok && new URL(req.url).origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});

let reminders = [];
let checkTimer = null;

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "SET_REMINDERS") {
    reminders = Array.isArray(msg.reminders) ? msg.reminders : [];
    armChecker();
  }
  if (msg.type === "CLEAR_REMINDERS") {
    reminders = [];
    if (checkTimer) clearInterval(checkTimer);
    checkTimer = null;
  }
});

function armChecker() {
  if (checkTimer) clearInterval(checkTimer);
  checkTimer = setInterval(checkDue, 60_000);
  checkDue();
}

async function checkDue() {
  const now = Date.now();
  const due = [];
  const keep = [];
  for (const r of reminders) {
    if (r.fireAt <= now && r.fireAt > now - 5 * 60_000) due.push(r);
    else if (r.fireAt > now) keep.push(r);
  }
  reminders = keep;
  for (const r of due) {
    try {
      await self.registration.showNotification(r.title, {
        body: r.body,
        tag: r.tag,
        icon: "./icons/icon-192.png",
        badge: "./icons/icon-192.png",
        data: r.data,
      });
    } catch (_) {}
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ("focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./index.html");
    })
  );
});
