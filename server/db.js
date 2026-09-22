// Must run before anything reads process.env below: this module's top-level
// code executes during index.js's import of it, which happens before
// index.js's own dotenv.config() call (ES module imports are evaluated
// before the importing module's body runs).
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

const DEFAULT_CATEGORIES = [
  { id: 'plat', name: 'Plat', icon: '🥪', isVisible: true },
  { id: 'boisson', name: 'Boisson', icon: '🥤', isVisible: true },
  { id: 'dessert', name: 'Dessert', icon: '🍩', isVisible: true },
  { id: 'supplement', name: 'Supplément', icon: '🧂', isVisible: true }
];
const PROTECTED_CATEGORY_IDS = ['plat', 'boisson', 'dessert', 'supplement'];

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
}

// ---------------------------------------------------------------------------
// Serialization: Prisma models -> the flat shapes the rest of the
// server (and the frontend) already know, so routes don't need to change.
// ---------------------------------------------------------------------------

function serializeCategory(c) {
  return { id: c.id, name: c.name, icon: c.icon, isVisible: c.isVisible };
}

// isActive is derived: true if any of the event's storefronts is live.
function serializeEvent(e) {
  return {
    id: e.id,
    name: e.name,
    description: e.description,
    status: e.status,
    isActive: (e.storefronts || []).some(sf => sf.isActive),
    startDate: e.startDate ? e.startDate.toISOString() : null,
    endDate: e.endDate ? e.endDate.toISOString() : null,
    createdAt: e.createdAt.toISOString()
  };
}

function serializeStorefront(sf) {
  return {
    id: sf.id,
    eventId: sf.eventId,
    name: sf.name,
    isActive: sf.isActive,
    createdAt: sf.createdAt.toISOString()
  };
}

function serializeShoppingListItem(item) {
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    forDays: item.forDays,
    forPeople: item.forPeople,
    unitCost: item.unitCost,
    totalCost: item.totalCost,
    purchaseLocation: item.purchaseLocation,
    note: item.note,
    bought: item.bought,
    productIds: (item.products || []).map(link => link.productId),
    menuIds: (item.menus || []).map(link => link.menuId),
    stockItemIds: (item.stockItems || []).map(link => link.stockItemId)
  };
}

// ---------------------------------------------------------------------------
// Stock rules -- the single place that decides what a count means. See the
// StockItem / Product model comments in schema.prisma.
// ---------------------------------------------------------------------------

// A brand-new resold article's "low" threshold when nobody set one.
const DEFAULT_SOLD_LOW_THRESHOLD = 5;

// 'untracked' | 'out' | 'low' | 'ok'. A null count is "not tracked": never
// low, never out, never blocks anything.
function stockLevel(si) {
  if (!si || si.stock === null || si.stock === undefined) return 'untracked';
  if (si.stock <= 0) return 'out';
  if (si.lowStockThreshold !== null && si.lowStockThreshold !== undefined && si.stock <= si.lowStockThreshold) return 'low';
  return 'ok';
}

const needsRestock = si => {
  const level = stockLevel(si);
  return level === 'out' || level === 'low';
};

// How much to buy: back up to the article's target ("stock plein") when it
// has one, otherwise to twice its low threshold. Never a fraction of an
// article counted in whole pieces, never less than 0.1 of a measured one.
function restockQuantity(si) {
  const target = si.fullStock !== null && si.fullStock > si.stock
    ? si.fullStock
    : Math.max((si.lowStockThreshold || 0) * 2, si.stock + 1);
  return Math.max(si.unit ? 0.1 : 1, Math.round((target - si.stock) * 10) / 10);
}

// undefined stays undefined (field absent from a payload), blank/garbage
// becomes null (explicitly cleared), anything else a number.
function parseNullable(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

// Whether a product can be sold right now, and why not:
//   resold -- its article's own count.
//   made   -- the worst count among the ingredients that are actually
//             tracked ('out' as soon as one is at 0). Untracked
//             ingredients, and a recipe not written yet, never block.
function productStockStatus(p) {
  if (p.kind === 'resold') return stockLevel(p.stockItem);
  const levels = (p.ingredients || []).map(link => stockLevel(link.stockItem));
  if (levels.includes('out')) return 'out';
  if (levels.includes('low')) return 'low';
  return levels.includes('ok') ? 'ok' : 'untracked';
}

// Identity of "the same product" across storefronts and events (each has its
// own Product row): resold products share their StockItem, a made product
// only has its name.
const productKey = p => (p.stockItemId ? `stock:${p.stockItemId}` : `name:${p.name.trim().toLowerCase()}`);

function serializeStockItem(si) {
  if (!si) return null;
  const item = {
    id: si.id,
    name: si.name,
    unit: si.unit,
    stock: si.stock,
    fullStock: si.fullStock,
    lowStockThreshold: si.lowStockThreshold,
    unitCost: si.unitCost,
    level: stockLevel(si)
  };
  // Only when the usage include was requested (getStockItems): which
  // products sell this article as-is, and which recipes use it. One Product
  // row exists per storefront, so names are deduplicated.
  if (si.soldAs || si.recipeLinks) {
    const names = list => [...new Set(list.map(p => p.name.trim()))].sort((a, b) => a.localeCompare(b));
    item.usedBy = {
      soldAs: names(si.soldAs || []),
      recipes: names((si.recipeLinks || []).map(link => link.product))
    };
  }
  return item;
}

// Stock lives on StockItem, not on Product, so every query that returns a
// product for serialization must `include: productInclude` or its stock and
// recipe come back empty. `available` -- what the storefront, the kitchen
// board and the meal-deal builder all check -- is COMPUTED here (manual
// switch AND not out of stock) rather than stored, so it can never go stale
// after a restock; `enabled` is the manual switch alone.
function serializeProduct(p) {
  if (!p) return null;
  const status = productStockStatus(p);
  const resold = p.kind === 'resold';
  return {
    id: p.id,
    name: p.name,
    category: p.categoryId,
    kind: p.kind,
    price: p.price,
    extraMenuPrice: p.extraMenuPrice,
    costPrice: p.costPrice,
    description: p.description,
    badge: p.badge,
    icon: p.icon,
    enabled: p.enabled,
    stockStatus: status,
    available: p.enabled && status !== 'out',
    // Resold: the article it sells (its count is the product's count).
    stockItemId: resold ? p.stockItemId : null,
    stock: resold && p.stockItem ? p.stockItem.stock : null,
    fullStock: resold && p.stockItem ? p.stockItem.fullStock : null,
    lowStockThreshold: resold && p.stockItem ? p.stockItem.lowStockThreshold : null,
    // Made: the recipe, each ingredient with its own current level.
    ingredients: resold ? [] : (p.ingredients || []).map(link => ({
      stockItemId: link.stockItemId,
      name: link.stockItem.name,
      unit: link.stockItem.unit,
      quantity: link.quantity,
      stock: link.stockItem.stock,
      level: stockLevel(link.stockItem)
    })).sort((a, b) => a.name.localeCompare(b.name))
  };
}

function serializeMenu(m) {
  return {
    id: m.id,
    name: m.name,
    price: m.price,
    description: m.description,
    badge: m.badge,
    available: m.available,
    icon: m.icon,
    groups: (m.groups || [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(group => ({
        id: group.id,
        name: group.name,
        productIds: (group.products || []).map(link => link.productId)
      }))
  };
}

function serializeOrder(o) {
  const order = {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    isPaid: o.isPaid,
    isFree: o.isFree,
    userId: o.userId,
    userLogin: o.userLogin,
    userDisplayName: o.userDisplayName,
    pickupTime: o.pickupTime,
    note: o.note,
    totalPrice: o.totalPrice,
    createdAt: o.createdAt.toISOString(),
    items: (o.items || []).map(item => {
      const serialized = {
        id: item.refId,
        type: item.type,
        name: item.name,
        category: item.category || undefined,
        price: item.price,
        costPrice: item.costPrice,
        quantity: item.quantity
      };
      if (item.type === 'menu') serialized.menuId = item.refId;
      if (item.choices && item.choices.length) {
        serialized.choices = item.choices.map(choice => ({
          label: choice.groupName,
          product: { id: choice.productId, name: choice.productName, costPrice: choice.costPrice }
        }));
      }
      return serialized;
    })
  };
  if (o.reviewRating !== null && o.reviewRating !== undefined) {
    order.review = {
      rating: o.reviewRating,
      comment: o.reviewComment || '',
      createdAt: o.reviewCreatedAt.toISOString()
    };
  }
  return order;
}

// Builds the Prisma "items: { create: [...] }" input from a flat-format
// items array (the one sent by the cart / admin editing).
function buildOrderItemsInput(items) {
  return {
    create: (items || []).map(item => ({
      type: item.type || 'product',
      refId: item.type === 'menu' ? (item.menuId || item.id) : item.id,
      name: item.name || '',
      category: item.category || null,
      price: parseFloat(item.price) || 0,
      costPrice: (item.costPrice === undefined || item.costPrice === null) ? null : parseFloat(item.costPrice),
      quantity: parseInt(item.quantity, 10) || 1,
      choices: {
        create: extractChoices(item)
      }
    }))
  };
}

function extractChoices(item) {
  if (!item.choices) return [];
  const entries = Array.isArray(item.choices) ? item.choices : Object.values(item.choices);
  return entries
    .filter(entry => entry && entry.product)
    .map(entry => ({
      groupName: entry.label || '',
      productId: entry.product.id,
      productName: entry.product.name || '',
      costPrice: (entry.product.costPrice === undefined || entry.product.costPrice === null) ? null : parseFloat(entry.product.costPrice)
    }));
}

const orderInclude = { items: { include: { choices: true } } };
const productInclude = { stockItem: true, ingredients: { include: { stockItem: true } } };
const stockItemUsageInclude = {
  soldAs: { select: { name: true } },
  recipeLinks: { include: { product: { select: { name: true } } } }
};
const menuInclude = { groups: { include: { products: true } } };

// Copies one storefront's full catalog (products, meal deals, shopping list)
// into a brand new storefront under targetEventId. Used both by "duplicate
// this event" (once per source storefront) and, later, by a per-storefront
// duplicate action.
async function copyStorefront(sourceStorefrontId, targetEventId, name) {
  const newStorefront = await prisma.storefront.create({
    data: { eventId: targetEventId, name, isActive: false }
  });

  const [sourceProducts, sourceMenus, sourceShoppingList] = await Promise.all([
    prisma.product.findMany({ where: { storefrontId: sourceStorefrontId }, include: { ingredients: true } }),
    prisma.menu.findMany({ where: { storefrontId: sourceStorefrontId }, include: menuInclude }),
    prisma.shoppingListItem.findMany({ where: { storefrontId: sourceStorefrontId }, include: { products: true, menus: true, stockItems: true } })
  ]);

  const idMap = new Map(); // source product id -> new product id
  const menuIdMap = new Map(); // source menu id -> new menu id
  for (const product of sourceProducts) {
    const copy = await prisma.product.create({
      data: {
        storefrontId: newStorefront.id,
        name: product.name,
        categoryId: product.categoryId,
        price: product.price,
        extraMenuPrice: product.extraMenuPrice,
        costPrice: product.costPrice,
        kind: product.kind,
        // StockItem is global (one count for the whole app), so a copy keeps
        // pointing at the very same article -- and, for a made product, at
        // the very same ingredients: nothing to remap.
        stockItemId: product.stockItemId,
        ingredients: { create: product.ingredients.map(({ stockItemId, quantity }) => ({ stockItemId, quantity })) },
        description: product.description,
        badge: product.badge,
        enabled: product.enabled,
        icon: product.icon
      }
    });
    idMap.set(product.id, copy.id);
  }

  for (const menu of sourceMenus) {
    const menuCopy = await prisma.menu.create({
      data: {
        storefrontId: newStorefront.id,
        name: menu.name,
        price: menu.price,
        description: menu.description,
        badge: menu.badge,
        available: menu.available,
        icon: menu.icon
      }
    });
    menuIdMap.set(menu.id, menuCopy.id);
    const groups = (menu.groups || []).slice().sort((a, b) => a.position - b.position);
    for (const [index, group] of groups.entries()) {
      const remappedProductIds = (group.products || []).map(link => idMap.get(link.productId)).filter(Boolean);
      await prisma.menuGroup.create({
        data: {
          menuId: menuCopy.id,
          name: group.name,
          position: index,
          products: { create: remappedProductIds.map(productId => ({ productId })) }
        }
      });
    }
  }

  if (sourceShoppingList.length > 0) {
    const newTrip = await prisma.shoppingTrip.create({ data: { storefrontId: newStorefront.id, closedAt: null } });
    for (const item of sourceShoppingList) {
      const remappedProductIds = item.products.map(link => idMap.get(link.productId)).filter(Boolean);
      const remappedMenuIds = item.menus.map(link => menuIdMap.get(link.menuId)).filter(Boolean);
      // StockItem is global (not per-storefront, see its model comment), so
      // a link to one needs no remapping -- the same ingredient row.
      const stockItemIds = item.stockItems.map(link => link.stockItemId);
      await prisma.shoppingListItem.create({
        data: {
          storefrontId: newStorefront.id,
          tripId: newTrip.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          forDays: item.forDays,
          forPeople: item.forPeople,
          unitCost: item.unitCost,
          totalCost: item.totalCost,
          purchaseLocation: item.purchaseLocation,
          note: item.note,
          products: { create: remappedProductIds.map(productId => ({ productId })) },
          menus: { create: remappedMenuIds.map(menuId => ({ menuId })) },
          stockItems: { create: stockItemIds.map(stockItemId => ({ stockItemId })) }
        }
      });
    }
  }

  return newStorefront;
}

class DB {
  constructor() {
    this.ready = Promise.all([this._ensureDefaultCategories(), this._ensureActiveStorefront()]);
  }

  async _ensureDefaultCategories() {
    const count = await prisma.category.count();
    if (count > 0) return;
    for (const category of DEFAULT_CATEGORIES) {
      await prisma.category.create({ data: category });
    }
  }

  // A brand new install has no events yet, but every product/menu/order
  // needs a storefront to attach to. Create a starter event + active
  // storefront so the app never gets stuck with nowhere to put a new product.
  async _ensureActiveStorefront() {
    const count = await prisma.event.count();
    if (count > 0) return;
    const event = await prisma.event.create({ data: { name: 'New event' } });
    await prisma.storefront.create({ data: { eventId: event.id, name: 'Storefront', isActive: true } });
  }

  async _getActiveStorefront() {
    const storefront = await prisma.storefront.findFirst({ where: { isActive: true } });
    if (!storefront) throw new Error('No active storefront: this should never happen after _ensureActiveStorefront().');
    return storefront;
  }

  // CATEGORIES
  async getCategories() {
    const categories = await prisma.category.findMany();
    return categories.map(serializeCategory);
  }

  async getPublicProducts() {
    const activeStorefront = await this._getActiveStorefront();
    const products = await prisma.product.findMany({
      where: { storefrontId: activeStorefront.id, category: { isVisible: true } },
      include: productInclude
    });
    return products.map(serializeProduct);
  }

  async getPublicMenus() {
    const activeStorefront = await this._getActiveStorefront();
    return this.getMenus(activeStorefront.id);
  }

  async addCategory(category) {
    const id = category.id || slugify(category.name);
    if (!id) return null;
    const existing = await prisma.category.findUnique({ where: { id } });
    if (existing) return null;
    const created = await prisma.category.create({
      data: { id, name: category.name.trim(), icon: category.icon || '📦', isVisible: true }
    });
    return serializeCategory(created);
  }

  async deleteCategory(id) {
    if (PROTECTED_CATEGORY_IDS.includes(id)) return false;
    const productsUsingIt = await prisma.product.count({ where: { categoryId: id } });
    if (productsUsingIt > 0) return false;
    await prisma.category.delete({ where: { id } }).catch(() => null);
    return true;
  }

  async toggleCategoryVisibility(id) {
    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) return null;
    const updated = await prisma.category.update({
      where: { id },
      data: { isVisible: !category.isVisible }
    });
    return serializeCategory(updated);
  }

  // EVENTS
  // An event is a dated project; it holds one or more storefronts (see
  // below). isActive on the serialized event is derived from its storefronts.
  async getActiveStorefront() {
    return serializeStorefront(await this._getActiveStorefront());
  }

  async getEvents() {
    const events = await prisma.event.findMany({
      include: { storefronts: { select: { isActive: true } } },
      orderBy: { createdAt: 'desc' }
    });
    return events.map(serializeEvent);
  }

  async getEventById(id) {
    const event = await prisma.event.findUnique({ where: { id }, include: { storefronts: { select: { isActive: true } } } });
    return event ? serializeEvent(event) : null;
  }

  // Creates a new event. If copyFromEventId is given, every storefront of
  // that source event is duplicated (fresh ids, full catalog + shopping
  // list copy) into the new event; otherwise a single blank storefront is
  // created so there's always somewhere to add products right away.
  async createEvent(eventData) {
    const created = await prisma.event.create({
      data: {
        name: eventData.name.trim(),
        description: eventData.description || '',
        startDate: eventData.startDate ? new Date(eventData.startDate) : null,
        endDate: eventData.endDate ? new Date(eventData.endDate) : null
      }
    });

    if (eventData.copyFromEventId) {
      const sourceStorefronts = await prisma.storefront.findMany({ where: { eventId: eventData.copyFromEventId } });
      for (const source of sourceStorefronts) {
        await copyStorefront(source.id, created.id, source.name);
      }
    } else {
      await prisma.storefront.create({ data: { eventId: created.id, name: 'Vitrine principale', isActive: false } });
    }

    return this.getEventById(created.id);
  }

  async updateEvent(id, updates) {
    const existing = await prisma.event.findUnique({ where: { id } });
    if (!existing) return null;
    const data = {};
    if (updates.name !== undefined) data.name = updates.name.trim();
    if (updates.description !== undefined) data.description = updates.description;
    if (updates.status !== undefined) data.status = updates.status;
    if (updates.startDate !== undefined) data.startDate = updates.startDate ? new Date(updates.startDate) : null;
    if (updates.endDate !== undefined) data.endDate = updates.endDate ? new Date(updates.endDate) : null;
    await prisma.event.update({ where: { id }, data });
    return this.getEventById(id);
  }

  // Refuses to delete an event with a live storefront, or one that still has
  // orders anywhere (protected at the database level too, via the
  // Order.storefrontId FK -- deleting cascades to storefronts/products/menus
  // but is blocked outright if any of them still has orders).
  async deleteEvent(id) {
    const event = await this.getEventById(id);
    if (!event) return false;
    if (event.isActive) return false;
    await prisma.event.delete({ where: { id } }).catch(() => null);
    return !(await prisma.event.findUnique({ where: { id } }));
  }

  // STOREFRONTS
  // One catalog + order stream within an event (e.g. "Petit-déjeuner" and
  // "Déjeuner" for the same event). Exactly one storefront across the whole
  // app is active at a time -- that's what students see and order from.
  async getStorefronts(eventId) {
    const storefronts = await prisma.storefront.findMany({ where: { eventId }, orderBy: { createdAt: 'asc' } });
    return storefronts.map(serializeStorefront);
  }

  async getStorefrontById(id) {
    const storefront = await prisma.storefront.findUnique({ where: { id } });
    return storefront ? serializeStorefront(storefront) : null;
  }

  async createStorefront(eventId, data) {
    const created = await prisma.storefront.create({
      data: { eventId, name: data.name.trim(), isActive: false }
    });
    return serializeStorefront(created);
  }

  async updateStorefront(id, updates) {
    const existing = await prisma.storefront.findUnique({ where: { id } });
    if (!existing) return null;
    const data = {};
    if (updates.name !== undefined) data.name = updates.name.trim();
    const updated = await prisma.storefront.update({ where: { id }, data });
    return serializeStorefront(updated);
  }

  // Switches the live catalog to this storefront. Nothing is destroyed: the
  // previously active storefront and its full order history stay intact,
  // just no longer shown to students. Bumps the storefront's event from
  // "upcoming" to "ongoing" -- going live means it's actually happening now.
  async setActiveStorefront(id) {
    const target = await prisma.storefront.findUnique({ where: { id }, include: { event: true } });
    if (!target) return null;
    const eventUpdates = target.event.status === 'upcoming' ? { status: 'ongoing' } : {};
    await prisma.$transaction([
      prisma.storefront.updateMany({ where: { isActive: true }, data: { isActive: false } }),
      prisma.storefront.update({ where: { id }, data: { isActive: true } }),
      ...(Object.keys(eventUpdates).length ? [prisma.event.update({ where: { id: target.eventId }, data: eventUpdates })] : [])
    ]);
    return serializeStorefront({ ...target, isActive: true });
  }

  // Refuses to delete the active storefront, the last remaining storefront
  // of its event (an event must always keep at least one), or one that
  // still has orders (protected at the database level via the FK too).
  async deleteStorefront(id) {
    const storefront = await prisma.storefront.findUnique({ where: { id } });
    if (!storefront) return false;
    if (storefront.isActive) return false;
    const siblingCount = await prisma.storefront.count({ where: { eventId: storefront.eventId } });
    if (siblingCount <= 1) return false;
    await prisma.storefront.delete({ where: { id } }).catch(() => null);
    return !(await prisma.storefront.findUnique({ where: { id } }));
  }

  async duplicateStorefront(id, name) {
    const source = await prisma.storefront.findUnique({ where: { id } });
    if (!source) return null;
    const created = await copyStorefront(id, source.eventId, name);
    return serializeStorefront(created);
  }

  // SHOPPING LIST -- one storefront's resource list ("what we bought to run
  // this"), so another team can rebuild it later. Every field but name is
  // optional: the info isn't always known.
  //
  // Items belong to a ShoppingTrip (Courses tab): getShoppingList and
  // addShoppingListItem always operate on the current OPEN trip, created
  // lazily on first use. closeShoppingTrip freezes it into history and the
  // next item added opens a fresh one. Exactly one open trip per
  // storefront at a time.
  async getOrCreateOpenTrip(storefrontId) {
    const open = await prisma.shoppingTrip.findFirst({ where: { storefrontId, closedAt: null } });
    if (open) return open;
    return prisma.shoppingTrip.create({ data: { storefrontId, closedAt: null } });
  }

  async getShoppingList(storefrontId) {
    const trip = await this.getOrCreateOpenTrip(storefrontId);
    const items = await prisma.shoppingListItem.findMany({
      where: { tripId: trip.id },
      include: { products: true, menus: true, stockItems: true },
      orderBy: { createdAt: 'asc' }
    });
    return items.map(serializeShoppingListItem);
  }

  async closeShoppingTrip(storefrontId) {
    const trip = await prisma.shoppingTrip.findFirst({
      where: { storefrontId, closedAt: null },
      include: { items: { include: { products: true, stockItems: true } } }
    });
    if (!trip) return null;

    // Restock: a bought item linked to EXACTLY one StockItem (an
    // ingredient, e.g. "Jambon") adds its quantity straight to that
    // ingredient's stock -- an unset (null) stock is treated as 0 and
    // initialized, since for StockItem null just means "not counted yet",
    // not "deliberately untracked" (there's no illimité toggle for
    // ingredients like there is for products). Its unitCost is refreshed
    // from this purchase every time (not just backfilled once): a real
    // price just paid is a better number than whatever was there before,
    // and prices drift -- unlike fullStock/lowStockThreshold, which are a
    // deliberate policy choice a purchase should never silently overwrite.
    // The Courses checklist only ever asks for a line's total cost, not a
    // per-unit one, so it's derived from totalCost/quantity when there's
    // no unitCost directly on the item. A bought item linked to exactly one
    // catalog Product instead (something bought as-is, e.g. a canned
    // drink) adds it to the count of the article that product sells --
    // there, null stock DOES mean deliberately untracked/illimité, so it's
    // left alone. An item linked to several things of either kind is skipped:
    // there's no quantified recipe saying how much of a multi-linked
    // article goes to each one, so guessing would just be wrong. An item
    // with NO link at all still isn't skipped -- it get-or-creates a
    // StockItem by name, so a purchase is never silently dropped from
    // stock tracking just because nobody pre-registered it as an
    // ingredient (the whole point of this close is a complete stock
    // picture, not a partial one).
    const restocked = [];
    for (const item of trip.items) {
      if (!item.bought || item.quantity == null) continue;
      const purchaseUnitCost = item.unitCost ?? (item.totalCost != null && item.quantity > 0 ? item.totalCost / item.quantity : null);

      if (item.stockItems.length === 1) {
        const stockItemId = item.stockItems[0].stockItemId;
        const stockItem = await prisma.stockItem.findUnique({ where: { id: stockItemId } });
        if (!stockItem) continue;
        const newStock = (stockItem.stock ?? 0) + item.quantity;
        const data = { stock: newStock };
        if (purchaseUnitCost != null) data.unitCost = Math.round(purchaseUnitCost * 100) / 100;
        await prisma.stockItem.update({ where: { id: stockItemId }, data });
        if (data.unitCost !== undefined) await this.recomputeProductsUsingStockItem(stockItemId);
        restocked.push({ stockItemId, name: stockItem.name, added: item.quantity, newStock });
        continue;
      }

      if (item.products.length === 1) {
        const productId = item.products[0].productId;
        const product = await prisma.product.findUnique({ where: { id: productId }, include: { stockItem: true } });
        const article = product && product.kind === 'resold' ? product.stockItem : null;
        if (!article || article.stock === null) continue;
        const newStock = article.stock + item.quantity;
        await prisma.stockItem.update({ where: { id: article.id }, data: { stock: newStock } });
        restocked.push({ stockItemId: article.id, name: article.name, productId, productName: product.name, added: item.quantity, newStock });
        continue;
      }

      if (item.stockItems.length === 0 && item.products.length === 0) {
        const { item: stockItem, created } = await this.getOrCreateStockItem(item.name, item.unit);
        const newStock = (stockItem.stock ?? 0) + item.quantity;
        const data = { stock: newStock };
        if (stockItem.unit == null && item.unit) data.unit = item.unit;
        if (purchaseUnitCost != null) data.unitCost = Math.round(purchaseUnitCost * 100) / 100;
        if (created) {
          // Same rule of thumb as the manual "Ajouter un ingrédient" form:
          // stock plein = what was just bought, seuil bas = a quarter of
          // it -- so a freshly-discovered ingredient is immediately
          // eligible for restock suggestions instead of invisible until
          // someone fills these in by hand.
          data.fullStock = newStock;
          data.lowStockThreshold = Math.max(0.1, Math.round((newStock / 4) * 10) / 10);
        }
        await prisma.stockItem.update({ where: { id: stockItem.id }, data });
        if (data.unitCost !== undefined) await this.recomputeProductsUsingStockItem(stockItem.id);
        await prisma.shoppingListItemStockItem.upsert({
          where: { shoppingListItemId_stockItemId: { shoppingListItemId: item.id, stockItemId: stockItem.id } },
          create: { shoppingListItemId: item.id, stockItemId: stockItem.id },
          update: {}
        });
        restocked.push({ stockItemId: stockItem.id, name: stockItem.name, added: item.quantity, newStock });
      }
    }

    const updated = await prisma.shoppingTrip.update({ where: { id: trip.id }, data: { closedAt: new Date() } });
    return { id: updated.id, closedAt: updated.closedAt.toISOString(), restocked };
  }

  async getShoppingTripHistory(storefrontId) {
    const trips = await prisma.shoppingTrip.findMany({
      where: { storefrontId, closedAt: { not: null } },
      orderBy: { closedAt: 'desc' },
      include: { items: { include: { products: true, menus: true, stockItems: true }, orderBy: { createdAt: 'asc' } } }
    });
    return trips.map(trip => ({
      id: trip.id,
      createdAt: trip.createdAt.toISOString(),
      closedAt: trip.closedAt.toISOString(),
      items: trip.items.map(serializeShoppingListItem),
      total: trip.items.reduce((sum, it) => sum + (it.totalCost || 0), 0)
    }));
  }

  async addShoppingListItem(storefrontId, item) {
    const trip = await this.getOrCreateOpenTrip(storefrontId);
    const created = await prisma.shoppingListItem.create({
      data: {
        storefrontId,
        tripId: trip.id,
        name: item.name.trim(),
        quantity: item.quantity === '' || item.quantity === undefined || item.quantity === null ? null : parseFloat(item.quantity),
        unit: item.unit || null,
        forDays: item.forDays === '' || item.forDays === undefined || item.forDays === null ? null : parseInt(item.forDays, 10),
        forPeople: item.forPeople === '' || item.forPeople === undefined || item.forPeople === null ? null : parseInt(item.forPeople, 10),
        unitCost: item.unitCost === '' || item.unitCost === undefined || item.unitCost === null ? null : parseFloat(item.unitCost),
        totalCost: item.totalCost === '' || item.totalCost === undefined || item.totalCost === null ? null : parseFloat(item.totalCost),
        purchaseLocation: item.purchaseLocation || null,
        note: item.note || null,
        bought: !!item.bought,
        products: { create: (item.productIds || []).map(productId => ({ productId })) },
        menus: { create: (item.menuIds || []).map(menuId => ({ menuId })) },
        stockItems: { create: (item.stockItemIds || []).map(stockItemId => ({ stockItemId })) }
      },
      include: { products: true, menus: true, stockItems: true }
    });
    return serializeShoppingListItem(created);
  }

  async updateShoppingListItem(id, updates) {
    const existing = await prisma.shoppingListItem.findUnique({ where: { id } });
    if (!existing) return null;

    const data = {};
    if (updates.name !== undefined) data.name = updates.name.trim();
    if (updates.quantity !== undefined) data.quantity = (updates.quantity === '' || updates.quantity === null) ? null : parseFloat(updates.quantity);
    if (updates.unit !== undefined) data.unit = updates.unit || null;
    if (updates.forDays !== undefined) data.forDays = (updates.forDays === '' || updates.forDays === null) ? null : parseInt(updates.forDays, 10);
    if (updates.forPeople !== undefined) data.forPeople = (updates.forPeople === '' || updates.forPeople === null) ? null : parseInt(updates.forPeople, 10);
    if (updates.unitCost !== undefined) data.unitCost = (updates.unitCost === '' || updates.unitCost === null) ? null : parseFloat(updates.unitCost);
    if (updates.totalCost !== undefined) data.totalCost = (updates.totalCost === '' || updates.totalCost === null) ? null : parseFloat(updates.totalCost);
    if (updates.purchaseLocation !== undefined) data.purchaseLocation = updates.purchaseLocation || null;
    if (updates.note !== undefined) data.note = updates.note || null;
    if (updates.bought !== undefined) data.bought = !!updates.bought;

    if (updates.productIds !== undefined) {
      await prisma.shoppingListItemProduct.deleteMany({ where: { shoppingListItemId: id } });
      data.products = { create: (updates.productIds || []).map(productId => ({ productId })) };
    }
    if (updates.menuIds !== undefined) {
      await prisma.shoppingListItemMenu.deleteMany({ where: { shoppingListItemId: id } });
      data.menus = { create: (updates.menuIds || []).map(menuId => ({ menuId })) };
    }
    if (updates.stockItemIds !== undefined) {
      await prisma.shoppingListItemStockItem.deleteMany({ where: { shoppingListItemId: id } });
      data.stockItems = { create: (updates.stockItemIds || []).map(stockItemId => ({ stockItemId })) };
    }

    const updated = await prisma.shoppingListItem.update({ where: { id }, data, include: { products: true, menus: true, stockItems: true } });
    return serializeShoppingListItem(updated);
  }

  async deleteShoppingListItem(id) {
    await prisma.shoppingListItem.delete({ where: { id } }).catch(() => null);
  }

  // ---------------------------------------------------------------------
  // PRODUCTS -- storefrontId is explicit: any storefront's catalog can be
  // browsed and edited from its own page, not just the active (live) one.
  // A product is `made` (recipe of StockItems) or `resold` (one StockItem
  // sold as-is) -- see the Product model comment in schema.prisma, and
  // serializeProduct for how availability is derived from the counts.
  // ---------------------------------------------------------------------
  async getProducts(storefrontId) {
    const products = await prisma.product.findMany({ where: { storefrontId }, include: productInclude });
    return products.map(serializeProduct);
  }

  async getProductById(id) {
    const product = await prisma.product.findUnique({ where: { id }, include: productInclude });
    return serializeProduct(product);
  }

  // Scalar catalog fields shared by add and update; only what the payload
  // actually carries is returned, so update never clobbers an untouched field.
  _productFields(input) {
    const data = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.category !== undefined) data.categoryId = input.category;
    if (input.description !== undefined) data.description = input.description || '';
    if (input.badge !== undefined) data.badge = input.badge || '';
    if (input.icon !== undefined) data.icon = input.icon;
    if (input.enabled !== undefined) data.enabled = !!input.enabled;
    if (input.price !== undefined) data.price = parseFloat(input.price) || 0;
    if (input.extraMenuPrice !== undefined) data.extraMenuPrice = parseFloat(input.extraMenuPrice) || 0;
    return data;
  }

  // The StockItem a `resold` product sells: the one picked explicitly, else
  // the one matching the product's name (created if this is a new name).
  // The stock/threshold/target/cost in the payload describe THAT article --
  // every product (in any storefront) selling it sees the change. On add
  // (`keepExisting`), an article that already existed keeps any number the
  // form left blank instead of having it wiped by an empty field; on
  // update, blank stock means "stop tracking" and is applied as such.
  async _resolveSoldArticle(input, fallbackName, { keepExisting }) {
    let article = input.stockItemId ? await prisma.stockItem.findUnique({ where: { id: input.stockItemId } }) : null;
    let created = false;
    if (!article) ({ item: article, created } = await this.getOrCreateStockItem(fallbackName));

    const numbers = {
      stock: parseNullable(input.stock),
      fullStock: parseNullable(input.fullStock),
      lowStockThreshold: parseNullable(input.lowStockThreshold),
      unitCost: parseNullable(input.costPrice)
    };
    const data = {};
    for (const [key, value] of Object.entries(numbers)) {
      if (value === undefined) continue;
      if (value === null && keepExisting && !created) continue;
      data[key] = value;
    }
    // A brand-new article starts with the usual "low at 5" threshold.
    if (created && data.lowStockThreshold == null) data.lowStockThreshold = DEFAULT_SOLD_LOW_THRESHOLD;
    if (Object.keys(data).length > 0) article = await prisma.stockItem.update({ where: { id: article.id }, data });
    return article;
  }

  async addProduct(product, storefrontId) {
    const kind = product.kind === 'resold' ? 'resold' : 'made';
    const article = kind === 'resold' ? await this._resolveSoldArticle(product, product.name, { keepExisting: true }) : null;

    const created = await prisma.product.create({
      data: {
        ...this._productFields({ ...product, enabled: true }),
        storefrontId,
        costPrice: kind === 'made' ? parseNullable(product.costPrice) ?? null : null,
        kind,
        stockItemId: article ? article.id : null,
        icon: product.icon || '🥪'
      }
    });

    if (kind === 'made') await this.setProductRecipe(created.id, product.ingredients);
    else await this.recomputeProductCost(created.id);
    if (article) await this._autoAddSafely([article.id], storefrontId);
    return this.getProductById(created.id);
  }

  async updateProduct(id, updates) {
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) return null;

    const data = this._productFields(updates);
    // Legacy clients still send `available` for the manual switch.
    if (updates.available !== undefined && updates.enabled === undefined) data.enabled = !!updates.available;

    const kind = updates.kind !== undefined ? (updates.kind === 'resold' ? 'resold' : 'made') : existing.kind;
    data.kind = kind;

    let article = null;
    if (kind === 'resold') {
      article = await this._resolveSoldArticle(
        { ...updates, stockItemId: updates.stockItemId !== undefined ? updates.stockItemId : existing.stockItemId },
        data.name ?? existing.name,
        { keepExisting: false }
      );
      data.stockItemId = article.id;
      data.costPrice = null; // derived from the article, see recomputeProductCost
    } else {
      data.stockItemId = null;
      if (updates.costPrice !== undefined) data.costPrice = parseNullable(updates.costPrice);
    }

    await prisma.product.update({ where: { id }, data });

    if (kind === 'made') {
      // Going resold -> made without a recipe in the payload just starts an empty one.
      if (updates.ingredients !== undefined || existing.kind !== 'made') await this.setProductRecipe(id, updates.ingredients);
    } else {
      await prisma.productIngredient.deleteMany({ where: { productId: id } });
      await this.recomputeProductCost(id);
      // Now that its number(s) may have changed, its siblings' derived cost too.
      await this.recomputeProductsUsingStockItem(article.id);
    }
    if (article) await this._autoAddSafely([article.id], existing.storefrontId);
    return this.getProductById(id);
  }

  async deleteProduct(id) {
    await prisma.product.delete({ where: { id } }).catch(() => null);
  }

  // The manual on/off switch (Product.enabled). It can't bring back a
  // product that's out of stock: `available` stays false until the count
  // does, whatever this says.
  async toggleProductStock(id) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return null;
    await prisma.product.update({ where: { id }, data: { enabled: !product.enabled } });
    return this.getProductById(id);
  }

  // ---------------------------------------------------------------------
  // STOCK ITEMS -- every physical thing the BDE keeps a count of. See the
  // StockItem model comment in schema.prisma. Counts only ever change by
  // hand (here), by a shopping trip (closeShoppingTrip), or -- for a
  // `resold` product only -- by its own sales (_adjustStock).
  // ---------------------------------------------------------------------

  // `created` tells the caller whether this is a brand-new StockItem (so it
  // can seed fullStock/lowStockThreshold from the purchase that revealed
  // it -- see closeShoppingTrip) as opposed to one that already existed and
  // has been configured. Matched by trimmed/lowercased name.
  async getOrCreateStockItem(name, unit) {
    const normalizedName = name.trim().toLowerCase();
    const existing = await prisma.stockItem.findUnique({ where: { normalizedName } });
    if (existing) return { item: existing, created: false };
    const created = await prisma.stockItem.create({ data: { name: name.trim(), normalizedName, unit: unit || null } });
    return { item: created, created: true };
  }

  async getStockItems() {
    const items = await prisma.stockItem.findMany({
      orderBy: { name: 'asc' },
      include: stockItemUsageInclude
    });
    return items.map(serializeStockItem);
  }

  // Validation problems are returned, not thrown: the `ah` wrapper in
  // index.js turns any thrown error into a 500.
  async addStockItem(data, storefrontId) {
    const normalizedName = data.name.trim().toLowerCase();
    if (await prisma.stockItem.findUnique({ where: { normalizedName } })) return null;
    const created = await prisma.stockItem.create({
      data: {
        name: data.name.trim(),
        normalizedName,
        unit: data.unit || null,
        stock: parseNullable(data.stock) ?? null,
        fullStock: parseNullable(data.fullStock) ?? null,
        lowStockThreshold: parseNullable(data.lowStockThreshold) ?? null,
        unitCost: parseNullable(data.unitCost) ?? null
      },
      include: stockItemUsageInclude
    });
    await this._autoAddSafely([created.id], storefrontId);
    return serializeStockItem(created);
  }

  async updateStockItem(id, updates, storefrontId) {
    const existing = await prisma.stockItem.findUnique({ where: { id } });
    if (!existing) return { error: 'not_found' };

    const data = {};
    if (updates.name !== undefined) {
      data.name = updates.name.trim();
      data.normalizedName = data.name.toLowerCase();
      const clash = await prisma.stockItem.findUnique({ where: { normalizedName: data.normalizedName } });
      if (clash && clash.id !== id) return { error: 'duplicate' };
    }
    if (updates.unit !== undefined) data.unit = updates.unit || null;
    for (const key of ['stock', 'fullStock', 'lowStockThreshold', 'unitCost']) {
      if (updates[key] !== undefined) data[key] = parseNullable(updates[key]);
    }

    const updated = await prisma.stockItem.update({ where: { id }, data, include: stockItemUsageInclude });
    if (data.unitCost !== undefined) await this.recomputeProductsUsingStockItem(id);
    if (data.stock !== undefined || data.lowStockThreshold !== undefined || data.fullStock !== undefined) {
      await this._autoAddSafely([id], storefrontId);
    }
    return { item: serializeStockItem(updated) };
  }

  // Refused while any product still needs it: a recipe silently losing an
  // ingredient (and its cost) or a resold product losing what it sells is
  // never what a delete click meant.
  async deleteStockItem(id) {
    const item = await prisma.stockItem.findUnique({ where: { id }, include: stockItemUsageInclude });
    if (!item) return { error: 'not_found' };
    const usage = serializeStockItem(item).usedBy;
    const usedBy = [...new Set([...usage.soldAs, ...usage.recipes])];
    if (usedBy.length > 0) return { error: 'in_use', usedBy };
    await prisma.stockItem.delete({ where: { id } });
    return { ok: true };
  }

  // A product's costPrice is DERIVED from its stock wherever there is
  // something to derive it from -- a made product from its recipe (sum of
  // each ingredient's unitCost * quantity), a resold one from its article's
  // unitCost -- so margins/profit stats reflect a real cost rather than a
  // guess. With nothing to derive from (empty recipe, no unit costs) the
  // hand-entered costPrice is left alone. Called after every recipe edit
  // and after any StockItem's unitCost changes.
  async recomputeProductCost(productId) {
    const product = await prisma.product.findUnique({ where: { id: productId }, include: productInclude });
    if (!product) return;
    let costPrice = null;
    if (product.kind === 'resold') {
      costPrice = product.stockItem ? product.stockItem.unitCost : null;
    } else if (product.ingredients.some(link => link.stockItem.unitCost != null)) {
      costPrice = product.ingredients.reduce((sum, link) => sum + (link.stockItem.unitCost || 0) * link.quantity, 0);
    }
    if (costPrice === null) return;
    await prisma.product.update({ where: { id: productId }, data: { costPrice: Math.round(costPrice * 100) / 100 } });
  }

  // Every product whose derived cost depends on this StockItem.
  async recomputeProductsUsingStockItem(stockItemId) {
    const [links, sold] = await Promise.all([
      prisma.productIngredient.findMany({ where: { stockItemId }, select: { productId: true } }),
      prisma.product.findMany({ where: { stockItemId }, select: { id: true } })
    ]);
    const productIds = new Set([...links.map(link => link.productId), ...sold.map(p => p.id)]);
    for (const productId of productIds) await this.recomputeProductCost(productId);
  }

  // RECIPE of a made product: replaces it wholesale (simplest correct way
  // to handle add/remove/change-quantity in one call) and recomputes the
  // product's derived cost. A line is either an existing article
  // (`stockItemId`) or one named on the spot (`name` + optional `unit`):
  // that one is matched by name to an existing article, or created --
  // untracked, since nobody has counted it yet (see StockItem) -- so an
  // ingredient can be introduced straight from the product form. Lines
  // resolving to the same article are merged, and all of them are resolved
  // BEFORE the old recipe is dropped so a bad line can't leave it empty.
  async setProductRecipe(productId, ingredients) {
    const quantities = new Map();
    for (const ing of ingredients || []) {
      const quantity = parseFloat(ing.quantity);
      if (!(quantity > 0)) continue;

      let stockItemId = ing.stockItemId;
      if (!stockItemId) {
        const name = typeof ing.name === 'string' ? ing.name.trim() : '';
        if (!name) continue;
        const unit = typeof ing.unit === 'string' ? ing.unit.trim() : '';
        const { item, created } = await this.getOrCreateStockItem(name, unit);
        // A matched article that never had a unit takes the one just typed.
        if (!created && !item.unit && unit) await prisma.stockItem.update({ where: { id: item.id }, data: { unit } });
        stockItemId = item.id;
      }
      quantities.set(stockItemId, (quantities.get(stockItemId) || 0) + quantity);
    }

    await prisma.productIngredient.deleteMany({ where: { productId } });
    if (quantities.size > 0) {
      await prisma.productIngredient.createMany({
        data: [...quantities].map(([stockItemId, quantity]) => ({ productId, stockItemId, quantity }))
      });
    }
    await this.recomputeProductCost(productId);
  }

  // ---------------------------------------------------------------------
  // RESTOCK -- a StockItem at or below its own threshold (or at 0) belongs
  // on the shopping list. That happens automatically whenever a count
  // changes (_autoAddSafely, wired into every place that changes one),
  // and generateShoppingList below is the manual catch-up for anything
  // that was already low before this ran.
  // ---------------------------------------------------------------------

  // Every StockItem that needs restocking, with a suggested quantity.
  async getRestockCandidates() {
    const items = await prisma.stockItem.findMany();
    return items
      .filter(needsRestock)
      .map(si => {
        const quantity = restockQuantity(si);
        return {
          stockItemId: si.id,
          name: si.name,
          unit: si.unit,
          stock: si.stock,
          fullStock: si.fullStock,
          lowStockThreshold: si.lowStockThreshold,
          quantity,
          totalCost: si.unitCost != null ? Math.round(si.unitCost * quantity * 100) / 100 : null
        };
      })
      .sort((a, b) => a.stock - b.stock);
  }

  // Puts the low/out ones among `stockItemIds` on the storefront's OPEN
  // shopping list, linked to their StockItem (so closing the trip can
  // restock them). Skips whatever is already on that list -- by link, or by
  // name for a hand-typed line -- so it is safe to call as often as a count
  // changes. Not removed again if the count later recovers: a line already
  // on the list stays until it's bought or deleted.
  // `storefrontId` is whichever storefront the change was made from; with
  // none (or an unknown one) the active storefront's list is used, since
  // counts are global but a list is per storefront.
  async autoAddToShoppingList(stockItemIds, storefrontId) {
    const ids = [...new Set((stockItemIds || []).filter(Boolean))];
    if (ids.length === 0) return { created: 0, skipped: 0 };

    const storefront = (storefrontId && await prisma.storefront.findUnique({ where: { id: storefrontId } }))
      || await prisma.storefront.findFirst({ where: { isActive: true } });
    if (!storefront) return { created: 0, skipped: 0 };

    const low = (await prisma.stockItem.findMany({ where: { id: { in: ids } } })).filter(needsRestock);
    if (low.length === 0) return { created: 0, skipped: 0 };

    const trip = await this.getOrCreateOpenTrip(storefront.id);
    const listed = await prisma.shoppingListItem.findMany({
      where: { tripId: trip.id },
      select: { name: true, stockItems: { select: { stockItemId: true } } }
    });
    const listedIds = new Set(listed.flatMap(item => item.stockItems.map(link => link.stockItemId)));
    const listedNames = new Set(listed.map(item => item.name.trim().toLowerCase()));

    let created = 0;
    for (const si of low) {
      if (listedIds.has(si.id) || listedNames.has(si.normalizedName)) continue;
      const quantity = restockQuantity(si);
      await prisma.shoppingListItem.create({
        data: {
          storefrontId: storefront.id,
          tripId: trip.id,
          name: si.name,
          unit: si.unit,
          quantity,
          // Only an ESTIMATED total: a unitCost here would win over the
          // real price typed at the store when the trip is closed (see
          // closeShoppingTrip), keeping the old price instead of updating it.
          totalCost: si.unitCost != null ? Math.round(si.unitCost * quantity * 100) / 100 : null,
          stockItems: { create: [{ stockItemId: si.id }] }
        }
      });
      created++;
    }
    return { created, skipped: low.length - created };
  }

  // The shopping-list top-up is a side effect of a count change that has
  // already been saved -- if it fails, the change itself must still stand.
  async _autoAddSafely(stockItemIds, storefrontId) {
    try {
      await this.autoAddToShoppingList(stockItemIds, storefrontId);
    } catch (e) {
      console.error('Auto-add to shopping list failed:', e);
    }
  }

  // Manual catch-up: every currently low/out article, not just one that
  // just changed.
  async generateShoppingList(storefrontId) {
    const all = await prisma.stockItem.findMany({ select: { id: true } });
    return this.autoAddToShoppingList(all.map(si => si.id), storefrontId);
  }

  // MENUS -- same explicit storefrontId as products.
  async getMenus(storefrontId) {
    const menus = await prisma.menu.findMany({ where: { storefrontId }, include: menuInclude });
    return menus.map(serializeMenu);
  }

  async addMenu(menu, storefrontId) {
    const groups = normalizeGroups(menu.groups);
    const created = await prisma.menu.create({
      data: {
        storefrontId,
        name: menu.name,
        price: parseFloat(menu.price) || 0,
        description: menu.description || '',
        badge: menu.badge || '',
        available: true,
        icon: menu.icon || '🍱',
        groups: {
          create: groups.map((group, index) => ({
            name: group.name,
            position: index,
            products: { create: group.productIds.map(productId => ({ productId })) }
          }))
        }
      },
      include: menuInclude
    });
    return serializeMenu(created);
  }

  async updateMenu(id, updates) {
    const existing = await prisma.menu.findUnique({ where: { id } });
    if (!existing) return null;

    const data = {};
    if (updates.name !== undefined) data.name = updates.name;
    if (updates.description !== undefined) data.description = updates.description;
    if (updates.badge !== undefined) data.badge = updates.badge;
    if (updates.icon !== undefined) data.icon = updates.icon;
    if (updates.available !== undefined) data.available = !!updates.available;
    if (updates.price !== undefined) data.price = parseFloat(updates.price);

    if (updates.groups !== undefined) {
      const groups = normalizeGroups(updates.groups);
      await prisma.menuGroup.deleteMany({ where: { menuId: id } });
      data.groups = {
        create: groups.map((group, index) => ({
          name: group.name,
          position: index,
          products: { create: group.productIds.map(productId => ({ productId })) }
        }))
      };
    }

    const updated = await prisma.menu.update({ where: { id }, data, include: menuInclude });
    return serializeMenu(updated);
  }

  async deleteMenu(id) {
    await prisma.menu.delete({ where: { id } }).catch(() => null);
  }

  async toggleMenuStock(id) {
    const menu = await prisma.menu.findUnique({ where: { id } });
    if (!menu) return null;
    const updated = await prisma.menu.update({
      where: { id },
      data: { available: !menu.available },
      include: menuInclude
    });
    return serializeMenu(updated);
  }

  // ORDERS -- always scoped to one storefront: the kitchen board, bilan and
  // reviews all operate within the storefront currently open in the admin.
  async getOrders(storefrontId) {
    const orders = await prisma.order.findMany({ where: { storefrontId }, include: orderInclude, orderBy: { createdAt: 'asc' } });
    return orders.map(serializeOrder);
  }

  async clearOrders(storefrontId) {
    await prisma.order.deleteMany({ where: { storefrontId } });
  }

  async deleteOrder(id) {
    const order = await prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!order) return false;
    if (order.status !== 'cancelled') {
      await this._adjustStock(serializeOrder(order).items, 1, order.storefrontId);
    }
    await prisma.order.delete({ where: { id } });
    return true;
  }

  // How many of each catalog product an order's lines add up to, breaking
  // meal deals down into their chosen products. Product id -> quantity.
  _productQuantities(items) {
    const quantities = new Map();
    const add = (productId, qty) => {
      if (productId) quantities.set(productId, (quantities.get(productId) || 0) + (parseInt(qty, 10) || 1));
    };
    for (const item of items || []) {
      if (item.type === 'menu' && item.choices) {
        const chosen = Array.isArray(item.choices) ? item.choices.map(entry => entry && entry.product) : Object.values(item.choices);
        for (const product of chosen) if (product) add(product.id, item.quantity);
      } else {
        add(item.id, item.quantity);
      }
    }
    return quantities;
  }

  // Checks a cart against live stock before an order is taken: what the
  // storefront hides is also refused here, so a stale cart (or a race for
  // the last item) can't oversell. Returns one human-readable line per
  // problem; empty when the whole cart can be served.
  async getUnavailableCartItems(items) {
    const quantities = this._productQuantities(items);
    const products = await prisma.product.findMany({ where: { id: { in: [...quantities.keys()] } }, include: productInclude });
    const problems = [];
    for (const product of products) {
      const serialized = serializeProduct(product);
      if (!serialized.available) {
        problems.push(`${product.name} n'est plus disponible`);
      } else if (serialized.stock !== null && serialized.stock < quantities.get(product.id)) {
        problems.push(`${product.name} : il n'en reste que ${serialized.stock}`);
      }
    }
    return problems;
  }

  // Sells (delta -1) or gives back (delta +1) the stock of an order's
  // products. Only a `resold` product's own count moves: a made product's
  // ingredients are kept by hand (see StockItem), so selling one deducts
  // nothing. Untracked (null) counts are left alone. Decrements are atomic
  // and floored at 0, then any article that just went low is put on the
  // shopping list.
  async _adjustStock(items, delta, storefrontId) {
    const touched = new Set();
    for (const [productId, qty] of this._productQuantities(items)) {
      const product = await prisma.product.findUnique({ where: { id: productId }, include: { stockItem: true } });
      if (!product || product.kind !== 'resold' || !product.stockItem || product.stockItem.stock === null) continue;
      const id = product.stockItem.id;
      await prisma.stockItem.update({ where: { id }, data: { stock: { increment: delta * qty } } });
      await prisma.stockItem.updateMany({ where: { id, stock: { lt: 0 } }, data: { stock: 0 } });
      touched.add(id);
    }
    if (delta < 0) await this._autoAddSafely([...touched], storefrontId);
  }

  // storefrontId defaults to the active storefront (student checkout,
  // kiosk): an order placed on the live storefront always belongs to
  // whatever is currently active. Admin flows (e.g. a gifted order) can pass
  // an explicit storefrontId to attach the order to whichever storefront
  // they're currently viewing.
  async addOrder(orderData) {
    const storefrontId = orderData.storefrontId || (await this._getActiveStorefront()).id;
    const orderNumber = await this._generateUniqueOrderNumber();
    const created = await prisma.order.create({
      data: {
        storefrontId,
        orderNumber,
        status: 'pending',
        isPaid: false,
        userId: String(orderData.userId),
        userLogin: orderData.userLogin,
        userDisplayName: orderData.userDisplayName,
        pickupTime: orderData.pickupTime || '12h00',
        note: orderData.note || '',
        totalPrice: parseFloat(orderData.totalPrice) || 0,
        isFree: !!orderData.isFree,
        items: buildOrderItemsInput(orderData.items)
      },
      include: orderInclude
    });
    const serialized = serializeOrder(created);
    await this._adjustStock(serialized.items, -1, storefrontId);
    return serialized;
  }

  // The number shown at the counter must be unique: we pick one at random
  // and retry on collision (rare, but has already happened before this constraint).
  async _generateUniqueOrderNumber() {
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = `42-${Math.floor(1000 + Math.random() * 9000)}`;
      const existing = await prisma.order.findUnique({ where: { orderNumber: candidate } });
      if (!existing) return candidate;
    }
    throw new Error('Could not generate a unique order number');
  }

  async updateOrderStatus(id, status) {
    const order = await prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!order) return null;
    if (status === 'cancelled' && order.status !== 'cancelled') {
      await this._adjustStock(serializeOrder(order).items, 1, order.storefrontId);
    }
    const updated = await prisma.order.update({ where: { id }, data: { status }, include: orderInclude });
    return serializeOrder(updated);
  }

  async setOrderPaid(id, isPaid) {
    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) return null;
    const updated = await prisma.order.update({
      where: { id },
      data: { isPaid: !!isPaid },
      include: orderInclude
    });
    return serializeOrder(updated);
  }

  async updateOrder(id, updates) {
    const existing = await prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!existing) return null;

    const data = {};
    if (updates.pickupTime !== undefined) data.pickupTime = updates.pickupTime;
    if (updates.note !== undefined) data.note = updates.note;
    if (updates.totalPrice !== undefined) data.totalPrice = parseFloat(updates.totalPrice) || 0;

    // Editing an order's items is a return of the old ones plus a sale of
    // the new ones, unless the order is cancelled (it holds no stock).
    const restocksItems = updates.items !== undefined && existing.status !== 'cancelled';
    if (restocksItems) await this._adjustStock(serializeOrder(existing).items, 1, existing.storefrontId);

    if (updates.items !== undefined) {
      await prisma.orderItem.deleteMany({ where: { orderId: id } });
      data.items = buildOrderItemsInput(updates.items);
    }

    const updated = await prisma.order.update({ where: { id }, data, include: orderInclude });
    const serialized = serializeOrder(updated);
    if (restocksItems) await this._adjustStock(serialized.items, -1, existing.storefrontId);
    return serialized;
  }

  async setOrderReview(id, userId, review) {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return { error: 'not_found' };
    if (order.userId !== String(userId)) return { error: 'forbidden' };
    if (order.status !== 'completed') return { error: 'not_completed' };
    const updated = await prisma.order.update({
      where: { id },
      data: {
        reviewRating: review.rating,
        reviewComment: review.comment || '',
        reviewCreatedAt: new Date()
      },
      include: orderInclude
    });
    return { order: serializeOrder(updated) };
  }

  async deleteReview(orderId) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.reviewRating === null || order.reviewRating === undefined) return false;
    await prisma.order.update({
      where: { id: orderId },
      data: { reviewRating: null, reviewComment: null, reviewCreatedAt: null }
    });
    return true;
  }

  // Every order placed across ALL of an event's storefronts -- used by the
  // Historique tab's per-event bilan, since an event can hold more than one
  // storefront (e.g. "Petit-déjeuner" + "Déjeuner"). Filters through the
  // storefront relation directly rather than a separate id lookup + `in`.
  async getEventOrders(eventId) {
    const orders = await prisma.order.findMany({
      where: { storefront: { eventId } },
      include: orderInclude,
      orderBy: { createdAt: 'asc' }
    });
    return orders.map(serializeOrder);
  }

  // The union of the shopping lists of every storefront of one event -- what
  // was (or needs to be) bought to run it, across all its storefronts.
  async getEventShoppingList(eventId) {
    const items = await prisma.shoppingListItem.findMany({
      where: { storefront: { eventId } },
      include: { products: true, menus: true, stockItems: true },
      orderBy: { createdAt: 'asc' }
    });
    return items.map(serializeShoppingListItem);
  }

  // Distinct product count across an event's storefronts -- a quick "how big
  // was this event's catalog" figure for the Historique tab.
  async getEventProductCount(eventId) {
    return prisma.product.count({ where: { storefront: { eventId } } });
  }

  // Averages every shopping-list item bought for a COMPLETED event, grouped
  // by name AND unit (trimmed/lowercased -- items aren't a controlled
  // vocabulary, and the same name logged in different units, e.g. "Lait" in
  // liters vs. in cartons, must never be averaged together), as a per-day
  // rate (quantity/forDays, cost/forDays) so the Historique tab can scale it
  // to however many days the next event will run. Only items with a forDays
  // count toward a rate; a group is kept as soon as EITHER its quantity or
  // its cost produced one, so an item tracked without a cost (or without a
  // quantity) still shows up instead of being silently dropped.
  // `storefrontId`, when given, filters out groups whose ONLY product links
  // point to something outside that storefront's own catalog -- e.g. an
  // old event that also happened to buy orange juice, suggested for a
  // current one that doesn't sell it. A group with no product link at all
  // (a generic/untracked ingredient) is always kept: there's no way to
  // tell either way. Matched by productKey (shared article, else name), not
  // the historical item's own Product.id row, since the "same" product is a
  // different row per storefront.
  async getAverageShoppingList(storefrontId) {
    const items = await prisma.shoppingListItem.findMany({
      where: { storefront: { event: { status: 'completed' } }, forDays: { not: null, gt: 0 } },
      include: { products: { include: { product: { select: { stockItemId: true, name: true } } } } }
    });

    const groups = new Map();
    for (const item of items) {
      const key = `${item.name.trim().toLowerCase()} ${(item.unit || '').trim().toLowerCase()}`;
      if (!groups.has(key)) {
        groups.set(key, { name: item.name.trim(), unit: item.unit, qtySum: 0, qtyCount: 0, costSum: 0, costCount: 0, purchaseLocation: item.purchaseLocation, productKeys: new Set() });
      }
      const group = groups.get(key);
      if (item.quantity !== null && item.quantity !== undefined) {
        group.qtySum += item.quantity / item.forDays;
        group.qtyCount += 1;
      }
      if (item.totalCost !== null && item.totalCost !== undefined) {
        group.costSum += item.totalCost / item.forDays;
        group.costCount += 1;
      }
      (item.products || []).forEach(link => { if (link.product) group.productKeys.add(productKey(link.product)); });
    }

    let currentProductKeys = null;
    if (storefrontId) {
      const currentProducts = await prisma.product.findMany({ where: { storefrontId }, select: { stockItemId: true, name: true } });
      currentProductKeys = new Set(currentProducts.map(productKey));
    }

    // Sales context (informational only, see getLastCompletedEventProductSales)
    // for whichever of a group's linked products were actually sold last time
    // -- it never feeds into perDayQuantity/perDayCost, which stay purely
    // purchase-history-based.
    const { eventName: lastEventName, sales: lastEventSales } = await this.getLastCompletedEventProductSales();

    return Array.from(groups.values())
      .filter(g => !currentProductKeys || g.productKeys.size === 0 || [...g.productKeys].some(key => currentProductKeys.has(key)))
      .map(g => {
        const soldLastEvent = [...g.productKeys].reduce((sum, key) => sum + (lastEventSales[key] || 0), 0);
        return {
          name: g.name,
          unit: g.unit,
          purchaseLocation: g.purchaseLocation,
          perDayQuantity: g.qtyCount ? g.qtySum / g.qtyCount : null,
          perDayCost: g.costCount ? g.costSum / g.costCount : null,
          sampleSize: Math.max(g.qtyCount, g.costCount),
          soldLastEvent: g.productKeys.size > 0 ? { eventName: lastEventName, quantity: soldLastEvent } : null,
          // Was this article ever linked to a real catalog product? Purely
          // informational now that generateShoppingList (Stock tab) has its
          // own, unrelated stock-threshold logic (see getRestockCandidates)
          // instead of drawing from this historical average at all -- kept
          // here for whatever still shows this list (e.g. Historique's
          // pre-event preview) to flag one as
          // "not verified" rather than hide it.
          linked: g.productKeys.size > 0
        };
      })
      .filter(g => g.perDayQuantity !== null || g.perDayCost !== null)
      .sort((a, b) => (b.perDayCost ?? 0) - (a.perDayCost ?? 0));
  }

  // Units sold per product during the most recently COMPLETED event --
  // purely informational context surfaced next to the automatic
  // shopping-list generation (see getAverageShoppingList above). There is no
  // quantified recipe linking a sold product to how much of a given
  // shopping-list article it consumes, so this never feeds the actual
  // per-day quantity/cost math, only shown alongside it. Keyed by
  // productKey (shared article, else name), not the order's own raw
  // Product.id, so it still matches a shopping-list link from a different
  // storefront/event's product row for the same physical item.
  async getLastCompletedEventProductSales() {
    const lastEvent = await prisma.event.findFirst({
      where: { status: 'completed' },
      orderBy: { createdAt: 'desc' }
    });
    if (!lastEvent) return { eventName: null, sales: {} };

    const orders = await this.getEventOrders(lastEvent.id);
    const soldProductIds = new Set();
    for (const order of orders) {
      if (order.status !== 'completed') continue;
      for (const item of order.items) {
        if (item.type === 'menu' && item.choices) {
          item.choices.forEach(choice => { if (choice.product?.id) soldProductIds.add(choice.product.id); });
        } else if (item.id) {
          soldProductIds.add(item.id);
        }
      }
    }
    const productRows = await prisma.product.findMany({
      where: { id: { in: [...soldProductIds] } },
      select: { id: true, stockItemId: true, name: true }
    });
    const productToKey = new Map(productRows.map(p => [p.id, productKey(p)]));

    const sales = {};
    const add = (productId, qty) => {
      const key = productToKey.get(productId);
      if (!key) return;
      sales[key] = (sales[key] || 0) + qty;
    };
    for (const order of orders) {
      if (order.status !== 'completed') continue;
      for (const item of order.items) {
        if (item.type === 'menu' && item.choices) {
          item.choices.forEach(choice => add(choice.product?.id, item.quantity));
        } else {
          add(item.id, item.quantity);
        }
      }
    }
    return { eventName: lastEvent.name, sales };
  }

  // Per real "active sales day" (>=1 completed order) across every
  // COMPLETED event's storefronts: revenue, cost and distinct-customer
  // count. Cross-event, like getAverageShoppingList above -- the forecast
  // route (see /api/admin/forecast in index.js) turns this into a mean/
  // stddev to project upcoming days/weeks. Kept independent from
  // itemUnitCost/getChosenProducts in index.js (same small logic,
  // duplicated) rather than reaching across modules for it.
  async getHistoricalDailyStats() {
    const orders = await prisma.order.findMany({
      where: { status: 'completed', storefront: { event: { status: 'completed' } } },
      include: orderInclude
    });

    const itemCost = item => {
      if (item.type === 'menu' && item.choices && item.choices.length) {
        return item.choices.reduce((sum, c) => sum + (c.costPrice || 0), 0);
      }
      return item.costPrice || 0;
    };

    const dayMap = new Map(); // YYYY-MM-DD -> { revenue, cost, customers: Set }
    for (const order of orders) {
      const day = order.createdAt.toISOString().slice(0, 10);
      const bucket = dayMap.get(day) || { revenue: 0, cost: 0, customers: new Set() };
      bucket.revenue += order.isFree ? 0 : (order.totalPrice || 0);
      bucket.customers.add(order.userId);
      for (const item of order.items) {
        bucket.cost += itemCost(item) * item.quantity;
      }
      dayMap.set(day, bucket);
    }

    return Array.from(dayMap.entries())
      .map(([date, { revenue, cost, customers }]) => ({ date, revenue, cost, profit: revenue - cost, customers: customers.size }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // APP SETTINGS -- see the AppSetting model. setSettingIfAbsent never
  // overwrites: with two processes starting at once, the first write wins and
  // both read that same value back.
  async getSetting(key) {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    return row ? row.value : null;
  }

  async setSettingIfAbsent(key, value) {
    await prisma.appSetting.createMany({ data: [{ key, value }], skipDuplicates: true });
    return this.getSetting(key);
  }

  // PUSH SUBSCRIPTIONS -- the devices that get a Web Push alert for a new
  // order (see server/push.js). One row per device, keyed by its endpoint:
  // enabling again from the same device (even as another staff member)
  // just updates that row.
  async savePushSubscription(login, { endpoint, p256dh, auth }) {
    return prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh, auth, login },
      update: { p256dh, auth, login }
    });
  }

  async deletePushSubscription(endpoint) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }

  async deletePushSubscriptionsOfLogin(login) {
    await prisma.pushSubscription.deleteMany({ where: { login } });
  }

  async listPushSubscriptions(login) {
    return prisma.pushSubscription.findMany({ where: login ? { login } : undefined });
  }

  // Role hierarchy (see resolveRole() in auth42.js for how a login's role is
  // resolved at login time -- this table is the DB half of that, the source
  // of truth once a Board member has assigned someone explicitly).
  async getTeamMemberRole(login) {
    const row = await prisma.teamMember.findUnique({ where: { login } });
    return row ? row.role : null;
  }

  async listTeamMembers() {
    const rows = await prisma.teamMember.findMany({ orderBy: { login: 'asc' } });
    return rows.map(r => ({ login: r.login, role: r.role, addedBy: r.addedBy, updatedAt: r.updatedAt.toISOString() }));
  }

  async setTeamMemberRole(login, role, addedBy) {
    const row = await prisma.teamMember.upsert({
      where: { login },
      create: { login, role, addedBy },
      update: { role, addedBy }
    });
    return { login: row.login, role: row.role, addedBy: row.addedBy, updatedAt: row.updatedAt.toISOString() };
  }

  async removeTeamMember(login) {
    try {
      await prisma.teamMember.delete({ where: { login } });
      return true;
    } catch {
      return false;
    }
  }
}

// Rebuilds a meal deal's choice groups from the admin input.
function normalizeGroups(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(group => ({
      name: (group && group.name ? String(group.name) : '').trim(),
      productIds: Array.isArray(group && group.productIds) ? group.productIds.filter(Boolean) : []
    }))
    .filter(group => group.name || group.productIds.length);
}

export const db = new DB();
