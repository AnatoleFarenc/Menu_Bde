const express = require("express");
const db = require("../db");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

function attachItems(menu) {
  menu.items = db
    .prepare(
      `SELECT menu_items.id, menu_items.slot, products.id AS product_id, products.name, products.type
       FROM menu_items JOIN products ON products.id = menu_items.product_id
       WHERE menu_items.menu_id = ?`
    )
    .all(menu.id);
  return menu;
}

router.get("/", (req, res) => {
  const showAll = req.query.all === "1" && req.session.user?.is_admin;
  const rows = showAll
    ? db.prepare("SELECT * FROM menus ORDER BY name").all()
    : db.prepare("SELECT * FROM menus WHERE available = 1 ORDER BY name").all();
  res.json(rows.map(attachItems));
});

// body: { name, description, price_cents, items: [{ product_id, slot }] }
router.post("/", requireAdmin, (req, res) => {
  const { name, description, price_cents, items } = req.body;
  if (!name || !price_cents || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Champs invalides (name, price_cents, items[] requis)" });
  }
  const info = db
    .prepare("INSERT INTO menus (name, description, price_cents) VALUES (?, ?, ?)")
    .run(name, description || null, price_cents);
  const menuId = info.lastInsertRowid;

  const insertItem = db.prepare("INSERT INTO menu_items (menu_id, product_id, slot) VALUES (?, ?, ?)");
  for (const item of items) {
    insertItem.run(menuId, item.product_id, item.slot || "item");
  }
  res.status(201).json(attachItems(db.prepare("SELECT * FROM menus WHERE id = ?").get(menuId)));
});

router.put("/:id", requireAdmin, (req, res) => {
  const existing = db.prepare("SELECT * FROM menus WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Menu introuvable" });

  const { name, description, price_cents, available, items } = req.body;
  db.prepare(
    "UPDATE menus SET name = ?, description = ?, price_cents = ?, available = ? WHERE id = ?"
  ).run(
    name ?? existing.name,
    description ?? existing.description,
    price_cents ?? existing.price_cents,
    available === undefined ? existing.available : available ? 1 : 0,
    req.params.id
  );

  if (Array.isArray(items)) {
    db.prepare("DELETE FROM menu_items WHERE menu_id = ?").run(req.params.id);
    const insertItem = db.prepare("INSERT INTO menu_items (menu_id, product_id, slot) VALUES (?, ?, ?)");
    for (const item of items) insertItem.run(req.params.id, item.product_id, item.slot || "item");
  }

  res.json(attachItems(db.prepare("SELECT * FROM menus WHERE id = ?").get(req.params.id)));
});

router.patch("/:id/toggle", requireAdmin, (req, res) => {
  const existing = db.prepare("SELECT * FROM menus WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Menu introuvable" });
  db.prepare("UPDATE menus SET available = ? WHERE id = ?").run(existing.available ? 0 : 1, req.params.id);
  res.json({ ok: true });
});

router.delete("/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM menus WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
