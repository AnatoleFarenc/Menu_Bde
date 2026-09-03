const express = require("express");
const db = require("../db");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();
const TYPES = ["plat", "boisson", "dessert", "supplement"];

// Vitrine publique : uniquement les produits disponibles (sauf si ?all=1 et admin)
router.get("/", (req, res) => {
  const showAll = req.query.all === "1" && req.session.user?.is_admin;
  const rows = showAll
    ? db.prepare("SELECT * FROM products ORDER BY type, name").all()
    : db.prepare("SELECT * FROM products WHERE available = 1 ORDER BY type, name").all();
  res.json(rows);
});

router.post("/", requireAdmin, (req, res) => {
  const { name, description, price_cents, type, image_url, available } = req.body;
  if (!name || !price_cents || !TYPES.includes(type)) {
    return res.status(400).json({ error: "Champs invalides (name, price_cents, type requis)" });
  }
  const info = db
    .prepare(
      "INSERT INTO products (name, description, price_cents, type, image_url, available) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(name, description || null, price_cents, type, image_url || null, available === false ? 0 : 1);
  res.status(201).json(db.prepare("SELECT * FROM products WHERE id = ?").get(info.lastInsertRowid));
});

router.put("/:id", requireAdmin, (req, res) => {
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Produit introuvable" });

  const { name, description, price_cents, type, image_url, available } = req.body;
  if (type && !TYPES.includes(type)) return res.status(400).json({ error: "Type invalide" });

  db.prepare(
    `UPDATE products SET name = ?, description = ?, price_cents = ?, type = ?, image_url = ?, available = ?
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    description ?? existing.description,
    price_cents ?? existing.price_cents,
    type ?? existing.type,
    image_url ?? existing.image_url,
    available === undefined ? existing.available : available ? 1 : 0,
    req.params.id
  );
  res.json(db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id));
});

// Retirer un produit de la vitrine sans le supprimer (garde l'historique des commandes valide)
router.patch("/:id/toggle", requireAdmin, (req, res) => {
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Produit introuvable" });
  db.prepare("UPDATE products SET available = ? WHERE id = ?").run(existing.available ? 0 : 1, req.params.id);
  res.json(db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id));
});

router.delete("/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
