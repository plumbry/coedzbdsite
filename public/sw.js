const CACHE_NAME = "app-v3";
const urlsToCache = ["/", "/icon/icon-192.png", "/icon/icon-512.png"];

function isHtmlResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("text/html");
}

function isAssetPath(pathname) {
  return (
    pathname.startsWith("/assets/") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".mjs") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".wasm") ||
    pathname.endsWith(".map")
  );
}

// Install event - cache core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting()),
  );
});

// Fetch event - network first, fall back to cache
self.addEventListener("fetch", (event) => {
  // Only handle GET requests - POST/PUT/DELETE cannot be cached
  if (event.request.method !== "GET") {
    return;
  }

  // Never intercept cross-origin requests
  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) {
    return;
  }

  // Never intercept auth paths
  if (url.pathname.startsWith("/auth")) {
    return;
  }

  // Handle navigation requests differently
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/")));
    return;
  }

  // Hashed build assets must never be served from SPA HTML fallbacks.
  // Netlify `/* /index.html 200` returns HTML with status 200 for missing
  // chunks — caching that under a .js URL breaks module scripts.
  if (
    isAssetPath(url.pathname) ||
    event.request.destination === "script" ||
    event.request.destination === "style" ||
    event.request.destination === "worker"
  ) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (isHtmlResponse(response)) {
          return Response.error();
        }
        return response;
      }),
    );
    return;
  }

  // Network-first for other same-origin GET requests
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache successful non-HTML responses (status 200-299)
        if (!response.ok || isHtmlResponse(response)) {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          }),
        );
      })
      .then(() => self.clients.claim()),
  );
});

// Handle push notifications - only show if app is not in focus
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const isAppInFocus = clientList.some((client) => client.focused);

      // Only show notification if app is not in focus
      if (!isAppInFocus) {
        return self.registration.showNotification(data.title, data.options);
      }
    }),
  );
});

// Handle notification clicks - opens/focuses the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      // Focus existing window if found
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      // Open new window if none exists
      if (clients.openWindow) return clients.openWindow("/");
    }),
  );
});
