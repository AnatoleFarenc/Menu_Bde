// Service worker of the BDE site: it exists only to receive Web Push alerts
// (new order for the staff) while the site is closed. It deliberately caches
// nothing and never touches page requests, so it can't serve stale files.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

// Every push must end in a visible notification (browsers, iOS Safari above
// all, drop a subscription that receives silent pushes).
self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(self.registration.showNotification(data.title || 'BDE 42', {
    body: data.body || '',
    icon: '/icon-192.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' }
  }));
});

// Tapping the notification brings the site (or installed app) to the front on
// the staff tab; if it isn't open, opens it there.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (open) {
      await open.focus();
      open.postMessage({ type: 'open-admin' });
      return;
    }
    await self.clients.openWindow(target);
  })());
});
