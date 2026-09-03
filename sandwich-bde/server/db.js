// Connexion + schéma SQLite. Un seul fichier, aucune installation de serveur DB requise.
const path = require("path");
const Database = require("better-sqlite3");

const db = new Database(path.join(__dirname, "..", "data.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intra_id INTEGER UNIQUE NOT NULL,
  login TEXT NOT NULL,
  email TEXT,
  full_name TEXT,
  image_url TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('plat','boisson','dessert','supplement')),
  available INTEGER NOT NULL DEFAULT 1,
  image_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS menus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  available INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ce que contient un menu : ex. 1 plat au choix parmi une liste, 1 boisson, etc.
-- "product_id" pointe vers un produit inclus ; plusieurs lignes possibles pour proposer un choix.
CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_id INTEGER NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  slot TEXT NOT NULL DEFAULT 'item' -- ex: 'plat', 'boisson', 'dessert' pour grouper les choix
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','ready','cancelled')),
  pickup_time TEXT, -- créneau de retrait souhaité
  total_cents INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  menu_id INTEGER REFERENCES menus(id),
  label TEXT NOT NULL, -- snapshot du nom au moment de la commande
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL
);
`);

module.exports = db;
