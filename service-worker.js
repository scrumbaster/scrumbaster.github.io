const CACHE_NAME = "mytasks-offline-v1";

const OFFLINE_ASSETS = [
  "./",
  "./index.html",
  "./data.js",
  "./data_access.js?v=20260705-6",
  "./risks.js",
  "./static/site.webmanifest",
  "./static/apple-touch-icon.png",
  "./static/favicon-32x32.png",
  "./static/favicon-16x16.png",
  "./static/android-chrome-192x192.png",
  "./static/android-chrome-512x512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(OFFLINE_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames.map(function (cacheName) {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          if (response.ok) {
            const responseCopy = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              return cache.put("./index.html", responseCopy);
            }).catch(function () {});
          }
          return response;
        })
        .catch(function () {
          return caches.match("./index.html");
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cachedResponse) {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then(function (response) {
        if (response.ok) {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            return cache.put(request, responseCopy);
          }).catch(function () {});
        }
        return response;
      });
    })
  );
});
