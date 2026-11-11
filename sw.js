// 서비스 워커 (v0.100): 앱으로 설치(PWA)하고 인터넷이 없어도 플레이할 수 있게 파일을 보관한다
//  - 게임 화면(index.html): 인터넷이 되면 늘 새로 받고, 안 되면 보관한 것
//  - 게임 파일(js·css, ?v=번호): 번호가 바뀌면 새 파일이라 보관한 것을 그대로 쓴다
//  - 포켓몬 그림(SpriteCollab)·글꼴·Firebase SDK: 한 번 받은 것은 보관해서 다시 쓴다 (처음 보는 그림만 인터넷 필요)
//  - 온라인 기능(로그인·구조 게시판 등)의 요청은 건드리지 않는다
'use strict';
const APP = 'pmd-app-v1', EXT = 'pmd-ext-v1';
const EXT_MAX = 6000;   // 그림 등 보관 개수 (넘치면 오래된 것부터 지운다)
const EXT_HOSTS = ['cdn.jsdelivr.net', 'raw.githubusercontent.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'];

// 설치할 때: 게임 화면과 거기서 부르는 파일을 미리 받아 둔다
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(APP);
    const res = await fetch('./', { cache: 'no-store' });
    if (res.ok) {
      const html = await res.clone().text();
      await c.put('./', res);
      const urls = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|webmanifest|png)(?:\?[^"]*)?)"/g)].map(m => m[1]).filter(u => !/^https?:/.test(u));
      await Promise.all(urls.map(u => c.add(u).catch(() => {})));
    }
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== APP && k !== EXT) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (req.mode === 'navigate') return e.respondWith(networkFirst(req, './'));
    if (url.searchParams.has('check') || req.cache === 'no-store') return;   // 새 버전 확인 (main.js)은 늘 인터넷으로
    if (url.searchParams.has('v')) return e.respondWith(cacheFirst(req, APP, true));
    return e.respondWith(networkFirst(req));
  }
  if (EXT_HOSTS.includes(url.hostname)) e.respondWith(cacheFirst(req, EXT));
});

async function networkFirst(req, key) {
  const c = await caches.open(APP);
  try {
    const res = await fetch(req);
    if (res.ok) c.put(key || req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(key || req, { ignoreSearch: !!key });
    if (hit) return hit;
    throw err;
  }
}
async function cacheFirst(req, name, sameOrigin) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  if (hit) return hit;
  // 다른 곳의 그림은 CORS로 다시 받는다 (불투명 응답은 저장 용량을 크게 차지한다)
  const res = await fetch(sameOrigin || req.mode === 'cors' ? req : new Request(req.url, { mode: 'cors', credentials: 'omit' })).catch(() => fetch(req));
  if (res.ok && (res.type === 'basic' || res.type === 'cors')) { await c.put(req, res.clone()); if (!sameOrigin) trim(c); }
  if (sameOrigin && res.ok) prune(c, req.url);
  return res;
}
// 같은 파일의 옛 번호(?v=)는 지운다
async function prune(c, url) {
  const base = url.split('?')[0];
  for (const k of await c.keys()) if (k.url.split('?')[0] === base && k.url !== url) c.delete(k);
}
let trimming = false;
async function trim(c) {
  if (trimming) return; trimming = true;
  try { const keys = await c.keys(); for (let i = 0; i < keys.length - EXT_MAX; i++) await c.delete(keys[i]); } finally { trimming = false; }
}
