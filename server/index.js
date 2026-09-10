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

// Derrière le reverse proxy Caddy : nécessaire pour que le rate-limit voie la vraie IP client.
app.set('trust proxy', 1);

// En-têtes de sécurité (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy…).
// CSP taillée sur mesure pour l'app : bundle servi en propre, polices Google, avatars 42.
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

// CORS restreint aux origines connues (domaine public + localhost pour le dev).
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

// Rate limiting : global large, strict sur l'authentification.
app.use('/api/', rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

// Mode staging : si STAGING_MODE=true, seuls les logins 42 listés dans STAGING_ALLOWED_LOGINS
// peuvent se connecter. Sur la prod la variable est absente → aucun effet.
const stagingMode = process.env.STAGING_MODE === 'true';
const stagingAllowedLogins = (process.env.STAGING_ALLOWED_LOGINS || '')
  .split(',')
  .map(login => login.trim().toLowerCase())
  .filter(Boolean);
const isStagingAllowed = (login) => !stagingMode || stagingAllowedLogins.includes((login || '').toLowerCase());

// ----------------------------------------------------
// SESSIONS  (jeton opaque aléatoire, expiration glissante)
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
  entry.expiresAt = Date.now() + SESSION_TTL_MS; // expiration glissante
  return entry.user;
};

// Purge périodique des sessions expirées.
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of sessions) {
    if (entry.expiresAt < now) sessions.delete(token);
  }
}, 30 * 60 * 1000).unref();

// Middlewares d'autorisation
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

// État anti-CSRF pour le flux OAuth 42 (state param), jetons à usage unique & courte durée.
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

// Connexion simplifiée pour la borne (mode kiosque) : pas d'OAuth 42, juste un login déclaré
// à la main pour pouvoir attribuer les commandes. Le compte n'a jamais les droits admin.
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


// Toutes les routes /api/admin/* exigent un compte administrateur — vérifié une seule fois ici.
app.use('/api/admin', requireAdmin);

// ----------------------------------------------------
// PRODUCT & MENU ROUTES (Vitrine)
// ----------------------------------------------------
app.get('/api/products', (req, res) => {
  const products = db.getProducts();
  const menus = db.getMenus();
  res.json({ products, menus, categories: db.getCategories() });
});

app.get('/api/admin/templates', (req, res) => {
  res.json({ templates: db.getTemplates() });
});

app.post('/api/admin/templates', (req, res) => {
  if (!req.body.name?.trim()) return res.status(400).json({ error: 'Le nom du template est obligatoire' });
  res.status(201).json({ template: db.addTemplate(req.body) });
});

app.post('/api/admin/templates/:id/apply', (req, res) => {
  const template = db.applyTemplate(req.params.id);
  if (!template) return res.status(404).json({ error: 'Template introuvable' });
  res.json({ template, products: db.getProducts(), menus: db.getMenus(), categories: db.getCategories() });
});

app.delete('/api/admin/templates/:id', (req, res) => {
  db.deleteTemplate(req.params.id);
  res.json({ success: true });
});

app.post('/api/admin/categories', (req, res) => {
  if (!req.body.name?.trim()) return res.status(400).json({ error: 'Le nom de la catégorie est obligatoire' });
  const category = db.addCategory(req.body);
  if (!category) return res.status(409).json({ error: 'Cette catégorie existe déjà' });
  res.status(201).json({ category, categories: db.getCategories() });
});

app.delete('/api/admin/categories/:id', (req, res) => {
  if (!db.deleteCategory(req.params.id)) return res.status(400).json({ error: 'Cette catégorie par défaut ne peut pas être supprimée' });
  res.json({ categories: db.getCategories() });
});

app.patch('/api/admin/categories/:id/visibility', (req, res) => {
  const category = db.toggleCategoryVisibility(req.params.id);
  if (!category) return res.status(404).json({ error: 'Catégorie introuvable' });
  res.json({ category, categories: db.getCategories() });
});

// Admin product routes
app.post('/api/admin/products', (req, res) => {
  const newProduct = db.addProduct(req.body);
  res.status(201).json({ product: newProduct });
});

app.put('/api/admin/products/:id', (req, res) => {
  const updated = db.updateProduct(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Produit non trouvé' });
  res.json({ product: updated });
});

app.delete('/api/admin/products/:id', (req, res) => {
  db.deleteProduct(req.params.id);
  res.json({ success: true });
});

app.patch('/api/admin/products/:id/toggle-stock', (req, res) => {
  const updated = db.toggleProductStock(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Produit non trouvé' });
  res.json({ product: updated });
});

// Admin menu routes
app.post('/api/admin/menus', (req, res) => {
  const newMenu = db.addMenu(req.body);
  res.status(201).json({ menu: newMenu });
});

app.put('/api/admin/menus/:id', (req, res) => {
  const updated = db.updateMenu(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Menu non trouvé' });
  res.json({ menu: updated });
});

app.delete('/api/admin/menus/:id', (req, res) => {
  db.deleteMenu(req.params.id);
  res.json({ success: true });
});

app.patch('/api/admin/menus/:id/toggle-stock', (req, res) => {
  const updated = db.toggleMenuStock(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Menu non trouvé' });
  res.json({ menu: updated });
});

// ----------------------------------------------------
// ORDERS & KITCHEN DASHBOARD
// ----------------------------------------------------
app.post('/api/orders', (req, res) => {
  const user = getUserFromReq(req);
  const { items, pickupTime, note, totalPrice } = req.body;

  if (!user) {
    return res.status(401).json({ error: 'Connexion 42 requise pour commander' });
  }

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Panier vide' });
  }

  const newOrder = db.addOrder({
    userId: user.id,
    userLogin: user.login,
    userDisplayName: user.displayName,
    items,
    pickupTime: pickupTime || '12h00',
    note: note || '',
    totalPrice: parseFloat(totalPrice) || 0
  });

  res.status(201).json({ order: newOrder });
});

// Commande créée par un admin pour un produit offert (prix à 0, hors panier étudiant).
app.post('/api/admin/orders/free', (req, res) => {
  const { productId, quantity, beneficiary, pickupTime, note } = req.body;
  const product = db.getProductById(productId);
  if (!product) {
    return res.status(404).json({ error: 'Produit introuvable' });
  }
  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  const label = (beneficiary || '').trim() || 'Don BDE';

  const newOrder = db.addOrder({
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
});

// Get user orders
app.get('/api/orders', (req, res) => {
  const user = getUserFromReq(req);
  const allOrders = db.getOrders();
  if (!user) {
    return res.json({ orders: [] });
  }
  const userOrders = allOrders.filter(o => o.userId === user.id || o.userLogin === user.login);
  res.json({ orders: userOrders });
});

// L'étudiant laisse (ou modifie) un avis sur une de ses commandes récupérées.
app.post('/api/orders/:id/review', (req, res) => {
  const user = getUserFromReq(req);
  if (!user) {
    return res.status(401).json({ error: 'Connexion 42 requise' });
  }
  const rating = parseInt(req.body.rating, 10);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'La note doit être comprise entre 1 et 5' });
  }
  const result = db.setOrderReview(req.params.id, user.id, { rating, comment: req.body.comment });
  if (result.error === 'not_found') return res.status(404).json({ error: 'Commande introuvable' });
  if (result.error === 'forbidden') return res.status(403).json({ error: 'Cette commande ne t\'appartient pas' });
  if (result.error === 'not_completed') return res.status(400).json({ error: 'L\'avis n\'est possible que sur une commande récupérée' });
  res.json({ order: result.order });
});

// Get all orders for Admin / Kitchen Board with synthesis computation
app.get('/api/admin/orders', (req, res) => {
  const orders = db.getOrders();

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
      // Direct products or elements inside a menu formula
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
});

app.patch('/api/admin/orders/:id', (req, res) => {
  const { items, pickupTime, note, totalPrice } = req.body;
  if (items && items.length === 0) {
    return res.status(400).json({ error: 'Une commande doit contenir au moins un article' });
  }
  const updated = db.updateOrder(req.params.id, { items, pickupTime, note, totalPrice });
  if (!updated) return res.status(404).json({ error: 'Commande introuvable' });
  res.json({ order: updated });
});

app.patch('/api/admin/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const allowedStatuses = ['pending', 'preparing', 'ready', 'completed', 'cancelled'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Statut de commande invalide' });
  }
  const updatedOrder = db.updateOrderStatus(req.params.id, status);
  if (!updatedOrder) {
    return res.status(404).json({ error: 'Commande introuvable' });
  }
  res.json({ order: updatedOrder });
});

app.patch('/api/admin/orders/:id/paid', (req, res) => {
  const updatedOrder = db.setOrderPaid(req.params.id, !!req.body.isPaid);
  if (!updatedOrder) return res.status(404).json({ error: 'Commande introuvable' });
  res.json({ order: updatedOrder });
});

app.delete('/api/admin/orders', (req, res) => {
  db.clearOrders();
  res.json({ success: true });
});

app.delete('/api/admin/orders/:id', (req, res) => {
  const deleted = db.deleteOrder(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Commande introuvable' });
  res.json({ success: true });
});

// Tous les avis clients laissés sur des commandes, du plus récent au plus ancien.
app.get('/api/admin/reviews', (req, res) => {
  const reviews = db.getOrders()
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
});

app.delete('/api/admin/reviews/:orderId', (req, res) => {
  const deleted = db.deleteReview(req.params.orderId);
  if (!deleted) return res.status(404).json({ error: 'Avis introuvable' });
  res.json({ success: true });
});

// Bilan des ventes sur une période (?from=YYYY-MM-DD&to=YYYY-MM-DD, par défaut aujourd'hui
// pour les deux). Ne compte que les commandes récupérées (completed) ; les dons (isFree)
// comptent en quantité mais pas en chiffre d'affaires.
app.get('/api/admin/report', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const from = (req.query.from || req.query.date || today).slice(0, 10);
  const to = (req.query.to || from).slice(0, 10);
  const periodOrders = db.getOrders().filter(order => {
    if (order.status !== 'completed') return false;
    const day = (order.createdAt || '').slice(0, 10);
    return day >= from && day <= to;
  });

  const productsMap = new Map();
  let totalRevenue = 0;
  let totalCost = 0;

  // Coût d'achat d'une ligne : pour un produit c'est son costPrice ; pour une formule c'est
  // la somme des costPrice des produits choisis dedans. costPrice absent/null => 0 (inconnu).
  const itemUnitCost = (item) => {
    if (item.type === 'menu' && item.choices) {
      const chosen = Array.isArray(item.choices)
        ? item.choices.map(entry => entry && entry.product)
        : Object.values(item.choices);
      return chosen.reduce((sum, p) => sum + (p && p.costPrice ? p.costPrice : 0), 0);
    }
    return item.costPrice || 0;
  };

  // Décompte "consommation réelle" : décompose aussi les produits choisis dans les formules,
  // pour savoir combien de fois chaque produit a été pris au total (seul ou via un menu).
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
});

// In production, serve the built React application from the same origin as the API.
if (process.env.NODE_ENV === 'production') {
  const clientPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(clientPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}


app.listen(PORT, () => {
  console.log(`🚀 Serveur BDE Sandwich 42 démarré sur http://localhost:${PORT}`);
  console.log(`   URL publique        : ${publicAppUrl}`);
  console.log(`   Redirect URI OAuth  : ${oauthRedirectUri}`);
  console.log('   ↳ cette Redirect URI doit être déclarée à l\'identique dans ton application OAuth 42.');
});
