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
//   'server-off'  -- the server has no VAPID keys (feature not configured)
//   'error'       -- the server couldn't be reached
//   'insecure'    -- page isn't HTTPS: browsers refuse notifications there
//   'ios-install' -- iPhone/iPad only allow them for the site added to the Home Screen
//   'unsupported' -- this browser can't do Web Push
//   'blocked'     -- the user refused (or blocked) notifications in the browser
//   'off' | 'on'
export async function getPushStatus(token) {
  try {
    const { data } = await axios.get('/api/admin/push/config', authHeaders(token));
    if (!data.enabled) return { status: 'server-off' };
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
    return { status: 'error' };
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
  const { data } = await axios.post('/api/admin/push/test', {}, authHeaders(token));
  return data;
}

// Registers the service worker as soon as the site loads (not only when
// notifications get enabled): it is what lets a browser treat the site as an
// installable app, and keeps the worker itself up to date.
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(e => console.warn('Service worker registration failed:', e));
  });
}

const browserName = () => {
  const ua = navigator.userAgent;
  if (/Firefox|FxiOS/.test(ua)) return 'Firefox';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/Chrome|CriOS/.test(ua)) return 'Chrome';
  if (/Safari/.test(ua)) return 'Safari';
  return 'navigateur inconnu';
};

const platformName = () => {
  if (/Android/.test(navigator.userAgent)) return 'Android';
  if (isIOS()) return 'iOS';
  return 'ordinateur';
};

// A plain-text report of everything that decides whether an alert can reach
// this device, browser side and server side, in the order things happen --
// so "I got nothing" can be traced to the first step that is not OK.
export async function getPushDiagnostics(token) {
  const yes = value => (value ? 'oui' : 'NON');
  const lines = [];

  lines.push('— Cet appareil —');
  lines.push(`Navigateur : ${browserName()} sur ${platformName()}`);
  lines.push(`Connexion sécurisée (https) : ${yes(window.isSecureContext)}`);
  lines.push(`Application installée : ${isInstalledApp() ? 'oui' : 'non (facultatif, sauf iPhone/iPad)'}`);
  lines.push(`Service worker supporté : ${yes('serviceWorker' in navigator)}`);
  lines.push(`Notifications push supportées : ${yes('PushManager' in window && 'Notification' in window)}`);
  if ('Notification' in window) lines.push(`Autorisation du navigateur : ${Notification.permission}${Notification.permission === 'granted' ? '' : ' (doit être « granted »)'}`);

  let endpointHost = null;
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration('/').catch(() => null);
    lines.push(`Service worker enregistré : ${yes(registration)}${registration && registration.active ? ' (actif)' : registration ? ' (pas encore actif)' : ''}`);
    const subscription = registration && registration.pushManager ? await registration.pushManager.getSubscription().catch(() => null) : null;
    if (subscription) endpointHost = new URL(subscription.endpoint).hostname;
    lines.push(`Abonnement de cet appareil : ${subscription ? `oui (${endpointHost})` : 'NON'}`);
  }

  lines.push('');
  lines.push('— Serveur —');
  try {
    const { data } = await axios.get('/api/admin/push/diagnostics', authHeaders(token));
    lines.push(`Clés VAPID configurées : ${yes(data.enabled)}${data.enabled ? '' : ' -- ajoute VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY au .env du serveur, puis redémarre-le'}`);
    if (data.subject) lines.push(`Contact envoyé au service de notification : ${data.subject}`);
    lines.push(`Appareils enregistrés pour ton compte : ${data.subscriptions.length}${data.subscriptions.length ? ` (${data.subscriptions.map(sub => sub.host).join(', ')})` : ' -- active les notifications sur cet appareil'}`);
    if (endpointHost && data.subscriptions.length && !data.subscriptions.some(sub => sub.host === endpointHost)) {
      lines.push('⚠ Cet appareil est abonné dans le navigateur mais pas côté serveur : désactive puis réactive les notifications.');
    }
    lines.push('');
    lines.push('— Derniers envois (depuis le démarrage du serveur) —');
    if (data.recent.length === 0) lines.push('Aucun envoi pour l\'instant.');
    for (const entry of data.recent) {
      const time = new Date(entry.at).toLocaleTimeString('fr-FR');
      const outcome = entry.ok ? `accepté par ${entry.host} (${entry.status})` : `ÉCHEC ${entry.host} ${entry.status || ''} ${entry.message || ''}`.trim();
      lines.push(`${time} ${entry.kind === 'test' ? 'test' : 'commande'} → ${outcome}`);
    }
  } catch (e) {
    lines.push(`Impossible de lire le diagnostic du serveur : ${e.response?.data?.error || e.message}`);
  }
  return lines;
}
