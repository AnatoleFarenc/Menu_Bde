const express = require("express");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// L'utilisateur connecté passe commande.
// body: { pickup_time, note, cart: [{ type: 'product'|'menu', id, quantity }] }
router.post("/", requireAuth, (req, res) => {
  const { pickup_time, note, cart } = req.body;
  if (!Array.isArray(cart) || cart.length === 0) {
    return res.status(400).json({ error: "Panier vide" });
  }

  const lines = [];
  let total = 0;

  for (const entry of cart) {
    const qty = Math.max(1, parseInt(entry.quantity, 10) || 1);
    if (entry.type === "product") {
      const p = db.prepare("SELECT * FROM products WHERE id = ? AND available = 1").get(entry.id);
      if (!p) return res.status(400).json({ error: `Produit ${entry.id} indisponible` });
      lines.push({ product_id: p.id, menu_id: null, label: p.name, quantity: qty, unit_price_cents: p.price_cents });
      total += p.price_cents * qty;
    } else if (entry.type === "menu") {
      const m = db.prepare("SELECT * FROM menus WHERE id = ? AND available = 1").get(entry.id);
      if (!m) return res.status(400).json({ error: `Menu ${entry.id} indisponible` });
      lines.push({ product_id: null, menu_id: m.id, label: m.name, quantity: qty, unit_price_cents: m.price_cents });
      total += m.price_cents * qty;
    } else {
      return res.status(400).json({ error: "Type d'article invalide" });
    }
  }

  const insertOrder = db.prepare(
    "INSERT INTO orders (user_id, pickup_time, note, total_cents) VALUES (?, ?, ?, ?)"
  );
  const orderInfo = insertOrder.run(req.session.user.id, pickup_time || null, note || null, total);
  const orderId = orderInfo.lastInsertRowid;

  const insertItem = db.prepare(
    "INSERT INTO order_items (order_id, product_id, menu_id, label, quantity, unit_price_cents) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const l of lines) {
    insertItem.run(orderId, l.product_id, l.menu_id, l.label, l.quantity, l.unit_price_cents);
  }

  res.status(201).json({ id: orderId, total_cents: total });
});

// Mes commandes
router.get("/mine", requireAuth, (req, res) => {
  const orders = db
    .prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC")
    .all(req.session.user.id);
  for (const o of orders) {
    o.items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(o.id);
  }
  res.json(orders);
});

// Toutes les commandes, pour l'admin qui prépare
router.get("/", requireAdmin, (req, res) => {
  const orders = db
    .prepare(
      `SELECT orders.*, users.login, users.full_name
       FROM orders JOIN users ON users.id = orders.user_id
       ORDER BY orders.pickup_time IS NULL, orders.pickup_time, orders.created_at`
    )
    .all();
  for (const o of orders) {
    o.items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(o.id);
  }
  res.json(orders);
});

router.patch("/:id/status", requireAdmin, (req, res) => {
  const { status } = req.body;
  if (!["pending", "confirmed", "ready", "cancelled"].includes(status)) {
    return res.status(400).json({ error: "Statut invalide" });
  }
  db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
