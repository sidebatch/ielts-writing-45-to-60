const VERSION = "bandjump-v2.1.0";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then((res) => {
      // 성공 응답만 캐시한다 — 오류 응답이 캐시를 오염시켜 오프라인에 깨진 화면이 남는 것을 막는다
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() =>
      // 오프라인: 정확한 캐시가 없으면 화면 이동(navigation)은 앱 셸로 폴백한다
      caches.match(e.request, { ignoreSearch: true }).then((hit) => {
        if (hit) return hit;
        if (e.request.mode === "navigate") return caches.match("./index.html", { ignoreSearch: true });
        return Response.error();
      })
    )
  );
});
