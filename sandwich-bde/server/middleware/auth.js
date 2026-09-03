function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Connexion requise" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Connexion requise" });
  }
  if (!req.session.user.is_admin) {
    return res.status(403).json({ error: "Accès réservé aux admins" });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
