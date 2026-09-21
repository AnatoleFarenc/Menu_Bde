// Web Push: an alert on the staff's phones/computers when an order arrives,
// delivered by the browser vendor's push service, so it reaches a device
// whose site is closed or whose screen is locked (unlike the in-page sound,
// which only works while the tab is open -- see src/lib/sound.js).
//
// Needs a VAPID key pair (`npm run vapid:generate`, then VAPID_PUBLIC_KEY /
// VAPID_PRIVATE_KEY in .env). Without them the feature is simply off: the
// server runs as before and the admin UI hides the notifications button.
import webpush from 'web-push';
import { db } from './db.js';
import { resolveRole, ROLE_RANK } from './auth42.js';

let configured = null;
let vapidSubject = null;

// The last few send attempts (per device: which push service answered, with
// which status), kept in memory only. Shown by the admin "Diagnostic" so a
// notification that never arrives can be traced to the step that failed.
const recent = [];
const remember = entry => {
  recent.unshift({ at: new Date().toISOString(), ...entry });
  recent.length = Math.min(recent.length, 10);
};
const hostOf = endpoint => {
  try { return new URL(endpoint).hostname; } catch { return '?'; }
};

function configure() {
  if (configured !== null) return configured;
  const publicKey = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  if (!publicKey || !privateKey) {
    configured = false;
    return configured;
  }
  // Push services want a way to contact the sender: a mailto: or the site's
  // https URL (Apple rejects anything else).
  const appUrl = (process.env.PUBLIC_APP_URL || '').trim();
  const subject = (process.env.VAPID_SUBJECT || '').trim()
    || (appUrl.startsWith('https://') ? appUrl : 'mailto:noreply@localhost');
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidSubject = subject;
    configured = true;
  } catch (e) {
    console.error('Web Push disabled: invalid VAPID configuration --', e.message);
    configured = false;
  }
  return configured;
}

export const isPushEnabled = () => configure();
export const getPublicKey = () => (configure() ? process.env.VAPID_PUBLIC_KEY.trim() : null);

// The server POSTs to whatever endpoint a client registers, so only the real
// push services' hosts are accepted -- never an arbitrary URL a logged-in
// account could point the server at.
const PUSH_HOSTS = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];
export function isKnownPushEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 512) return false;
  let url;
  try { url = new URL(endpoint); } catch { return false; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return false;
  return PUSH_HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

// Sends one payload to each subscription. A subscription the push service
// says is gone (404/410: app uninstalled, permission revoked, expired) is
// deleted so it isn't retried forever. `devices` reports, per device, what the
// push service answered -- 2xx only means it ACCEPTED the message for
// delivery, not that the phone has shown it yet.
async function sendTo(subscriptions, payload, kind) {
  const body = JSON.stringify(payload);
  const result = { sent: 0, removed: 0, failed: 0, devices: [] };
  await Promise.all(subscriptions.map(async sub => {
    const device = { host: hostOf(sub.endpoint), login: sub.login };
    try {
      const response = await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        { TTL: 60 * 60, urgency: 'high' }
      );
      Object.assign(device, { ok: true, status: response.statusCode });
      result.sent++;
    } catch (e) {
      const gone = e.statusCode === 404 || e.statusCode === 410;
      Object.assign(device, {
        ok: false,
        status: e.statusCode || null,
        message: gone ? 'appareil désabonné, supprimé' : String(e.body || e.message || '').slice(0, 200)
      });
      if (gone) {
        await db.deletePushSubscription(sub.endpoint);
        result.removed++;
      } else {
        console.error('Web Push send failed:', device.host, e.statusCode || '', device.message);
        result.failed++;
      }
    }
    result.devices.push(device);
    remember({ kind, ...device });
  }));
  return result;
}

const STAFF_RANK = ROLE_RANK.staff;

// Alerts every staff device about a freshly placed order. The role is
// re-checked NOW, per login: someone who lost their staff role since they
// enabled notifications stops receiving them (and their devices are dropped).
export async function notifyNewOrder(order) {
  if (!configure()) return;
  const subscriptions = await db.listPushSubscriptions();
  if (subscriptions.length === 0) {
    remember({ kind: 'order', host: '-', ok: false, message: `commande ${order.orderNumber} : aucun appareil abonné aux notifications` });
    return;
  }

  const allowed = new Set();
  for (const login of new Set(subscriptions.map(sub => sub.login))) {
    // Role lists are lowercase (see handle42Callback); a stored login may not be.
    if ((ROLE_RANK[await resolveRole(login.toLowerCase())] ?? 0) >= STAFF_RANK) allowed.add(login);
    else await db.deletePushSubscriptionsOfLogin(login);
  }

  const items = order.items || [];
  const summary = items.map(item => `${item.quantity}× ${item.name}`).join(', ');
  const result = await sendTo(subscriptions.filter(sub => allowed.has(sub.login)), {
    title: `Nouvelle commande ${order.orderNumber}`,
    body: `${order.userDisplayName || order.userLogin} · retrait ${order.pickupTime}\n${summary.length > 140 ? `${summary.slice(0, 137)}...` : summary}`,
    url: '/?tab=admin',
    tag: order.id
  }, 'order');
  console.log(`New-order push ${order.orderNumber}: ${result.sent} sent, ${result.failed} failed, ${result.removed} removed`);
}

// "Test" button: a notification to the caller's own devices only.
export async function sendTestPush(login) {
  if (!configure()) return { sent: 0, removed: 0, failed: 0, devices: [] };
  return sendTo(await db.listPushSubscriptions(login), {
    title: 'Notifications activées ✅',
    body: 'Tu recevras une alerte comme celle-ci à chaque nouvelle commande.',
    url: '/?tab=admin',
    tag: 'push-test'
  }, 'test');
}

// Everything the "Diagnostic" panel shows about the server side: is it
// configured, which devices this account has subscribed, and what happened to
// the last sends.
export async function getPushDiagnostics(login) {
  const subscriptions = await db.listPushSubscriptions(login);
  return {
    enabled: configure(),
    subject: vapidSubject,
    subscriptions: subscriptions.map(sub => ({ host: hostOf(sub.endpoint), createdAt: sub.createdAt.toISOString() })),
    recent
  };
}
