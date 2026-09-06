import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial Default Data for 42 BDE Sandwicherie
const defaultData = {
  categories: [
    { id: 'plat', name: 'Plat', icon: '🥪', isVisible: true },
    { id: 'boisson', name: 'Boisson', icon: '🥤', isVisible: true },
    { id: 'dessert', name: 'Dessert', icon: '🍩', isVisible: true },
    { id: 'supplement', name: 'Supplément', icon: '🧂', isVisible: true }
  ],
  products: [
    { id: 'p1', name: 'Sandwich Jambon', category: 'plat', price: 3.5, description: 'Pain baguette, jambon blanc, salade, beurre.', badge: '', available: true, icon: '🥪' },
    { id: 'p2', name: 'Sandwich Rosette', category: 'plat', price: 3.5, description: 'Pain baguette, rosette, cornichons, beurre.', badge: '', available: true, icon: '🥪' },
    { id: 'p3', name: 'Sandwich Poulet', category: 'plat', price: 4.5, extraMenuPrice: 1, description: 'Pain baguette, aiguillettes de poulet, tomates fraiches, oignons caramélisés, sauce pesto (+1€ en menu).', badge: 'Premium (+1€)', available: true, icon: '🍗' },
    { id: 'p3_thon', name: 'Sandwich Thon Mayonnaise', category: 'plat', price: 4.5, extraMenuPrice: 1, description: 'Pain baguette, thon, échalotes, tomates fraîche, salade, mayonnaise.', badge: 'Premium (+1€)', available: true, icon: '🐟' },
    { id: 'p4', name: 'Salade Composée', category: 'plat', price: 3.5, description: 'Salade, tomates fraiche, maïs, carotte, croutons, mozzarella et sauce vinaigrette.', badge: 'Végétarien', available: true, icon: '🥗' },
    { id: 'b1', name: 'Coca-Cola 33cl', category: 'boisson', price: 1, description: 'Cannette fraîche 33cl.', available: true, icon: '🥤' },
    { id: 'b3', name: 'Ice Tea Pêche 33cl', category: 'boisson', price: 1, description: 'Thé glacé au goût de pêche.', available: true, icon: '🍑' },
    { id: 'b4', name: 'Eau Minérale Cristaline 50cl', category: 'boisson', price: 0.5, description: 'Bouteille d\'eau plate 50cl.', available: true, icon: '💧' },
    { id: 'b5', name: 'RedBull 25cl', category: 'boisson', price: 2, extraMenuPrice: 1, description: 'Pour les rushes de fin de piscine & nuit de code. (+1€ en formule menu)', badge: 'Booster (+1€)', available: true, icon: '⚡' },
    { id: 'd1', name: 'Donut au Sucre', category: 'dessert', price: 1.5, description: 'Donut moelleux, saupoudré de sucre boule de cristal.', badge: '', available: true, icon: '🍩' },
    { id: 'd2', name: 'Brownie', category: 'dessert', price: 1.6, description: 'C\'est fort en chocolat.', available: true, icon: '🍫' },
    { id: 'd3', name: 'Crumble ', category: 'dessert', price: 1.5, description: 'Delicieux crumble au fruit de saison.', badge: 'Fait maison', available: true, icon: '🥧' },
    { id: 'd4', name: "Pom'Potes", category: 'dessert', price: 0.8, description: 'Ton meilleur pote à l\'exam final.', available: true, icon: '🍎' }
  ],
  menus: [
    {
      id: 'm1',
      name: 'Formule Plouf (Plat + Boisson + Chips)',
      price: 4.50,
      description: 'Le snack parfait entre deux évaluations. Choisissez 1 Plat + 1 Boisson au choix.',
      badge: 'Économique',
      available: true,
      groups: [
        { id: 'g_plat', name: 'Plat', productIds: [], category: 'plat' },
        { id: 'g_boisson', name: 'Boisson', productIds: [], category: 'boisson' }
      ],
      icon: '🎣'
    },
    {
      id: 'm2',
      name: 'Formule Jaws (Plat + Boisson + Chips + Dessert)',
      price: 5.50,
      description: 'La formule incontournable du midi ! 1 Plat + 1 Boisson + 1 Dessert au choix.',
      badge: 'Le + Populaire',
      available: true,
      groups: [
        { id: 'g_plat', name: 'Plat', productIds: [], category: 'plat' },
        { id: 'g_boisson', name: 'Boisson', productIds: [], category: 'boisson' },
        { id: 'g_dessert', name: 'Dessert', productIds: [], category: 'dessert' }
      ],
      icon: '🦈'
    }
  ],
  orders: [],
  templates: [],
  users: []
};

function normalizeGroups(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(group => ({
      id: (group && group.id) || 'g_' + Math.random().toString(36).slice(2, 9),
      name: (group && group.name ? String(group.name) : '').trim(),
      productIds: Array.isArray(group && group.productIds) ? group.productIds.filter(Boolean) : [],
      ...(group && group.category ? { category: group.category } : {})
    }))
    .filter(group => group.name || group.productIds.length || group.category);
}

class DB {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const data = JSON.parse(raw);
        const hasNewCatalog = data.products?.some(product => ['p5', 'b2', 's1'].includes(product.id));
        if (hasNewCatalog) {
          data.products = defaultData.products;
          this.save(data);
        }
        data.categories = (data.categories || defaultData.categories).map(category => ({ isVisible: true, ...category }));
        data.templates = data.templates || [];
        return data;
      }
    } catch (e) {
      console.error('Error reading database file, resetting to default:', e);
    }
    this.save(defaultData);
    return defaultData;
  }

  save(data = this.data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }

  getCategories() {
    return this.data.categories || [];
  }

  getPublicProducts() {
    const visibleCategoryIds = new Set(this.getCategories().filter(category => category.isVisible !== false).map(category => category.id));
    return this.data.products.filter(product => visibleCategoryIds.has(product.category));
  }

  addCategory(category) {
    const id = category.id || category.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
    if (!id || this.data.categories.some(existing => existing.id === id)) return null;
    const newCategory = { id, name: category.name.trim(), icon: category.icon || '📦', isVisible: true };
    this.data.categories.push(newCategory);
    this.save();
    return newCategory;
  }

  deleteCategory(id) {
    if (['plat', 'boisson', 'dessert', 'supplement'].includes(id)) return false;
    this.data.categories = this.data.categories.filter(category => category.id !== id);
    this.save();
    return true;
  }

  toggleCategoryVisibility(id) {
    const category = this.data.categories.find(item => item.id === id);
    if (!category) return null;
    category.isVisible = category.isVisible === false;
    this.save();
    return category;
  }

  getTemplates() {
    return this.data.templates || [];
  }

  addTemplate(templateData) {
    const copy = value => JSON.parse(JSON.stringify(value));
    const newTemplate = {
      id: 'template_' + Date.now(),
      name: templateData.name.trim(),
      description: templateData.description || '',
      createdAt: new Date().toISOString(),
      products: copy(this.data.products),
      menus: copy(this.data.menus),
      categories: copy(this.data.categories)
    };
    this.data.templates.unshift(newTemplate);
    this.save();
    return newTemplate;
  }

  applyTemplate(id) {
    const template = this.data.templates.find(savedTemplate => savedTemplate.id === id);
    if (!template) return null;
    this.data.products = template.products;
    this.data.menus = template.menus;
    this.data.categories = template.categories;
    this.save();
    return template;
  }

  deleteTemplate(id) {
    this.data.templates = this.data.templates.filter(template => template.id !== id);
    this.save();
  }

  // PRODUCTS
  getProducts() {
    return this.data.products;
  }

  getProductById(id) {
    return this.data.products.find(p => p.id === id);
  }

  addProduct(product) {
    const newProduct = {
      id: 'p_' + Date.now(),
      available: true,
      badge: '',
      icon: product.icon || '🥪',
      extraMenuPrice: parseFloat(product.extraMenuPrice) || 0,
      ...product,
      price: parseFloat(product.price) || 0,
    };
    this.data.products.unshift(newProduct);
    this.save();
    return newProduct;
  }

  updateProduct(id, updates) {
    const idx = this.data.products.findIndex(p => p.id === id);
    if (idx !== -1) {
      this.data.products[idx] = { ...this.data.products[idx], ...updates };
      if (updates.price !== undefined) {
        this.data.products[idx].price = parseFloat(updates.price);
      }
      if (updates.extraMenuPrice !== undefined) {
        this.data.products[idx].extraMenuPrice = parseFloat(updates.extraMenuPrice) || 0;
      }
      this.save();
      return this.data.products[idx];
    }
    return null;
  }

  deleteProduct(id) {
    this.data.products = this.data.products.filter(p => p.id !== id);
    this.save();
  }

  toggleProductStock(id) {
    const product = this.getProductById(id);
    if (product) {
      product.available = !product.available;
      this.save();
      return product;
    }
    return null;
  }

  // MENUS
  getMenus() {
    return this.data.menus || [];
  }

  addMenu(menu) {
    const newMenu = {
      id: 'm_' + Date.now(),
      available: true,
      badge: '',
      icon: menu.icon || '🍱',
      ...menu,
      groups: normalizeGroups(menu.groups),
      price: parseFloat(menu.price) || 0
    };
    this.data.menus.unshift(newMenu);
    this.save();
    return newMenu;
  }

  updateMenu(id, updates) {
    const idx = this.data.menus.findIndex(m => m.id === id);
    if (idx !== -1) {
      this.data.menus[idx] = { ...this.data.menus[idx], ...updates };
      if (updates.price !== undefined) {
        this.data.menus[idx].price = parseFloat(updates.price);
      }
      if (updates.groups !== undefined) {
        this.data.menus[idx].groups = normalizeGroups(updates.groups);
      }
      this.save();
      return this.data.menus[idx];
    }
    return null;
  }

  deleteMenu(id) {
    this.data.menus = this.data.menus.filter(m => m.id !== id);
    this.save();
  }

  toggleMenuStock(id) {
    const menu = this.data.menus.find(m => m.id === id);
    if (menu) {
      menu.available = !menu.available;
      this.save();
      return menu;
    }
    return null;
  }

  // ORDERS
  getOrders() {
    return this.data.orders || [];
  }

  addOrder(orderData) {
    const orderNumber = Math.floor(1000 + Math.random() * 9000);
    const newOrder = {
      id: 'ord_' + Date.now(),
      orderNumber: `42-${orderNumber}`,
      status: 'pending', // 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'
      createdAt: new Date().toISOString(),
      ...orderData
    };
    this.data.orders.unshift(newOrder);
    this.save();
    return newOrder;
  }

  updateOrderStatus(id, status) {
    const order = this.data.orders.find(o => o.id === id);
    if (order) {
      order.status = status;
      this.save();
      return order;
    }
    return null;
  }
}

export const db = new DB();
