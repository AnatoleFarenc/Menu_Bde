import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import QRCode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './db.js';
import { get42AuthUrl, handle42Callback, ROLE_RANK } from './auth42.js';
import { isPushEnabled, getPublicKey, getPushError, isKnownPushEndpoint, notifyNewOrder, sendTestPush, getPushDiagnostics } from './push.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicAppUrl = (process.env.PUBLIC_APP_URL || `http://localhost:${PORT}`).trim().replace(/\/+$/, '');
const oauthRedirectUri = (process.env.INTRA42_REDIRECT_URI || `${publicAppUrl}/api/auth/42/callback`).trim();

// Behind the Caddy reverse proxy: needed so rate-limiting sees the real client IP.
app.set('trust proxy', 1);

// Security headers (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy...).
// CSP tailored for the app: self-served bundle, Google fonts, 42 avatars.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https://cdn.intra.42.fr', 'https://profile.intra.42.fr'],
      connectSrc: ["'self'"],
      formAction: ["'self'", 'https://api.intra.42.fr'],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS restricted to known origins (public domain + localhost for dev).
const allowedOrigins = new Set([
  publicAppUrl,
  'http://localhost:3000',
  'http://localhost:5001',
  'http://localhost:5002',
]);
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || allowedOrigins.has(origin)),
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// Rate limiting: broad globally, strict on authentication.
app.use('/api/', rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

// Staging mode: if STAGING_MODE=true, only the 42 logins listed in STAGING_ALLOWED_LOGINS
// can log in. On prod the variable is absent -> no effect.
const stagingMode = process.env.STAGING_MODE === 'true';
const stagingAllowedLogins = (process.env.STAGING_ALLOWED_LOGINS || '')
  .split(',')
  .map(login => login.trim().toLowerCase())
  .filter(Boolean);
const isStagingAllowed = (login) => !stagingMode || stagingAllowedLogins.includes((login || '').toLowerCase());

// ----------------------------------------------------
// SESSIONS  (random opaque token, sliding expiration)
// ----------------------------------------------------
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 h
const sessions = new Map(); // token -> { user, expiresAt, createdAt }

const createSession = (user) => {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { user, expiresAt: Date.now() + SESSION_TTL_MS, createdAt: Date.now() });
  return token;
};

const getUserFromReq = (req) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;
  const entry = sessions.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  entry.expiresAt = Date.now() + SESSION_TTL_MS; // sliding expiration
  return entry.user;
};

// Periodic cleanup of expired sessions.
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of sessions) {
    if (entry.expiresAt < now) sessions.delete(token);
  }
}, 30 * 60 * 1000).unref();

// Authorization middlewares
const requireAuth = (req, res, next) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'Non authentifié' });
  req.user = user;
  next();
};
const requireAdmin = (req, res, next) => {
  const user = getUserFromReq(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Accès réservé aux administrateurs BDE' });
  req.user = user;
  next();
};

// Separate from requireAdmin: isAdmin gates the live order-tracking board
// (used during service), isManager gates the /gestion tool (event/catalog/
// stock management). Neither implies the other -- see ADMIN_LOGINS and
// MANAGER_LOGINS in auth42.js.
const requireManager = (req, res, next) => {
  const user = getUserFromReq(req);
  if (!user || !user.isManager) return res.status(403).json({ error: 'Accès réservé aux gestionnaires BDE' });
  req.user = user;
  next();
};

const requireAdminOrManager = (req, res, next) => {
  const user = getUserFromReq(req);
  if (!user || (!user.isAdmin && !user.isManager)) return res.status(403).json({ error: 'Accès réservé aux administrateurs ou gestionnaires BDE' });
  req.user = user;
  next();
};

// Top of the role hierarchy (see ROLE_RANK in auth42.js): gates the team
// screen where roles are assigned, so only a Board member can grant
// admin/manager access to someone else.
const requireBoard = (req, res, next) => {
  const user = getUserFromReq(req);
  if (!user || !user.isBoard) return res.status(403).json({ error: 'Accès réservé au bureau BDE' });
  req.user = user;
  next();
};

// Anti-CSRF state for the 42 OAuth flow (state param), single-use short-lived tokens.
const oauthStates = new Map(); // state -> expiresAt
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const issueOauthState = () => {
  const state = crypto.randomBytes(16).toString('base64url');
  oauthStates.set(state, Date.now() + OAUTH_STATE_TTL_MS);
  return state;
};
const consumeOauthState = (state) => {
  const expiresAt = oauthStates.get(state);
  if (!expiresAt) return false;
  oauthStates.delete(state);
  return expiresAt >= Date.now();
};
setInterval(() => {
  const now = Date.now();
  for (const [state, exp] of oauthStates) {
    if (exp < now) oauthStates.delete(state);
  }
}, 5 * 60 * 1000).unref();

// db.js uses Prisma: every route touching the database is asynchronous. This
// wrapper avoids repeating try/catch everywhere and forwards any error to the
// global error middleware defined at the bottom of this file.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ----------------------------------------------------
// AUTH ROUTES (42 OAuth2)
// ----------------------------------------------------
app.get('/api/auth/42/url', authLimiter, (req, res) => {
  try {
    res.json({ url: get42AuthUrl(issueOauthState()) });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.get('/api/auth/42/callback', authLimiter, async (req, res) => {
  const { code, state } = req.query;
  try {
    if (!consumeOauthState(state)) {
      return res.redirect(`${publicAppUrl}/?error=${encodeURIComponent('Requête OAuth invalide ou expirée, réessaie.')}`);
    }
    const user = await handle42Callback(code);
    if (!isStagingAllowed(user.login)) {
      return res.redirect(`${publicAppUrl}/?error=${encodeURIComponent('Accès réservé aux testeurs sur cet environnement de développement.')}`);
    }
    await db.upsertUser({ login: user.login, displayName: user.displayName, email: user.email });
    const token = createSession(user);
    res.redirect(`${publicAppUrl}/?token=${token}`);
  } catch (error) {
    console.error('42 Auth error:', error.message);
    res.redirect(`${publicAppUrl}/?error=${encodeURIComponent(error.message)}`);
  }
});

app.get('/api/auth/me', requireAuth, ah(async (req, res) => {
  const cguStatus = req.user.role === 'kiosk_guest' ? null : await db.getCguStatus(req.user.login);
  res.json({ user: req.user, cguStatus });
}));

// ----------------------------------------------------
// LEGAL / RGPD
// ----------------------------------------------------

// Public: no auth, read only the latest published version of a document.
app.get('/api/legal/:kind', ah(async (req, res) => {
  const document = await db.getLatestLegalDocument(req.params.kind);
  if (!document) return res.status(404).json({ error: 'Document non publié' });
  res.json({
    document: { id: document.id, kind: document.kind, version: document.version, title: document.title, content: document.content, publishedAt: document.publishedAt }
  });
}));

app.post('/api/account/accept-cgu', requireAuth, ah(async (req, res) => {
  if (req.user.role === 'kiosk_guest') return res.status(403).json({ error: 'Sans objet pour une session borne' });
  const document = await db.getLatestLegalDocument('cgu');
  if (!document) return res.status(404).json({ error: 'Aucune CGU publiée' });
  await db.acceptCgu(req.user.login, document.id, document.version);
  res.json({ success: true });
}));

// Right-to-erasure, self-service and immediate: see db.deleteUserAccount for
// what's anonymized (past orders, for the BDE's own stats/accounting) vs.
// hard-deleted (everything else that identifies the person).
app.delete('/api/account', requireAuth, ah(async (req, res) => {
  if (req.user.role === 'kiosk_guest') return res.status(403).json({ error: 'Sans objet pour une session borne' });
  await db.deleteUserAccount(req.user.login);
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token) sessions.delete(token);
  res.json({ success: true });
}));

app.get('/api/admin/legal/:kind/versions', requireBoard, ah(async (req, res) => {
  const versions = await db.listLegalDocumentVersions(req.params.kind);
  res.json({ versions });
}));

app.post('/api/admin/legal/:kind', requireBoard, ah(async (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Titre et contenu requis' });
  const document = await db.publishLegalDocument(req.params.kind, title, content, req.user.login);
  res.json({ document });
}));

app.get('/api/admin/legal/cgu/acceptance-stats', requireBoard, ah(async (req, res) => {
  res.json(await db.getCguAcceptanceStats());
}));

app.get('/api/admin/legal/cgu/acceptances', requireBoard, ah(async (req, res) => {
  res.json({ acceptances: await db.listCguAcceptances() });
}));

// The kiosk activation code: forced by KIOSK_SECRET in .env when set (an
// explicit override, same convention as VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY
// in push.js), otherwise auto-generated on first use and kept in the
// AppSetting table -- so it works out of the box, and a Board member can
// view/regenerate it from Gestion > Équipe (see the requireBoard routes
// below) without touching the server's filesystem.
// A 6-digit PIN (not a long random string): easy to read off a screen and
// type on a kiosk touchscreen. Brute-forcing 10^6 combinations is
// impractical against authLimiter (30 attempts/15 min/IP) -- and even a
// successful guess only lets someone place orders, never read anyone's
// history; a Board member can lock the terminal or regenerate the PIN
// (also revoking every activated kiosk) at any time from Gestion > Équipe.
const KIOSK_SECRET_SETTING_KEY = 'kiosk_secret';
const generateKioskSecret = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const getKioskSecretInfo = async () => {
  if (process.env.KIOSK_SECRET) return { secret: process.env.KIOSK_SECRET, source: 'env' };
  let secret = await db.getSetting(KIOSK_SECRET_SETTING_KEY);
  if (!secret) secret = await db.setSettingIfAbsent(KIOSK_SECRET_SETTING_KEY, generateKioskSecret());
  return { secret, source: 'db' };
};

// Activates a kiosk (shared order terminal): a device-level session backed
// by one shared secret, never a real account. This session carries NO
// identity at all -- it can place orders but (see GET /api/orders and the
// review route below) can never read or claim anyone's personal history.
// The kiosk ITSELF also never goes through 42 OAuth (see the pairing
// endpoints further down): only the customer's own phone does, so there is
// never a real account session sitting on the shared terminal that nobody
// can force-log-out of.
// Not gated by stagingMode: unlike the old kiosk-login (any typed 42 login,
// no verification), this can no longer bypass the STAGING_ALLOWED_LOGINS
// whitelist -- the pairing flow's identity step is real 42 OAuth, which
// still goes through isStagingAllowed() below, and a guest order carries no
// identity at all.
app.post('/api/auth/kiosk-login', authLimiter, ah(async (req, res) => {
  const { secret: kioskSecret } = await getKioskSecretInfo();
  const provided = String(req.body.secret || '');
  const expected = Buffer.from(kioskSecret);
  const given = Buffer.from(provided);
  const matches = given.length === expected.length && crypto.timingSafeEqual(given, expected);
  if (!matches) {
    return res.status(401).json({ error: 'Code borne invalide' });
  }
  const user = {
    id: 'kiosk_' + crypto.randomBytes(8).toString('hex'),
    login: null,
    displayName: 'Borne',
    avatarUrl: '',
    campus: 'Borne',
    isAdmin: false,
    isManager: false,
    isBoard: false,
    role: 'kiosk_guest'
  };
  const token = createSession(user);
  res.json({ token, user });
}));

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token) sessions.delete(token);
  res.json({ success: true });
});

// ----------------------------------------------------
// KIOSK PAIRING -- lets a customer attach the order they're about to place
// at a kiosk to their OWN 42 account, WITHOUT the kiosk ever going through
// 42 OAuth itself (a shared terminal can't reliably force-log-out an
// account, so it must never hold one). Flow:
//   1. Kiosk (its own device session) creates a pairing -> a short code
//      shown as a QR code (?pair=<code>).
//   2. Customer scans it on their OWN phone, in their OWN browser, and logs
//      in normally with 42 OAuth there.
//   3. Their phone (now holding a real, ordinary session) calls
//      .../confirm -- this is the only place a real identity ever touches
//      the pairing.
//   4. The kiosk, polling for the result, receives a one-shot
//      `attributionToken` -- NOT the phone's session token, just enough to
//      attribute the next order it places to that account server-side.
// Everything here is in-memory and short-lived, same pattern as `sessions`
// and `oauthStates` above.
// ----------------------------------------------------
const KIOSK_PAIRING_TTL_MS = 5 * 60 * 1000;
const PAIRING_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
const kioskPairings = new Map(); // code -> { status, userId, userLogin, userDisplayName, attributionToken, expiresAt }
const kioskAttributions = new Map(); // attributionToken -> { userId, userLogin, userDisplayName, expiresAt }

const generatePairingCode = () => Array.from({ length: 8 }, () => PAIRING_CODE_ALPHABET[crypto.randomInt(PAIRING_CODE_ALPHABET.length)]).join('');

setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of kioskPairings) if (entry.expiresAt < now) kioskPairings.delete(code);
  for (const [token, entry] of kioskAttributions) if (entry.expiresAt < now) kioskAttributions.delete(token);
}, 60 * 1000).unref();

const requireKiosk = (req, res, next) => {
  const user = getUserFromReq(req);
  if (!user || user.role !== 'kiosk_guest') return res.status(403).json({ error: 'Réservé au mode borne' });
  req.user = user;
  next();
};

// The kiosk requests a fresh pairing right before showing its "Se connecter"
// screen.
app.post('/api/kiosk/pairing', requireKiosk, ah(async (req, res) => {
  const code = generatePairingCode();
  const expiresAt = Date.now() + KIOSK_PAIRING_TTL_MS;
  kioskPairings.set(code, { status: 'pending', expiresAt });
  const pairUrl = `${publicAppUrl}/?pair=${code}`;
  const qrDataUrl = await QRCode.toDataURL(pairUrl, { margin: 1, width: 280 });
  res.status(201).json({ code, qrDataUrl, expiresAt: new Date(expiresAt).toISOString() });
}));

// The kiosk polls this while showing the QR code.
app.get('/api/kiosk/pairing/:code', requireKiosk, (req, res) => {
  const entry = kioskPairings.get(req.params.code);
  if (!entry || entry.expiresAt < Date.now()) return res.status(404).json({ status: 'expired' });
  if (entry.status === 'confirmed') {
    return res.json({ status: 'confirmed', displayName: entry.userDisplayName, attributionToken: entry.attributionToken });
  }
  res.json({ status: 'pending' });
});

// The CUSTOMER'S OWN PHONE calls this, authenticated with their own real 42
// session (never the kiosk's) -- the only step where an identity is
// attached to the pairing.
app.post('/api/kiosk/pairing/:code/confirm', authLimiter, (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'Connexion 42 requise' });
  if (user.role === 'kiosk_guest') return res.status(403).json({ error: 'Utilise ton propre compte, pas celui de la borne.' });
  const entry = kioskPairings.get(req.params.code);
  if (!entry || entry.expiresAt < Date.now()) return res.status(404).json({ error: 'Ce code a expiré, redemande un QR code à la borne.' });
  if (entry.status === 'confirmed') return res.status(409).json({ error: 'Ce code a déjà été utilisé.' });
  const attributionToken = crypto.randomBytes(24).toString('base64url');
  entry.status = 'confirmed';
  entry.userId = user.id;
  entry.userLogin = user.login;
  entry.userDisplayName = user.displayName;
  entry.attributionToken = attributionToken;
  kioskAttributions.set(attributionToken, { userId: user.id, userLogin: user.login, userDisplayName: user.displayName, expiresAt: entry.expiresAt });
  res.json({ success: true });
});

// ----------------------------------------------------
// PRODUCT & MENU ROUTES (Storefront)
// ----------------------------------------------------
app.get('/api/products', ah(async (req, res) => {
  const [products, menus, categories, activeStorefront] = await Promise.all([
    db.getPublicProducts(),
    db.getPublicMenus(),
    db.getCategories(),
    db.getActiveStorefront()
  ]);
  const orderWindow = { start: activeStorefront.orderWindowStart, end: activeStorefront.orderWindowEnd };
  res.json({ products, menus, categories, orderWindow });
}));

// The single storefront currently live for students -- used by the
// (warm-themed) kitchen/order-tracking board, which always follows whatever
// is active rather than letting staff browse other events while on shift.
// Live order tracking (site-themed "Admin" tab): gated by requireAdmin.
app.get('/api/admin/active-storefront', requireAdmin, ah(async (req, res) => {
  res.json({ storefront: await db.getActiveStorefront() });
}));

// NEW-ORDER ALERTS (Web Push, see push.js). Per device: a staff member turns
// them on from the kitchen board, which subscribes that browser/app here.
app.get('/api/admin/push/config', requireAdmin, ah(async (req, res) => {
  res.json({ enabled: await isPushEnabled(), publicKey: await getPublicKey(), error: getPushError() });
}));

app.post('/api/admin/push/subscribe', requireAdmin, ah(async (req, res) => {
  if (!(await isPushEnabled())) return res.status(503).json({ error: `Notifications indisponibles côté serveur : ${getPushError() || 'configuration manquante'}` });
  const sub = req.body.subscription;
  if (!sub || !isKnownPushEndpoint(sub.endpoint) || typeof sub.keys?.p256dh !== 'string' || typeof sub.keys?.auth !== 'string'
    || sub.keys.p256dh.length > 191 || sub.keys.auth.length > 191) {
    return res.status(400).json({ error: 'Abonnement de notification invalide' });
  }
  await db.savePushSubscription(req.user.login.toLowerCase(), { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth });
  res.json({ success: true });
}));

app.post('/api/admin/push/unsubscribe', requireAdmin, ah(async (req, res) => {
  if (typeof req.body.endpoint === 'string') await db.deletePushSubscription(req.body.endpoint);
  res.json({ success: true });
}));

// Sends a test alert to the caller's own devices; the answer says, per device,
// what the push service replied (so a failure is explained, not just reported).
app.post('/api/admin/push/test', requireAdmin, ah(async (req, res) => {
  const result = await sendTestPush(req.user.login.toLowerCase());
  if (result.devices.length === 0) {
    return res.status(400).json({ error: 'Aucun appareil de ce compte n\'est enregistré côté serveur -- active les notifications sur cet appareil (bouton « Notifications »).' });
  }
  res.json(result);
}));

// Server side of the "Diagnostic" panel.
app.get('/api/admin/push/diagnostics', requireAdmin, ah(async (req, res) => {
  res.json(await getPushDiagnostics(req.user.login.toLowerCase()));
}));

// Everything below, up to the ORDERS section, belongs to the /gestion tool:
// gated by requireManager, a role distinct from requireAdmin (see auth42.js).
app.get('/api/admin/events', requireManager, ah(async (req, res) => {
  res.json({ events: await db.getEvents() });
}));

app.post('/api/admin/events', requireManager, ah(async (req, res) => {
  if (!req.body.name?.trim()) return res.status(400).json({ error: 'Le nom de l\'événement est obligatoire' });
  res.status(201).json({ event: await db.createEvent(req.body) });
}));

app.patch('/api/admin/events/:id', requireManager, ah(async (req, res) => {
  const updated = await db.updateEvent(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Événement introuvable' });
  res.json({ event: updated });
}));

app.delete('/api/admin/events/:id', requireManager, ah(async (req, res) => {
  if (!(await db.deleteEvent(req.params.id))) {
    return res.status(400).json({ error: 'Événement avec une vitrine active ou encore lié à des commandes : impossible à supprimer' });
  }
  res.json({ success: true });
}));

// STOREFRONTS -- an event can hold several (e.g. "Petit-déjeuner" and
// "Déjeuner"), each with its own catalog and orders. Exactly one storefront
// across the whole app is live for students at a time.
app.get('/api/admin/events/:id/storefronts', requireManager, ah(async (req, res) => {
  res.json({ storefronts: await db.getStorefronts(req.params.id) });
}));

app.post('/api/admin/events/:id/storefronts', requireManager, ah(async (req, res) => {
  if (!req.body.name?.trim()) return res.status(400).json({ error: 'Le nom de la vitrine est obligatoire' });
  const storefront = await db.createStorefront(req.params.id, req.body);
  res.status(201).json({ storefront });
}));

app.patch('/api/admin/storefronts/:id', requireManager, ah(async (req, res) => {
  const updated = await db.updateStorefront(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Vitrine introuvable' });
  res.json({ storefront: updated });
}));

app.post('/api/admin/storefronts/:id/duplicate', requireManager, ah(async (req, res) => {
  if (!req.body.name?.trim()) return res.status(400).json({ error: 'Le nom de la nouvelle vitrine est obligatoire' });
  const storefront = await db.duplicateStorefront(req.params.id, req.body.name);
  if (!storefront) return res.status(404).json({ error: 'Vitrine introuvable' });
  res.status(201).json({ storefront });
}));

app.post('/api/admin/storefronts/:id/activate', requireManager, ah(async (req, res) => {
  const storefront = await db.setActiveStorefront(req.params.id);
  if (!storefront) return res.status(404).json({ error: 'Vitrine introuvable' });
  res.json({ storefront });
}));

app.delete('/api/admin/storefronts/:id', requireManager, ah(async (req, res) => {
  if (!(await db.deleteStorefront(req.params.id))) {
    return res.status(400).json({ error: 'Vitrine active, dernière de son événement, ou encore liée à des commandes : impossible à supprimer' });
  }
  res.json({ success: true });
}));

// Full catalog (products + meal deals + categories) of one specific
// storefront -- read by the /gestion catalog page AND by the live order
// board's "offer a product" picker, so either role can read it.
app.get('/api/admin/storefronts/:id/catalog', requireAdminOrManager, ah(async (req, res) => {
  const [products, menus, categories] = await Promise.all([
    db.getProducts(req.params.id),
    db.getMenus(req.params.id),
    db.getCategories()
  ]);
  res.json({ products, menus, categories });
}));

// Shopping/resource list of one storefront -- what was bought to run it, so
// another team can rebuild it later.
app.get('/api/admin/storefronts/:id/shopping-list', requireManager, ah(async (req, res) => {
  res.json({ items: await db.getShoppingList(req.params.id) });
}));

app.post('/api/admin/storefronts/:id/shopping-list', requireManager, ah(async (req, res) => {
  if (!req.body.name?.trim()) return res.status(400).json({ error: 'Le nom de l\'article est obligatoire' });
  const item = await db.addShoppingListItem(req.params.id, req.body);
  res.status(201).json({ item });
}));

// Preview of what generate (below) would add: every StockItem (raw
// ingredient, not a catalog product) at or below its own low-stock
// threshold. Global, not storefront-scoped -- see the StockItem model.
app.get('/api/admin/storefronts/:id/restock-candidates', requireManager, ah(async (req, res) => {
  res.json({ items: await db.getRestockCandidates() });
}));

// Pre-fills this storefront's shopping list with a restock suggestion for
// every low/out-of-stock ingredient.
app.post('/api/admin/storefronts/:id/shopping-list/generate', requireManager, ah(async (req, res) => {
  const result = await db.generateShoppingList(req.params.id);
  res.json(result);
}));

// STOCK ITEMS -- every physical thing the BDE keeps a count of (recipe
// ingredients and products sold as-is alike), global: not tied to one
// storefront's catalog. A change that leaves something low also puts it on
// a shopping list -- the one of `?storefrontId=` (the storefront the admin
// is working on), else the active storefront's.
const stockStorefrontId = req => (typeof req.query.storefrontId === 'string' ? req.query.storefrontId : undefined);

app.get('/api/admin/stock-items', requireManager, ah(async (req, res) => {
  res.json({ items: await db.getStockItems() });
}));

app.post('/api/admin/stock-items', requireManager, ah(async (req, res) => {
  if (!req.body.name?.trim()) return res.status(400).json({ error: 'Le nom de l\'article est obligatoire' });
  const item = await db.addStockItem(req.body, stockStorefrontId(req));
  if (!item) return res.status(400).json({ error: 'Un article avec ce nom existe déjà' });
  res.status(201).json({ item });
}));

app.put('/api/admin/stock-items/:id', requireManager, ah(async (req, res) => {
  const result = await db.updateStockItem(req.params.id, req.body, stockStorefrontId(req));
  if (result.error === 'not_found') return res.status(404).json({ error: 'Article introuvable' });
  if (result.error === 'duplicate') return res.status(400).json({ error: 'Un article avec ce nom existe déjà' });
  res.json({ item: result.item });
}));

app.delete('/api/admin/stock-items/:id', requireManager, ah(async (req, res) => {
  const result = await db.deleteStockItem(req.params.id);
  if (result.error === 'not_found') return res.status(404).json({ error: 'Article introuvable' });
  if (result.error === 'in_use') {
    return res.status(400).json({ error: `Encore utilisé par : ${result.usedBy.join(', ')} -- retire-le de ces produits d'abord` });
  }
  res.json({ success: true });
}));

app.put('/api/admin/shopping-list/:id', requireManager, ah(async (req, res) => {
  const updated = await db.updateShoppingListItem(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Article introuvable' });
  res.json({ item: updated });
}));

app.delete('/api/admin/shopping-list/:id', requireManager, ah(async (req, res) => {
  await db.deleteShoppingListItem(req.params.id);
  res.json({ success: true });
}));

// Closes the storefront's current shopping trip (Courses tab): freezes it
// into history, the next item added opens a fresh one.
app.post('/api/admin/storefronts/:id/shopping-list/close', requireManager, ah(async (req, res) => {
  const trip = await db.closeShoppingTrip(req.params.id);
  if (!trip) return res.status(400).json({ error: 'Aucune liste en cours pour cette vitrine' });
  res.json({ trip });
}));

app.get('/api/admin/storefronts/:id/shopping-list/history', requireManager, ah(async (req, res) => {
  res.json({ trips: await db.getShoppingTripHistory(req.params.id) });
}));

app.post('/api/admin/categories', requireManager, ah(async (req, res) => {
  if (!req.body.name?.trim()) return res.status(400).json({ error: 'Le nom de la catégorie est obligatoire' });
  const category = await db.addCategory(req.body);
  if (!category) return res.status(409).json({ error: 'Cette catégorie existe déjà' });
  res.status(201).json({ category, categories: await db.getCategories() });
}));

app.delete('/api/admin/categories/:id', requireManager, ah(async (req, res) => {
  if (!(await db.deleteCategory(req.params.id))) {
    return res.status(400).json({ error: 'Catégorie par défaut ou encore utilisée par des produits : impossible à supprimer' });
  }
  res.json({ categories: await db.getCategories() });
}));

app.patch('/api/admin/categories/:id/visibility', requireManager, ah(async (req, res) => {
  const category = await db.toggleCategoryVisibility(req.params.id);
  if (!category) return res.status(404).json({ error: 'Catégorie introuvable' });
  res.json({ category, categories: await db.getCategories() });
}));

// Admin product routes
app.post('/api/admin/products', requireManager, ah(async (req, res) => {
  if (!req.body.storefrontId) return res.status(400).json({ error: 'storefrontId manquant' });
  const newProduct = await db.addProduct(req.body, req.body.storefrontId);
  res.status(201).json({ product: newProduct });
}));

app.put('/api/admin/products/:id', requireManager, ah(async (req, res) => {
  const updated = await db.updateProduct(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Produit non trouvé' });
  res.json({ product: updated });
}));

app.delete('/api/admin/products/:id', requireManager, ah(async (req, res) => {
  await db.deleteProduct(req.params.id);
  res.json({ success: true });
}));

app.patch('/api/admin/products/:id/toggle-stock', requireManager, ah(async (req, res) => {
  const updated = await db.toggleProductStock(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Produit non trouvé' });
  res.json({ product: updated });
}));

// Admin menu routes
app.post('/api/admin/menus', requireManager, ah(async (req, res) => {
  if (!req.body.storefrontId) return res.status(400).json({ error: 'storefrontId manquant' });
  const newMenu = await db.addMenu(req.body, req.body.storefrontId);
  res.status(201).json({ menu: newMenu });
}));

app.put('/api/admin/menus/:id', requireManager, ah(async (req, res) => {
  const updated = await db.updateMenu(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Menu non trouvé' });
  res.json({ menu: updated });
}));

app.delete('/api/admin/menus/:id', requireManager, ah(async (req, res) => {
  await db.deleteMenu(req.params.id);
  res.json({ success: true });
}));

app.patch('/api/admin/menus/:id/toggle-stock', requireManager, ah(async (req, res) => {
  const updated = await db.toggleMenuStock(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Menu non trouvé' });
  res.json({ menu: updated });
}));

// ----------------------------------------------------
// ORDERS & KITCHEN DASHBOARD
// ----------------------------------------------------
app.post('/api/orders', ah(async (req, res) => {
  const user = getUserFromReq(req);
  const { items, pickupTime, note } = req.body;

  if (!user) {
    return res.status(401).json({ error: 'Connexion 42 requise pour commander' });
  }

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Panier vide' });
  }

  const unavailable = await db.getUnavailableCartItems(items);
  if (unavailable.length > 0) {
    return res.status(409).json({ error: `Commande impossible -- ${unavailable.join(' ; ')}. Retire-le de ton panier.` });
  }

  // Price/totalPrice are NEVER taken from req.body: only product/menu ids
  // and quantities are trusted from the client, the money is always
  // re-derived from the live catalog (see db.priceCartItems).
  const activeStorefront = await db.getActiveStorefront();
  const { items: pricedItems, totalPrice } = await db.priceCartItems(items, activeStorefront.id);
  if (pricedItems.length === 0) {
    return res.status(400).json({ error: 'Panier invalide' });
  }

  // Same posture as the price above: the chosen pickup time is re-validated
  // server-side against the storefront's own order window and the current
  // time, never trusted as-is.
  const pickupTimeError = db.validatePickupTime(activeStorefront, pickupTime);
  if (pickupTimeError) {
    return res.status(400).json({ error: pickupTimeError });
  }

  const isKiosk = user.role === 'kiosk_guest';

  // If the customer paired their phone before ordering (see the kiosk
  // pairing endpoints above), this single-use token proves -- server-side,
  // via that phone's own real 42 login -- which account the order belongs
  // to. Without one (guest checkout), the order stays kiosk-anonymous
  // forever: it is never attributed to anyone after the fact.
  let attribution = null;
  if (isKiosk && req.body.attributionToken) {
    attribution = kioskAttributions.get(String(req.body.attributionToken));
    if (attribution) kioskAttributions.delete(req.body.attributionToken); // single-use
  }

  // Cosmetic only, for the kitchen ticket -- never used for identity/auth.
  const customerLabel = String(req.body.customerLabel || '').trim().slice(0, 60) || 'Commande borne';

  const newOrder = await db.addOrder({
    storefrontId: activeStorefront.id,
    userId: attribution ? attribution.userId : user.id,
    // Same convention as the admin "free/gift order" path when there's no
    // real account attached: both fields hold the human-readable label.
    userLogin: attribution ? attribution.userLogin : (isKiosk ? customerLabel : user.login),
    userDisplayName: attribution ? attribution.userDisplayName : (isKiosk ? customerLabel : user.displayName),
    items: pricedItems,
    pickupTime,
    note: note || '',
    totalPrice,
    isKioskOrder: isKiosk
  });

  // Alert the staff devices -- after the response is ready, and never able to
  // fail the order: it is already saved.
  notifyNewOrder(newOrder).catch(err => console.error('New-order push failed:', err));

  res.status(201).json({ order: newOrder });
}));

// Order created by an admin for a gifted product (price 0, outside the student cart).
app.post('/api/admin/orders/free', requireAdmin, ah(async (req, res) => {
  const { productId, quantity, beneficiary, pickupTime, note } = req.body;
  const product = await db.getProductById(productId);
  if (!product) {
    return res.status(404).json({ error: 'Produit introuvable' });
  }
  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  const label = (beneficiary || '').trim() || 'Don BDE';

  const newOrder = await db.addOrder({
    storefrontId: req.body.storefrontId,
    userId: 'free_' + Date.now(),
    userLogin: label,
    userDisplayName: label,
    items: [{ ...product, quantity: qty, type: 'product' }],
    pickupTime: pickupTime || '12h00',
    note: note || '',
    totalPrice: 0,
    isFree: true
  });

  res.status(201).json({ order: newOrder });
}));

// Get user orders. Matches on `userId` ONLY -- a real 42-verified id, never
// the free-text `userLogin` a kiosk session used to be able to fake (see
// SECURITY.md). The kiosk role itself is refused outright: it has no
// account and must never read anyone's order history, including its own
// just-placed (still-unlinked) orders.
app.get('/api/orders', ah(async (req, res) => {
  const user = getUserFromReq(req);
  if (!user) {
    return res.json({ orders: [] });
  }
  if (user.role === 'kiosk_guest') {
    return res.status(403).json({ error: 'Le mode borne n\'a pas accès à l\'historique des commandes.' });
  }
  const allOrders = await db.getOrders();
  const userOrders = allOrders.filter(o => o.userId === String(user.id));
  res.json({ orders: userOrders });
}));

// The student leaves (or edits) a review on one of their picked-up orders.
app.post('/api/orders/:id/review', ah(async (req, res) => {
  const user = getUserFromReq(req);
  if (!user) {
    return res.status(401).json({ error: 'Connexion 42 requise' });
  }
  if (user.role === 'kiosk_guest') {
    return res.status(403).json({ error: 'Le mode borne ne peut pas laisser d\'avis.' });
  }
  const rating = parseInt(req.body.rating, 10);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'La note doit être comprise entre 1 et 5' });
  }
  const result = await db.setOrderReview(req.params.id, user.id, { rating, comment: req.body.comment });
  if (result.error === 'not_found') return res.status(404).json({ error: 'Commande introuvable' });
  if (result.error === 'forbidden') return res.status(403).json({ error: 'Cette commande ne t\'appartient pas' });
  if (result.error === 'not_completed') return res.status(400).json({ error: 'L\'avis n\'est possible que sur une commande récupérée' });
  res.json({ order: result.order });
}));

// Get all orders for Admin / Kitchen Board with synthesis computation, scoped
// to whichever event is currently open in the admin.
app.get('/api/admin/orders', requireAdmin, ah(async (req, res) => {
  const orders = await db.getOrders(req.query.storefrontId);

  // Compute kitchen synthesis per pickup time and product count
  const synthesisByTime = {};
  orders.forEach(order => {
    if (order.status === 'cancelled' || order.status === 'completed') return;
    const slot = order.pickupTime || '12h00';
    if (!synthesisByTime[slot]) {
      synthesisByTime[slot] = { totalOrders: 0, itemsCount: {} };
    }
    synthesisByTime[slot].totalOrders += 1;

    order.items.forEach(item => {
      // Direct products or elements inside a meal deal
      if (item.type === 'menu' && item.choices) {
        getChosenProducts(item).forEach(chosenProduct => {
          if (chosenProduct.name) {
            const key = `${chosenProduct.name} (dans ${item.name})`;
            synthesisByTime[slot].itemsCount[key] = (synthesisByTime[slot].itemsCount[key] || 0) + item.quantity;
          }
        });
      } else if (item.name) {
        const key = item.name;
        synthesisByTime[slot].itemsCount[key] = (synthesisByTime[slot].itemsCount[key] || 0) + item.quantity;
      }
    });
  });

  res.json({ orders, synthesisByTime });
}));

app.patch('/api/admin/orders/:id', requireAdmin, ah(async (req, res) => {
  const { items, pickupTime, note, totalPrice } = req.body;
  if (items && items.length === 0) {
    return res.status(400).json({ error: 'Une commande doit contenir au moins un article' });
  }
  const updated = await db.updateOrder(req.params.id, { items, pickupTime, note, totalPrice });
  if (!updated) return res.status(404).json({ error: 'Commande introuvable' });
  res.json({ order: updated });
}));

app.patch('/api/admin/orders/:id/status', requireAdmin, ah(async (req, res) => {
  const { status } = req.body;
  const allowedStatuses = ['pending', 'preparing', 'ready', 'completed', 'cancelled'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Statut de commande invalide' });
  }
  const updatedOrder = await db.updateOrderStatus(req.params.id, status);
  if (!updatedOrder) {
    return res.status(404).json({ error: 'Commande introuvable' });
  }
  res.json({ order: updatedOrder });
}));

app.patch('/api/admin/orders/:id/paid', requireAdmin, ah(async (req, res) => {
  const updatedOrder = await db.setOrderPaid(req.params.id, !!req.body.isPaid);
  if (!updatedOrder) return res.status(404).json({ error: 'Commande introuvable' });
  res.json({ order: updatedOrder });
}));

app.delete('/api/admin/orders', requireAdmin, ah(async (req, res) => {
  await db.clearOrders(req.query.storefrontId);
  res.json({ success: true });
}));

app.delete('/api/admin/orders/:id', requireAdmin, ah(async (req, res) => {
  const deleted = await db.deleteOrder(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Commande introuvable' });
  res.json({ success: true });
}));

// All customer reviews left on orders, most recent first (scoped to one event).
app.get('/api/admin/reviews', requireManager, ah(async (req, res) => {
  const orders = await db.getOrders(req.query.storefrontId);
  const reviews = orders
    .filter(order => order.review)
    .map(order => ({
      orderId: order.id,
      orderNumber: order.orderNumber,
      userLogin: order.userLogin,
      userDisplayName: order.userDisplayName,
      review: order.review
    }))
    .sort((a, b) => new Date(b.review.createdAt) - new Date(a.review.createdAt));
  res.json({ reviews });
}));

app.delete('/api/admin/reviews/:orderId', requireManager, ah(async (req, res) => {
  const deleted = await db.deleteReview(req.params.orderId);
  if (!deleted) return res.status(404).json({ error: 'Avis introuvable' });
  res.json({ success: true });
}));

// A meal-deal order item's `choices` is either an array of {product, ...}
// entries or (older orders) a plain object keyed by group name -- either
// way, the products actually chosen within it. Shared by every route that
// needs to break a meal deal down into its components.
const getChosenProducts = (item) => {
  if (!item.choices) return [];
  const entries = Array.isArray(item.choices) ? item.choices : Object.values(item.choices);
  return entries.map(entry => entry && entry.product).filter(Boolean);
};

// Cost of a line: for a product it's its costPrice; for a meal deal it's the
// sum of the costPrice of the products chosen within it. Missing/null
// costPrice => 0 (unknown). Shared by every report-shaped route below.
const itemUnitCost = (item) => {
  if (item.type === 'menu' && item.choices) {
    return getChosenProducts(item).reduce((sum, p) => sum + (p.costPrice ? p.costPrice : 0), 0);
  }
  return item.costPrice || 0;
};

// Sales report over [from, to] computed from an already-fetched order list --
// shared between the single-storefront route and the per-event route, which
// sources orders across every storefront of an event instead of just one.
function computeReport(orders, from, to) {
  const periodOrders = orders.filter(order => {
    if (order.status !== 'completed') return false;
    const day = (order.createdAt || '').slice(0, 10);
    return day >= from && day <= to;
  });

  const productsMap = new Map();
  let totalRevenue = 0;
  let totalCost = 0;

  // "Real consumption" count: also breaks down products chosen within meal deals,
  // to know how many times each product was taken in total (alone or via a meal deal).
  const usageMap = new Map();
  const addUsage = (name, qty) => {
    if (!name) return;
    usageMap.set(name, (usageMap.get(name) || 0) + qty);
  };

  periodOrders.forEach(order => {
    totalRevenue += order.isFree ? 0 : (order.totalPrice || 0);
    order.items.forEach(item => {
      const unitPrice = order.isFree ? 0 : (item.price || 0);
      const unitCost = itemUnitCost(item);
      totalCost += unitCost * item.quantity;
      const existing = productsMap.get(item.name) || { name: item.name, quantity: 0, unitPrice, unitCost, totalPrice: 0, totalCost: 0 };
      existing.quantity += item.quantity;
      existing.totalPrice += unitPrice * item.quantity;
      existing.totalCost += unitCost * item.quantity;
      productsMap.set(item.name, existing);

      if (item.type === 'menu' && item.choices) {
        getChosenProducts(item).forEach(chosenProduct => {
          if (chosenProduct.name) addUsage(chosenProduct.name, item.quantity);
        });
      } else if (item.name) {
        addUsage(item.name, item.quantity);
      }
    });
  });

  const products = Array.from(productsMap.values())
    .map(p => ({ ...p, margin: p.totalPrice - p.totalCost }))
    .sort((a, b) => b.quantity - a.quantity);

  return {
    from,
    to,
    totalOrders: periodOrders.length,
    totalRevenue,
    totalCost,
    totalProfit: totalRevenue - totalCost,
    products,
    productUsage: Array.from(usageMap.entries())
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
  };
}

// Sales report over a period (?from=YYYY-MM-DD&to=YYYY-MM-DD, defaults to today
// for both). Only counts picked-up orders (completed); gifted orders (isFree)
// count toward quantity but not revenue.
app.get('/api/admin/report', requireManager, ah(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const from = (req.query.from || req.query.date || today).slice(0, 10);
  const to = (req.query.to || from).slice(0, 10);
  const allOrders = await db.getOrders(req.query.storefrontId);
  res.json(computeReport(allOrders, from, to));
}));

// Same report, but aggregated across every storefront of one event -- used
// by the Historique tab, which shows one bilan per event regardless of how
// many storefronts it held. Also carries the event's catalog size, for the
// tab's "Produits" stat.
app.get('/api/admin/events/:id/report', requireManager, ah(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  // Unlike /api/admin/report (a live, single-storefront daily view), this is
  // a finished event's full summary -- defaulting to "today" would show
  // nothing at all for a past event, so the default range spans everything.
  const from = (req.query.from || '2000-01-01').slice(0, 10);
  const to = (req.query.to || today).slice(0, 10);
  const [allOrders, productCount] = await Promise.all([
    db.getEventOrders(req.params.id),
    db.getEventProductCount(req.params.id)
  ]);
  res.json({ ...computeReport(allOrders, from, to), productCount });
}));

// The union of every storefront's shopping list for one event -- what was
// (or needs to be) bought to run it.
app.get('/api/admin/events/:id/shopping-list', requireManager, ah(async (req, res) => {
  res.json({ items: await db.getEventShoppingList(req.params.id) });
}));

// Averaged shopping list across every COMPLETED event, as a per-day rate --
// the Historique tab scales it to however many days the next event needs.
app.get('/api/admin/shopping-list/average', requireManager, ah(async (req, res) => {
  res.json({ items: await db.getAverageShoppingList(req.query.storefrontId) });
}));

// Ventes par jour, par catégorie, et produits les plus vendus sur une
// période -- alimente l'onglet Statistiques (mêmes filtres que /report).
const FORMULES_BUCKET = '__formules__';

// Parses a YYYY-MM-DD string as a pure calendar date at UTC midnight.
// `new Date(dateStr + 'T00:00:00')` (no offset) is parsed as LOCAL midnight,
// which silently shifts by a day around week/comparison-window boundaries
// whenever the server isn't running in UTC (e.g. Europe/Paris) -- every
// date computed from one of these YYYY-MM-DD strings must go through this
// and use the UTC getters/setters (getUTCDay, setUTCDate...), never the
// local ones, to stay consistent.
function parseYMD(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// Monday (ISO) of the week containing this YYYY-MM-DD date, itself as
// YYYY-MM-DD -- used both as the weekly grouping key and its label.
function weekKeyOf(dateStr) {
  const d = parseYMD(dateStr);
  const day = d.getUTCDay(); // 0 = Sunday
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

app.get('/api/admin/stats', requireManager, ah(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const from = (req.query.from || today).slice(0, 10);
  const to = (req.query.to || from).slice(0, 10);
  const groupBy = req.query.groupBy === 'week' ? 'week' : 'day';
  const [allOrders, categories, products] = await Promise.all([
    db.getOrders(req.query.storefrontId),
    db.getCategories(),
    req.query.storefrontId ? db.getProducts(req.query.storefrontId) : Promise.resolve([])
  ]);
  const categoryNames = new Map(categories.map(c => [c.id, c.name]));

  // Revenue/cost of every completed order within [rangeFrom, rangeTo] --
  // shared by the main period tally and the prior-window comparison below.
  const revenueCostInRange = (rangeFrom, rangeTo) => {
    let revenue = 0, cost = 0;
    for (const order of allOrders) {
      if (order.status !== 'completed') continue;
      const day = (order.createdAt || '').slice(0, 10);
      if (day < rangeFrom || day > rangeTo) continue;
      revenue += order.isFree ? 0 : (order.totalPrice || 0);
      order.items.forEach(item => { cost += itemUnitCost(item) * item.quantity; });
    }
    return { revenue, cost };
  };

  const periodOrders = allOrders.filter(order => {
    if (order.status !== 'completed') return false;
    const day = (order.createdAt || '').slice(0, 10);
    return day >= from && day <= to;
  });

  const seriesMap = new Map(); // bucket key (day or Monday of the week) -> { revenue, cost, orders, customers: Set }
  const categoryMap = new Map();
  const usageMap = new Map();
  const typeMap = new Map(); // 'menu' | 'product' -> { quantity, revenue, cost } -- formule vs. produit à l'unité
  let periodQuantity = 0; // every line's quantity, period-wide -- for the average basket

  periodOrders.forEach(order => {
    const day = (order.createdAt || '').slice(0, 10);
    const bucketKey = groupBy === 'week' ? weekKeyOf(day) : day;
    const bucket = seriesMap.get(bucketKey) || { revenue: 0, cost: 0, orders: 0, customers: new Set() };
    bucket.revenue += order.isFree ? 0 : (order.totalPrice || 0);
    bucket.orders += 1;
    bucket.customers.add(order.userId);

    order.items.forEach(item => {
      const lineRevenue = order.isFree ? 0 : (item.price || 0) * item.quantity;
      const lineCost = itemUnitCost(item) * item.quantity;
      bucket.cost += lineCost;
      periodQuantity += item.quantity;

      const typeKey = item.type === 'menu' ? 'menu' : 'product';
      const typeBucket = typeMap.get(typeKey) || { quantity: 0, revenue: 0, cost: 0 };
      typeBucket.quantity += item.quantity;
      typeBucket.revenue += lineRevenue;
      typeBucket.cost += lineCost;
      typeMap.set(typeKey, typeBucket);

      // Category ids are slugified (lowercase letters/digits/hyphens only,
      // see slugify() in db.js), so this key can never collide with a real
      // one -- unlike the literal string 'formules', which a category
      // named "Formules" would also slugify to.
      const categoryId = item.type === 'menu' ? FORMULES_BUCKET : (item.category || 'autre');
      categoryMap.set(categoryId, (categoryMap.get(categoryId) || 0) + lineRevenue);

      if (item.type === 'menu' && item.choices) {
        getChosenProducts(item).forEach(chosenProduct => {
          if (chosenProduct.name) {
            usageMap.set(chosenProduct.name, (usageMap.get(chosenProduct.name) || 0) + item.quantity);
          }
        });
      } else if (item.name) {
        usageMap.set(item.name, (usageMap.get(item.name) || 0) + item.quantity);
      }
    });

    seriesMap.set(bucketKey, bucket);
  });

  const series = Array.from(seriesMap.entries())
    .map(([date, { revenue, cost, orders, customers }]) => ({ date, revenue, cost, profit: revenue - cost, orders, customers: customers.size }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byCategory = Array.from(categoryMap.entries())
    .map(([category, revenue]) => ({
      category,
      categoryName: category === FORMULES_BUCKET ? 'Formules' : (categoryNames.get(category) || category),
      revenue
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const topProducts = Array.from(usageMap.entries())
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 8);

  const totalRevenue = series.reduce((sum, s) => sum + s.revenue, 0);
  const totalProfit = series.reduce((sum, s) => sum + s.profit, 0);
  const totalOrders = periodOrders.length;

  // Average basket: what a typical order looks like this period -- its
  // value/cost, how many units of each top item it tends to contain, and
  // whether it leans formule or produit-à-l'unité (each line counted as
  // its own type -- a formule's chosen products are NOT re-attributed to
  // 'product' here, unlike usageMap/topProducts above, since the question
  // is what the customer actually ordered, not what they end up eating).
  const byType = ['menu', 'product'].reduce((acc, key) => {
    const t = typeMap.get(key) || { quantity: 0, revenue: 0, cost: 0 };
    acc[key] = {
      quantity: t.quantity,
      avgPerOrder: totalOrders > 0 ? t.quantity / totalOrders : 0,
      avgPrice: t.quantity > 0 ? t.revenue / t.quantity : 0,
      avgCost: t.quantity > 0 ? t.cost / t.quantity : 0,
      avgMargin: t.quantity > 0 ? (t.revenue - t.cost) / t.quantity : 0
    };
    return acc;
  }, {});

  const avgBasket = totalOrders > 0 ? {
    value: totalRevenue / totalOrders,
    cost: (totalRevenue - totalProfit) / totalOrders,
    quantity: periodQuantity / totalOrders,
    byType,
    topItems: topProducts.slice(0, 5).map(p => ({ name: p.name, avgQuantity: p.quantity / totalOrders }))
  } : null;

  // Forecast: revenue/profit already made in the period, plus what selling
  // every unit still on hand (at its current price/margin) would add -- a
  // ceiling if none of the remaining stock goes unsold. Untracked
  // (unlimited-stock) products can't contribute a number here.
  const trackedInStock = products.filter(p => p.stock !== null && p.stock !== undefined && p.stock > 0);
  const stockPotentialRevenue = trackedInStock.reduce((sum, p) => sum + p.stock * p.price, 0);
  const stockPotentialProfit = trackedInStock
    .filter(p => p.costPrice != null)
    .reduce((sum, p) => sum + p.stock * (p.price - p.costPrice), 0);
  const forecast = {
    stockPotentialRevenue,
    projectedRevenue: totalRevenue + stockPotentialRevenue,
    stockPotentialProfit,
    projectedProfit: totalProfit + stockPotentialProfit
  };

  // Comparison: this window's profit vs. the immediately preceding window
  // of the same length (e.g. this week vs last week for a 7-day range).
  // When the previous window had zero profit, diffPercent/ratio fall back
  // to a flag the frontend renders as "nouveau" rather than a divide-by-zero.
  const spanDays = Math.round((parseYMD(to) - parseYMD(from)) / 86400000) + 1;
  const prevTo = parseYMD(from); prevTo.setUTCDate(prevTo.getUTCDate() - 1);
  const prevFrom = new Date(prevTo); prevFrom.setUTCDate(prevFrom.getUTCDate() - (spanDays - 1));
  const prevFromStr = prevFrom.toISOString().slice(0, 10);
  const prevToStr = prevTo.toISOString().slice(0, 10);
  const previous = revenueCostInRange(prevFromStr, prevToStr);
  const previousProfit = previous.revenue - previous.cost;
  const diffValue = totalProfit - previousProfit;
  const comparison = {
    previousFrom: prevFromStr,
    previousTo: prevToStr,
    currentProfit: totalProfit,
    previousProfit,
    diffValue,
    diffPercent: previousProfit !== 0 ? (diffValue / Math.abs(previousProfit)) * 100 : null,
    ratio: previousProfit !== 0 ? totalProfit / previousProfit : null
  };

  res.json({ from, to, groupBy, series, byCategory, topProducts, avgBasket, forecast, comparison });
}));

// Historical-average forecast for the next N days/weeks (revenue, profit,
// customer count) -- cross-event, same basis as getAverageShoppingList.
// Not a statistical model: with only a handful of real sales days, a
// trend/seasonality fit would be noise dressed up as precision, so this is
// a mean per active sales day, projected forward, with a low/high range
// from the sample's standard deviation (scaled by sqrt(days), since days
// are treated as independent -- variance of a sum, not a naive x-days
// scaling of a single day's spread).
app.get('/api/admin/forecast', requireManager, ah(async (req, res) => {
  const unit = req.query.unit === 'week' ? 'week' : 'day';
  const count = Math.max(1, Math.min(52, Math.round(Number(req.query.count)) || 1));
  const days = unit === 'week' ? count * 7 : count;

  const history = await db.getHistoricalDailyStats();
  const sampleSize = history.length;

  const stat = values => {
    if (values.length === 0) return { mean: 0, std: 0 };
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (values.length < 2) return { mean, std: 0 };
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
    return { mean, std: Math.sqrt(variance) };
  };

  const project = s => {
    const mean = s.mean * days;
    const std = s.std * Math.sqrt(days);
    return { mean, low: Math.max(0, mean - std), high: mean + std };
  };

  const perDay = {
    revenue: stat(history.map(h => h.revenue)),
    profit: stat(history.map(h => h.profit)),
    customers: stat(history.map(h => h.customers))
  };

  res.json({
    unit, count, days, sampleSize,
    perDay,
    projection: {
      revenue: project(perDay.revenue),
      profit: project(perDay.profit),
      customers: project(perDay.customers)
    }
  });
}));

// ----------------------------------------------------
// TEAM / ROLES (roadmap 06) -- Board-only. Assigns a login's role, which
// resolveRole() in auth42.js consults on their NEXT login (an already-open
// session keeps whatever access it started with until it re-authenticates).
// ----------------------------------------------------
const TEAM_ROLES = ['staff', 'admin', 'board'];

app.get('/api/admin/team', requireBoard, ah(async (req, res) => {
  res.json({ members: await db.listTeamMembers() });
}));

app.post('/api/admin/team', requireBoard, ah(async (req, res) => {
  const login = (req.body.login || '').trim().toLowerCase();
  const role = req.body.role;
  if (!/^[a-z0-9_-]{1,30}$/.test(login)) return res.status(400).json({ error: 'Login 42 invalide' });
  if (!TEAM_ROLES.includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
  const member = await db.setTeamMemberRole(login, role, req.user.login);
  res.json({ member });
}));

app.delete('/api/admin/team/:login', requireBoard, ah(async (req, res) => {
  await db.removeTeamMember(req.params.login.toLowerCase());
  res.json({ success: true });
}));

// Kiosk activation code -- Board-only, shown/regenerated from Gestion >
// Équipe so it no longer has to be read out of the server's .env file by
// hand (see getKioskSecretInfo() above).
app.get('/api/admin/kiosk-secret', requireBoard, ah(async (req, res) => {
  res.json(await getKioskSecretInfo());
}));

app.post('/api/admin/kiosk-secret/regenerate', requireBoard, ah(async (req, res) => {
  const { source } = await getKioskSecretInfo();
  if (source === 'env') {
    return res.status(400).json({ error: 'Le code borne est fixé par KIOSK_SECRET dans .env -- modifie cette variable puis redémarre le serveur pour le changer.' });
  }
  const secret = await db.setSetting(KIOSK_SECRET_SETTING_KEY, generateKioskSecret());
  // A regenerated code should actually lock out any terminal still running
  // on the old one -- not just block future activations with it.
  for (const [token, entry] of sessions) {
    if (entry.user.role === 'kiosk_guest') sessions.delete(token);
  }
  res.json({ secret, source: 'db' });
}));

// Currently-active kiosk terminals (one device session = one activation,
// see POST /api/auth/kiosk-login), so a Board member can lock any ONE of
// them individually -- e.g. a stolen/misbehaving tablet -- without
// regenerating the shared code and force-logging out every other kiosk too.
app.get('/api/admin/kiosk-sessions', requireBoard, (req, res) => {
  const now = Date.now();
  const kiosks = [];
  for (const entry of sessions.values()) {
    if (entry.user.role !== 'kiosk_guest' || entry.expiresAt < now) continue;
    kiosks.push({ id: entry.user.id, createdAt: new Date(entry.createdAt).toISOString(), expiresAt: new Date(entry.expiresAt).toISOString() });
  }
  kiosks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ kiosks });
});

app.delete('/api/admin/kiosk-sessions/:id', requireBoard, (req, res) => {
  let removed = false;
  for (const [token, entry] of sessions) {
    if (entry.user.role === 'kiosk_guest' && entry.user.id === req.params.id) {
      sessions.delete(token);
      removed = true;
    }
  }
  if (!removed) return res.status(404).json({ error: 'Cette borne n\'est plus active.' });
  res.json({ success: true });
});

// In production, serve the built React application from the same origin as the API.
if (process.env.NODE_ENV === 'production') {
  const clientPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(clientPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}

// Global error middleware: any error passed via next(err) (including rejected
// promises from async routes, see ah() above) lands here instead of crashing
// the process or returning Express's default HTML error page.
app.use((err, req, res, next) => {
  console.error('Unhandled error on', req.method, req.path, ':', err);
  res.status(500).json({ error: 'Erreur serveur interne' });
});

app.listen(PORT, async () => {
  console.log(`🚀 BDE Sandwich 42 server started on http://localhost:${PORT}`);
  console.log(`   Public URL          : ${publicAppUrl}`);
  console.log(`   OAuth Redirect URI  : ${oauthRedirectUri}`);
  console.log('   ↳ this Redirect URI must be declared identically in your 42 OAuth application.');

  try {
    await db.ready;
    console.log('✅ Base de données MariaDB connectée avec succès.');
    const push = await getPushDiagnostics('');
    console.log(`   Web Push            : ${push.enabled ? `enabled (VAPID keys from ${push.keysSource === 'env' ? '.env' : 'the database, generated automatically'})` : `DISABLED -- ${push.error} (did you run \`npx prisma migrate deploy\`?)`}`);
  } catch (err) {
    console.error('❌ ERREUR: Connexion à la base de données MariaDB échouée (port 3306).');
    console.error('   Vérifiez que Docker ou le service MariaDB est démarré (`docker compose up -d`).');
  }
});
