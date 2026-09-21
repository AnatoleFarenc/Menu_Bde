import axios from 'axios';

// Client side of the new-order alerts (Web Push, see server/push.js): the
// state of THIS device, and turning it on/off. Alerts are per device -- each
// phone/browser a staff member wants them on has to enable them once.

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isInstalledApp = () => window.navigator.standalone === true
  || window.matchMedia('(display-mode: standalone)').matches
  || window.matchMedia('(display-mode: fullscreen)').matches;

const authHeaders = token => ({ headers: { Authorization: `Bearer ${token}` } });

// The server's VAPID public key, as the bytes pushManager.subscribe wants.
function keyToBytes(base64url) {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

const sameKey = (buffer, bytes) => {
  if (!buffer) return false;
  const a = new Uint8Array(buffer);
  return a.length === bytes.length && a.every((v, i) => v === bytes[i]);
};

// What this device can do right now:
//   'unavailable' -- the server has no VAPID keys (feature off)
//   'insecure'    -- page isn't HTTPS: browsers refuse notifications there
//   'ios-install' -- iPhone/iPad only allow them for the site added to the Home Screen
//   'unsupported' -- this browser can't do Web Push
//   'blocked'     -- the user refused (or blocked) notifications in the browser
//   'off' | 'on'
export async function getPushStatus(token) {
  try {
    const { data } = await axios.get('/api/admin/push/config', authHeaders(token));
    if (!data.enabled) return { status: 'unavailable' };
    const publicKey = data.publicKey;

    if (!window.isSecureContext) return { status: 'insecure' };
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      return { status: isIOS() && !isInstalledApp() ? 'ios-install' : 'unsupported' };
    }
    if (Notification.permission === 'denied') return { status: 'blocked' };

    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    if (subscription && Notification.permission === 'granted') {
      // Keep the server's copy in step with this device's (it may have been
      // wiped, or the VAPID keys may have changed since this device subscribed).
      const bytes = keyToBytes(publicKey);
      if (!sameKey(subscription.options && subscription.options.applicationServerKey, bytes)) {
        await subscription.unsubscribe();
        return { status: 'off', publicKey };
      }
      await axios.post('/api/admin/push/subscribe', { subscription: subscription.toJSON() }, authHeaders(token));
      return { status: 'on', publicKey };
    }
    return { status: 'off', publicKey };
  } catch (e) {
    console.error('Could not read push status:', e);
    return { status: 'unavailable' };
  }
}

// Must run from a click (browsers refuse the permission prompt otherwise).
// Returns the new status, or throws a message-carrying Error.
export async function enablePush(token, publicKey) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'blocked';

  await navigator.serviceWorker.register('/sw.js');
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyToBytes(publicKey)
  });
  await axios.post('/api/admin/push/subscribe', { subscription: subscription.toJSON() }, authHeaders(token));
  return 'on';
}

export async function disablePush(token) {
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = registration ? await registration.pushManager.getSubscription() : null;
  if (subscription) {
    await axios.post('/api/admin/push/unsubscribe', { endpoint: subscription.endpoint }, authHeaders(token)).catch(() => {});
    await subscription.unsubscribe();
  }
  return 'off';
}

export async function sendTestPush(token) {
  await axios.post('/api/admin/push/test', {}, authHeaders(token));
}
