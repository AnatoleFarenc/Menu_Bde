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


// All /api/admin/* routes require an administrator account — checked once here.
app.use('/api/admin', requireAdmin);

// db.js uses Prisma: every route touching the database is asynchronous. This
// wrapper avoids repeating try/catch everywhere and forwards any error to the
// global error middleware defined at the bottom of this file.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ----------------------------------------------------
// PRODUCT & MENU ROUTES (Storefront)
// ----------------------------------------------------
app.get('/api/products', ah(async (req, res) => {
  const [products, menus, categories] = await Promise.all([
    db.getProducts(),
    db.getMenus(),
    db.getCategories()
  ]);
  res.json({ products, menus, categories });
}));

app.get('/api/admin/templates', ah(async (req, res) => {
  res.json({ templates: await db.getTemplates() });
}));

app.post('/api/admin/templates', ah(async (req, res) => {
  if (!req.body.name?.trim()) return res.status(400).json({ error: 'Le nom du template est obligatoire' });
  res.status(201).json({ template: await db.addTemplate(req.body) });
}));

app.post('/api/admin/templates/:id/apply', ah(async (req, res) => {
  const template = await db.applyTemplate(req.params.id);
  if (!template) return res.status(404).json({ error: 'Template introuvable' });
  const [products, menus, categories] = await Promise.all([db.getProducts(), db.getMenus(), db.getCategories()]);
  res.json({ template, products, menus, categories });
}));

app.delete('/api/admin/templates/:id', ah(async (req, res) => {
  await db.deleteTemplate(req.params.id);
  res.json({ success: true });
}));

app.post('/api/admin/categories', ah(async (req, res) => {
  if (!req.body.name?.trim()) return res.status(400).json({ error: 'Le nom de la catégorie est obligatoire' });
  const category = await db.addCategory(req.body);
  if (!category) return res.status(409).json({ error: 'Cette catégorie existe déjà' });
  res.status(201).json({ category, categories: await db.getCategories() });
}));

app.delete('/api/admin/categories/:id', ah(async (req, res) => {
  if (!(await db.deleteCategory(req.params.id))) {
    return res.status(400).json({ error: 'Catégorie par défaut ou encore utilisée par des produits : impossible à supprimer' });
  }
  res.json({ categories: await db.getCategories() });
}));

app.patch('/api/admin/categories/:id/visibility', ah(async (req, res) => {
  const category = await db.toggleCategoryVisibility(req.params.id);
  if (!category) return res.status(404).json({ error: 'Catégorie introuvable' });
  res.json({ category, categories: await db.getCategories() });
}));

// Admin product routes
app.post('/api/admin/products', ah(async (req, res) => {
  const newProduct = await db.addProduct(req.body);
  res.status(201).json({ product: newProduct });
}));

app.put('/api/admin/products/:id', ah(async (req, res) => {
  const updated = await db.updateProduct(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Produit non trouvé' });
  res.json({ product: updated });
}));

app.delete('/api/admin/products/:id', ah(async (req, res) => {
  await db.deleteProduct(req.params.id);
  res.json({ success: true });
}));

app.patch('/api/admin/products/:id/toggle-stock', ah(async (req, res) => {
  const updated = await db.toggleProductStock(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Produit non trouvé' });
  res.json({ product: updated });
}));

// Admin menu routes
app.post('/api/admin/menus', ah(async (req, res) => {
  const newMenu = await db.addMenu(req.body);
  res.status(201).json({ menu: newMenu });
}));

app.put('/api/admin/menus/:id', ah(async (req, res) => {
  const updated = await db.updateMenu(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Menu non trouvé' });
  res.json({ menu: updated });
}));

app.delete('/api/admin/menus/:id', ah(async (req, res) => {
  await db.deleteMenu(req.params.id);
  res.json({ success: true });
}));

app.patch('/api/admin/menus/:id/toggle-stock', ah(async (req, res) => {
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
app.post('/api/admin/orders/free', ah(async (req, res) => {
  const { productId, quantity, beneficiary, pickupTime, note } = req.body;
  const product = await db.getProductById(productId);
  if (!product) {
    return res.status(404).json({ error: 'Produit introuvable' });
  }
  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  const label = (beneficiary || '').trim() || 'Don BDE';

  const newOrder = await db.addOrder({
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

// Get all orders for Admin / Kitchen Board with synthesis computation
app.get('/api/admin/orders', ah(async (req, res) => {
  const orders = await db.getOrders();

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
        const chosenProducts = Array.isArray(item.choices)
          ? item.choices.map(entry => entry && entry.product)
          : Object.values(item.choices);
        chosenProducts.forEach(chosenProduct => {
          if (chosenProduct && chosenProduct.name) {
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

app.patch('/api/admin/orders/:id', ah(async (req, res) => {
  const { items, pickupTime, note, totalPrice } = req.body;
  if (items && items.length === 0) {
    return res.status(400).json({ error: 'Une commande doit contenir au moins un article' });
  }
  const updated = await db.updateOrder(req.params.id, { items, pickupTime, note, totalPrice });
  if (!updated) return res.status(404).json({ error: 'Commande introuvable' });
  res.json({ order: updated });
}));

app.patch('/api/admin/orders/:id/status', ah(async (req, res) => {
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

app.patch('/api/admin/orders/:id/paid', ah(async (req, res) => {
  const updatedOrder = await db.setOrderPaid(req.params.id, !!req.body.isPaid);
  if (!updatedOrder) return res.status(404).json({ error: 'Commande introuvable' });
  res.json({ order: updatedOrder });
}));

app.delete('/api/admin/orders', ah(async (req, res) => {
  await db.clearOrders();
  res.json({ success: true });
}));

app.delete('/api/admin/orders/:id', ah(async (req, res) => {
  const deleted = await db.deleteOrder(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Commande introuvable' });
  res.json({ success: true });
}));

// All customer reviews left on orders, most recent first.
app.get('/api/admin/reviews', ah(async (req, res) => {
  const orders = await db.getOrders();
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

app.delete('/api/admin/reviews/:orderId', ah(async (req, res) => {
  const deleted = await db.deleteReview(req.params.orderId);
  if (!deleted) return res.status(404).json({ error: 'Avis introuvable' });
  res.json({ success: true });
}));

// Sales report over a period (?from=YYYY-MM-DD&to=YYYY-MM-DD, defaults to today
// for both). Only counts picked-up orders (completed); gifted orders (isFree)
// count toward quantity but not revenue.
app.get('/api/admin/report', ah(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const from = (req.query.from || req.query.date || today).slice(0, 10);
  const to = (req.query.to || from).slice(0, 10);
  const allOrders = await db.getOrders();
  const periodOrders = allOrders.filter(order => {
    if (order.status !== 'completed') return false;
    const day = (order.createdAt || '').slice(0, 10);
    return day >= from && day <= to;
  });

  const productsMap = new Map();
  let totalRevenue = 0;
  let totalCost = 0;

  // Cost of a line: for a product it's its costPrice; for a meal deal it's
  // the sum of the costPrice of the products chosen within it. Missing/null costPrice => 0 (unknown).
  const itemUnitCost = (item) => {
    if (item.type === 'menu' && item.choices) {
      const chosen = Array.isArray(item.choices)
        ? item.choices.map(entry => entry && entry.product)
        : Object.values(item.choices);
      return chosen.reduce((sum, p) => sum + (p && p.costPrice ? p.costPrice : 0), 0);
    }
    return item.costPrice || 0;
  };

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
        const chosenProducts = Array.isArray(item.choices)
          ? item.choices.map(entry => entry && entry.product)
          : Object.values(item.choices);
        chosenProducts.forEach(chosenProduct => {
          if (chosenProduct && chosenProduct.name) addUsage(chosenProduct.name, item.quantity);
        });
      } else if (item.name) {
        addUsage(item.name, item.quantity);
      }
    });
  });

  const products = Array.from(productsMap.values())
    .map(p => ({ ...p, margin: p.totalPrice - p.totalCost }))
    .sort((a, b) => b.quantity - a.quantity);

  res.json({
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
  });
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
