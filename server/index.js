import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './db.js';
import { get42AuthUrl, handle42Callback } from './auth42.js';

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
const sessions = new Map(); // token -> { user, expiresAt }

const createSession = (user) => {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { user, expiresAt: Date.now() + SESSION_TTL_MS });
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
    const token = createSession(user);
    res.redirect(`${publicAppUrl}/?token=${token}`);
  } catch (error) {
    console.error('42 Auth error:', error.message);
    res.redirect(`${publicAppUrl}/?error=${encodeURIComponent(error.message)}`);
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Simplified login for the kiosk (kiosk mode): no 42 OAuth, just a manually
// entered login so orders can be attributed. This account never has admin rights.
app.post('/api/auth/kiosk-login', authLimiter, (req, res) => {
  if (stagingMode) {
    return res.status(403).json({ error: 'Le mode borne est désactivé sur l\'environnement de test.' });
  }
  const login = (req.body.login || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,30}$/.test(login)) {
    return res.status(400).json({ error: 'Login invalide' });
  }
  const user = {
    id: 'kiosk_' + login,
    login,
    displayName: login,
    avatarUrl: '',
    campus: 'Borne',
    isAdmin: false,
    isManager: false,
    role: 'kiosk_guest'
  };
  const token = createSession(user);
  res.json({ token, user });
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token) sessions.delete(token);
  res.json({ success: true });
});


// db.js uses Prisma: every route touching the database is asynchronous. This
// wrapper avoids repeating try/catch everywhere and forwards any error to the
// global error middleware defined at the bottom of this file.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ----------------------------------------------------
// PRODUCT & MENU ROUTES (Storefront)
// ----------------------------------------------------
app.get('/api/products', ah(async (req, res) => {
  const [products, menus, categories] = await Promise.all([
    db.getPublicProducts(),
    db.getPublicMenus(),
    db.getCategories()
  ]);
  res.json({ products, menus, categories });
}));

// The single storefront currently live for students -- used by the
// (warm-themed) kitchen/order-tracking board, which always follows whatever
// is active rather than letting staff browse other events while on shift.
// Live order tracking (site-themed "Admin" tab): gated by requireAdmin.
app.get('/api/admin/active-storefront', requireAdmin, ah(async (req, res) => {
  res.json({ storefront: await db.getActiveStorefront() });
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

// Pre-fills this storefront's shopping list from the cross-event average,
// scaled to the given number of days.
app.post('/api/admin/storefronts/:id/shopping-list/generate', requireManager, ah(async (req, res) => {
  const days = Math.max(1, Math.min(60, Math.round(Number(req.body.days)) || 1));
  const result = await db.generateShoppingList(req.params.id, days);
  res.json(result);
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
  const { items, pickupTime, note, totalPrice } = req.body;

  if (!user) {
    return res.status(401).json({ error: 'Connexion 42 requise pour commander' });
  }

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Panier vide' });
  }

  const newOrder = await db.addOrder({
    userId: user.id,
    userLogin: user.login,
    userDisplayName: user.displayName,
    items,
    pickupTime: pickupTime || '12h00',
    note: note || '',
    totalPrice: parseFloat(totalPrice) || 0
  });

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

// Get user orders
app.get('/api/orders', ah(async (req, res) => {
  const user = getUserFromReq(req);
  if (!user) {
    return res.json({ orders: [] });
  }
  const allOrders = await db.getOrders();
  const userOrders = allOrders.filter(o => o.userId === String(user.id) || o.userLogin === user.login);
  res.json({ orders: userOrders });
}));

// The student leaves (or edits) a review on one of their picked-up orders.
app.post('/api/orders/:id/review', ah(async (req, res) => {
  const user = getUserFromReq(req);
  if (!user) {
    return res.status(401).json({ error: 'Connexion 42 requise' });
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
  res.json({ items: await db.getAverageShoppingList() });
}));

// Ventes par jour, par catégorie, et produits les plus vendus sur une
// période -- alimente l'onglet Statistiques (mêmes filtres que /report).
const FORMULES_BUCKET = '__formules__';
app.get('/api/admin/stats', requireManager, ah(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const from = (req.query.from || today).slice(0, 10);
  const to = (req.query.to || from).slice(0, 10);
  const [allOrders, categories] = await Promise.all([
    db.getOrders(req.query.storefrontId),
    db.getCategories()
  ]);
  const categoryNames = new Map(categories.map(c => [c.id, c.name]));

  const periodOrders = allOrders.filter(order => {
    if (order.status !== 'completed') return false;
    const day = (order.createdAt || '').slice(0, 10);
    return day >= from && day <= to;
  });

  const dailyMap = new Map();
  const categoryMap = new Map();
  const usageMap = new Map();

  periodOrders.forEach(order => {
    const day = (order.createdAt || '').slice(0, 10);
    const orderRevenue = order.isFree ? 0 : (order.totalPrice || 0);
    dailyMap.set(day, (dailyMap.get(day) || 0) + orderRevenue);

    order.items.forEach(item => {
      const lineRevenue = order.isFree ? 0 : (item.price || 0) * item.quantity;
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
  });

  const dailySales = Array.from(dailyMap.entries())
    .map(([date, revenue]) => ({ date, revenue }))
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

  res.json({ from, to, dailySales, byCategory, topProducts });
}));

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

await db.ready;
app.listen(PORT, () => {
  console.log(`🚀 BDE Sandwich 42 server started on http://localhost:${PORT}`);
  console.log(`   Public URL          : ${publicAppUrl}`);
  console.log(`   OAuth Redirect URI  : ${oauthRedirectUri}`);
  console.log('   \u21b3 this Redirect URI must be declared identically in your 42 OAuth application.');
});
