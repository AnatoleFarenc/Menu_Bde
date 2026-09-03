const express = require("express");
const crypto = require("crypto");
const fetch = require("node-fetch");
const db = require("../db");

const router = express.Router();

const ADMIN_LOGINS = (process.env.ADMIN_LOGINS || "")
  .split(",")
  .map((l) => l.trim().toLowerCase())
  .filter(Boolean);

// Étape 1 : redirige vers la page d'autorisation de l'intra 42
router.get("/42", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: process.env.FORTYTWO_CLIENT_ID,
    redirect_uri: process.env.FORTYTWO_CALLBACK_URL,
    response_type: "code",
    scope: "public",
    state,
  });

  res.redirect(`https://api.intra.42.fr/oauth/authorize?${params.toString()}`);
});

// Étape 2 : callback -> échange le code contre un token, récupère le profil, crée/loggue l'utilisateur
router.get("/42/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state || state !== req.session.oauthState) {
    return res.status(400).send("Requête OAuth invalide (state incorrect).");
  }
  delete req.session.oauthState;

  try {
    // Échange du code contre un access token
    const tokenRes = await fetch("https://api.intra.42.fr/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: process.env.FORTYTWO_CLIENT_ID,
        client_secret: process.env.FORTYTWO_CLIENT_SECRET,
        code,
        redirect_uri: process.env.FORTYTWO_CALLBACK_URL,
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`Échange du token échoué (${tokenRes.status})`);
    }
    const tokenData = await tokenRes.json();

    // Récupération du profil intra
    const meRes = await fetch("https://api.intra.42.fr/v2/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!meRes.ok) {
      throw new Error(`Récupération du profil échouée (${meRes.status})`);
    }
    const me = await meRes.json();

    const isAdmin = ADMIN_LOGINS.includes((me.login || "").toLowerCase()) ? 1 : 0;

    // Upsert de l'utilisateur
    const existing = db.prepare("SELECT * FROM users WHERE intra_id = ?").get(me.id);
    let user;
    if (existing) {
      db.prepare(
        "UPDATE users SET login = ?, email = ?, full_name = ?, image_url = ?, is_admin = ? WHERE id = ?"
      ).run(
        me.login,
        me.email,
        me.displayname || me.usual_full_name,
        me.image?.link || null,
        isAdmin || existing.is_admin, // une fois admin, on ne rétrograde pas automatiquement
        existing.id
      );
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(existing.id);
    } else {
      const info = db
        .prepare(
          "INSERT INTO users (intra_id, login, email, full_name, image_url, is_admin) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(me.id, me.login, me.email, me.displayname || me.usual_full_name, me.image?.link || null, isAdmin);
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
    }

    req.session.user = {
      id: user.id,
      login: user.login,
      full_name: user.full_name,
      image_url: user.image_url,
      is_admin: !!user.is_admin,
    };

    res.redirect(user.is_admin ? "/admin.html" : "/");
  } catch (err) {
    console.error("Erreur OAuth 42:", err);
    res.status(500).send("Connexion via l'intra 42 impossible. Réessaie plus tard.");
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get("/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

module.exports = router;
