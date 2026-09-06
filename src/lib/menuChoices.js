// Modèle d'une formule : une liste de "groupes de choix".
// Chaque groupe : { id, name, productIds: [] }
//   - name        : libellé défini par l'admin ("Plat", "Boisson", "Accompagnement"...)
//   - productIds   : produits éligibles cochés depuis la liste complète.
//                    Vide => tous les produits disponibles sont proposés.

export function makeGroupId() {
  return 'g_' + Math.random().toString(36).slice(2, 9);
}

// Récupère les groupes d'une formule, en reconstruisant ceux des anciennes
// formules (modèle plat/boisson/dessert) pour rester rétro-compatible.
export function getMenuGroups(menu) {
  if (menu && Array.isArray(menu.groups) && menu.groups.length) {
    return menu.groups;
  }

  const legacy = [];
  if (!menu || menu.allowedPlats !== false) {
    legacy.push({ id: 'g_plat', name: 'Plat', productIds: menu?.platItems || [], category: 'plat' });
  }
  if (!menu || menu.allowedBoissons !== false) {
    legacy.push({ id: 'g_boisson', name: 'Boisson', productIds: menu?.boissonItems || [], category: 'boisson' });
  }
  if (menu && menu.allowedDesserts === true) {
    legacy.push({ id: 'g_dessert', name: 'Dessert', productIds: menu?.dessertItems || [], category: 'dessert' });
  }
  return legacy;
}

// Produits proposés pour un groupe donné.
export function resolveGroupProducts(group, products) {
  if (Array.isArray(group.productIds) && group.productIds.length) {
    return products.filter(product => group.productIds.includes(product.id));
  }
  if (group.category) {
    return products.filter(product => product.category === group.category);
  }
  return products;
}

// Normalise les choix stockés dans une commande vers une liste [{ label, product }].
// Gère l'ancien format objet { plat: {...}, boisson: {...}, dessert: {...} }.
export function normalizeChoices(choices) {
  if (!choices) return [];
  if (Array.isArray(choices)) {
    return choices.filter(entry => entry && entry.product);
  }
  return Object.entries(choices).map(([key, product]) => ({
    label: key.charAt(0).toUpperCase() + key.slice(1),
    product
  }));
}
