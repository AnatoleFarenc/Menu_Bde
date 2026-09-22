// Service worker of the BDE site: it exists only to receive Web Push alerts
// (new order for the staff) while the site is closed. It deliberately caches
// nothing and never touches page requests, so it can't serve stale files.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

// A no-op fetch handler: it never calls respondWith(), so every request goes
// through exactly as if this worker didn't exist -- still true for install
// eligibility though, which some engines still gate on "has a fetch handler"
// even now that it no longer has to actually do anything.
self.addEventListener('fetch', () => {});

// The last push this device received and what became of it, kept in Cache
// Storage so the site's "Diagnostic" can read it later: it tells "the message
// never reached this phone" apart from "it arrived but could not be shown".
async function recordPush(entry) {
  try {
    const cache = await caches.open('push-log');
    await cache.put('/__last-push', new Response(JSON.stringify(entry), { headers: { 'content-type': 'application/json' } }));
  } catch (e) {
    // Diagnostics must never break the notification itself.
  }
}

// Every push must end in a visible notification (browsers, iOS Safari above
// all, drop a subscription that receives silent pushes).
self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil((async () => {
    const at = new Date().toISOString();
    const title = data.title || 'BDE 42';
    try {
      try {
        await self.registration.showNotification(title, {
          body: data.body || '',
          icon: '/icon-192.png',
          // The small monochrome icon Android shows in the status bar and
          // the notification's own corner (distinct from `icon` above,
          // which is the big one in the notification body) -- without it,
          // Android falls back to a plain dot or the full-color icon
          // stretched to fit, which looks broken at that size.
          badge: '/badge.png',
          tag: data.tag || undefined,
          vibrate: [200, 100, 200],
          // Keeps it on screen instead of auto-dismissing after a few
          // seconds (Chrome desktop only -- Android/iOS ignore this and
          // always leave it in the notification shade either way).
          requireInteraction: true,
          data: { url: data.url || '/' }
        });
      } catch (richError) {
        // A browser that rejects one of the optional extras must still show
        // the alert: retry with only what every browser accepts.
        await self.registration.showNotification(title, { body: data.body || '', data: { url: data.url || '/' } });
      }
      await recordPush({ at, title, shown: true });
    } catch (e) {
      await recordPush({ at, title, shown: false, error: String((e && e.message) || e) });
    }
  })());
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
