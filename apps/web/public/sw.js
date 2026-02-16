const CACHE_NAME = 'claude-monitor-v1';
const RUNTIME_CACHE = 'claude-monitor-runtime';

// インストール時に事前キャッシュするリソース
const PRECACHE_URLS = [
  '/',
  '/index.html',
];

// Service Workerのインストール
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  // 新しいService Workerを即座にアクティブ化
  self.skipWaiting();
});

// 古いキャッシュの削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // 全てのクライアントを即座に制御下に
  return self.clients.claim();
});

// Fetchイベント - Network First戦略（リアルタイム性重視）
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // WebSocketとAPIリクエストはキャッシュしない
  if (url.pathname.startsWith('/ws') || url.pathname.startsWith('/api')) {
    return;
  }

  // 静的リソースのみキャッシュ
  event.respondWith(
    fetch(request)
      .then((response) => {
        // レスポンスをクローンしてキャッシュに保存
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // ネットワークエラー時はキャッシュから返す
        return caches.match(request);
      })
  );
});
