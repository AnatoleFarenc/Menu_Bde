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
  products: [
    // PLATS
    {
      id: 'p1',
      name: 'Sandwich Poulet Avocat',
      category: 'plat',
      price: 3.80,
      description: 'Pain baguette croustillant, aiguillettes de poulet marinées, avocat frais, tomates & sauce ciboulette.',
      badge: 'Bestseller',
      available: true,
      icon: '🥪'
    },
    {
      id: 'p2',
      name: 'Panini 3 Fromages',
      category: 'plat',
      price: 3.50,
      description: 'Mozzarella fondu, cheddar affiné & emmental français fondu chaud dans un pain panini grillé.',
      badge: 'Chaud',
      available: true,
      icon: '🧀'
    },
    {
      id: 'p3',
      name: 'Sandwich Thon Mayonnaise',
      category: 'plat',
      price: 3.50,
      description: 'Thon pêché durablement, oeuf dur, salade fraîche et sauce crémeuse mayonnaise citronnée.',
      badge: '',
      available: true,
      icon: '🐟'
    },
    {
      id: 'p4',
      name: 'Sandwich Vege Falafel',
      category: 'plat',
      price: 3.60,
      description: 'Falafels croustillants, houmous maison, concombre et sauce tahini au sésame.',
      badge: 'Végétarien',
      available: true,
      icon: '🥗'
    },
    {
      id: 'p5',
      name: 'Panini Poulet Curry',
      category: 'plat',
      price: 3.80,
      description: 'Poulet rôti doux au curry, emmental fondu et poivrons grillés.',
      badge: 'Chaud',
      available: false, // Exemple de rupture de stock initial
      icon: '🔥'
    },

    // BOISSONS
    {
      id: 'b1',
      name: 'Coca-Cola Zero 33cl',
      category: 'boisson',
      price: 1.20,
      description: 'Cannette fraîche 33cl.',
      available: true,
      icon: '🥤'
    },
    {
      id: 'b2',
      name: 'Oasis Tropical 33cl',
      category: 'boisson',
      price: 1.20,
      description: 'Boisson rafraîchissante aux fruits.',
      available: true,
      icon: '🧃'
    },
    {
      id: 'b3',
      name: 'Ice Tea Pêche 33cl',
      category: 'boisson',
      price: 1.20,
      description: 'Thé glacé au goût de pêche.',
      available: true,
      icon: '🍑'
    },
    {
      id: 'b4',
      name: 'Eau Minérale Cristaline 50cl',
      category: 'boisson',
      price: 0.80,
      description: 'Bouteille d\'eau plate 50cl.',
      available: true,
      icon: '💧'
    },
    {
      id: 'b5',
      name: 'Monster Energy 50cl',
      category: 'boisson',
      price: 2.00,
      description: 'Pour les rushes de fin de piscine & nuit de code.',
      badge: 'Booster',
      available: true,
      icon: '⚡'
    },

    // DESSERTS
    {
      id: 'd1',
      name: 'Cookie Pépites de Chocolat',
      category: 'dessert',
      price: 1.50,
      description: 'Fait maison, cœur moelleux et grosses pépites chocolat noir.',
      badge: 'Maison',
      available: true,
      icon: '🍪'
    },
    {
      id: 'd2',
      name: 'Donut Glaçage Nutella',
      category: 'dessert',
      price: 1.60,
      description: 'Donut moelleux généreusement fourré au chocolat noisette.',
      available: true,
      icon: '🍩'
    },
    {
      id: 'd3',
      name: 'Muffin Myrtilles',
      category: 'dessert',
      price: 1.50,
      description: 'Muffin moelleux aux myrtilles sauvages.',
      available: true,
      icon: '🧁'
    },
    {
      id: 'd4',
      name: 'Pomme Bio',
      category: 'dessert',
      price: 0.80,
      description: 'Pomme croquante locale.',
      available: true,
      icon: '🍎'
    },

    // SUPPLEMENTS
    {
      id: 's1',
      name: 'Extra Bacon Croustillant',
      category: 'supplement',
      price: 0.80,
      description: 'Tranches de bacon grillé.',
      available: true,
      icon: '🥓'
    },
    {
      id: 's2',
      name: 'Extra Cheddar Affiné',
      category: 'supplement',
      price: 0.60,
      description: 'Tranche de cheddar supplémentaire.',
      available: true,
      icon: '🧀'
    },
    {
      id: 's3',
      name: 'Sauce Algérienne BDE',
      category: 'supplement',
      price: 0.30,
      description: 'Pot de sauce algérienne relevée.',
      available: true,
      icon: '🌶️'
    }
  ],
  menus: [
    {
      id: 'm1',
      name: 'Formule Cadets (Plat + Boisson)',
      price: 4.50,
      description: 'Le snack parfait entre deux évaluations. Choisissez 1 Plat + 1 Boisson au choix.',
      badge: 'Économique',
      available: true,
      allowedPlats: true,
      allowedBoissons: true,
      allowedDesserts: false,
      icon: '🎯'
    },
    {
      id: 'm2',
      name: 'Formule BDE Complète (Plat + Boisson + Dessert)',
      price: 5.50,
      description: 'La formule incontournable du midi ! 1 Plat + 1 Boisson + 1 Dessert au choix.',
      badge: 'Le + Populaire',
      available: true,
      allowedPlats: true,
      allowedBoissons: true,
      allowedDesserts: true,
      icon: '🏆'
    }
  ],
  orders: [],
  users: []
};

class DB {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        return JSON.parse(raw);
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
      ...product,
      price: parseFloat(product.price) || 0
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
      allowedPlats: true,
      allowedBoissons: true,
      allowedDesserts: menu.allowedDesserts !== false,
      ...menu,
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
