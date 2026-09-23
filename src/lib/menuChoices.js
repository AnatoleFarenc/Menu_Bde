// A meal deal's model: a list of "choice groups".
// Chaque groupe : { id, name, productIds: [] }
//   - name        : label set by the admin ("Main", "Drink", "Side"...)
//   - productIds   : eligible products checked from the full list.
//                    Empty => all available products are offered.

export function makeGroupId() {
  return 'g_' + Math.random().toString(36).slice(2, 9);
}

// Gets a meal deal's choice groups, rebuilding those of older meal deals
// (main/drink/dessert model) to stay backward-compatible.
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

// Products offered for a given group.
export function resolveGroupProducts(group, products) {
  if (Array.isArray(group.productIds) && group.productIds.length) {
    return products.filter(product => group.productIds.includes(product.id));
  }
  if (group.category) {
    return products.filter(product => product.category === group.category);
  }
  return products;
}

// Normalizes the choices stored in an order into a [{ label, product }] list.
// Handles the old object format { plat: {...}, boisson: {...}, dessert: {...} }.
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
