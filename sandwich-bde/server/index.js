require("dotenv").config();
const path = require("path");
const express = require("express");
const session = require("express-session");

require("./db"); // initialise le schéma au démarrage

const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const menuRoutes = require("./routes/menus");
const orderRoutes = require("./routes/orders");

const app = express();

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 jours
      secure: process.env.NODE_ENV === "production",
    },
  })
);

app.use("/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/menus", menuRoutes);
app.use("/api/orders", orderRoutes);

// Static frontend (vanilla HTML/CSS/JS, pas de build nécessaire)
app.use(express.static(path.join(__dirname, "..", "public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sandwich BDE lancé sur http://localhost:${PORT}`);
});
