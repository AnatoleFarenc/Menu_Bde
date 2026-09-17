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
    productIds: (item.products || []).map(link => link.productId)
  };
}

function serializeProduct(p) {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    category: p.categoryId,
    price: p.price,
    extraMenuPrice: p.extraMenuPrice,
    costPrice: p.costPrice,
    stock: p.stock,
    lowStockThreshold: p.lowStockThreshold,
    description: p.description,
    badge: p.badge,
    available: p.available,
    icon: p.icon
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
    prisma.product.findMany({ where: { storefrontId: sourceStorefrontId } }),
    prisma.menu.findMany({ where: { storefrontId: sourceStorefrontId }, include: menuInclude }),
    prisma.shoppingListItem.findMany({ where: { storefrontId: sourceStorefrontId }, include: { products: true } })
  ]);

  const idMap = new Map(); // source product id -> new product id
  for (const product of sourceProducts) {
    const copy = await prisma.product.create({
      data: {
        storefrontId: newStorefront.id,
        name: product.name,
        categoryId: product.categoryId,
        price: product.price,
        extraMenuPrice: product.extraMenuPrice,
        costPrice: product.costPrice,
        stock: product.stock,
        description: product.description,
        badge: product.badge,
        available: product.available,
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

  for (const item of sourceShoppingList) {
    const remappedProductIds = item.products.map(link => idMap.get(link.productId)).filter(Boolean);
    await prisma.shoppingListItem.create({
      data: {
        storefrontId: newStorefront.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        forDays: item.forDays,
        forPeople: item.forPeople,
        unitCost: item.unitCost,
        totalCost: item.totalCost,
        purchaseLocation: item.purchaseLocation,
        note: item.note,
        products: { create: remappedProductIds.map(productId => ({ productId })) }
      }
    });
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
      where: { storefrontId: activeStorefront.id, category: { isVisible: true } }
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
      include: { products: true },
      orderBy: { createdAt: 'asc' }
    });
    return items.map(serializeShoppingListItem);
  }

  async closeShoppingTrip(storefrontId) {
    const trip = await prisma.shoppingTrip.findFirst({
      where: { storefrontId, closedAt: null },
      include: { items: { include: { products: true } } }
    });
    if (!trip) return null;

    // Restock: a bought item linked to EXACTLY one catalog product is an
    // unambiguous 1:1 match (e.g. a "Pain au chocolat" shopping-list line
    // linked to the "Pain au chocolat" product) -- add its quantity to that
    // product's stock. Skipped for items linked to zero or several
    // products: there's no quantified recipe saying how much of a
    // multi-product ingredient goes to each one (same reasoning as
    // getLastCompletedEventProductSales), so guessing would just be wrong.
    // Untracked (stock: null) products are left untracked.
    const restocked = [];
    for (const item of trip.items) {
      if (!item.bought || item.quantity == null || item.products.length !== 1) continue;
      const productId = item.products[0].productId;
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product || product.stock === null) continue;
      const newStock = product.stock + item.quantity;
      await prisma.product.update({ where: { id: productId }, data: { stock: newStock, available: newStock > 0 } });
      restocked.push({ productId, productName: product.name, added: item.quantity, newStock });
    }

    const updated = await prisma.shoppingTrip.update({ where: { id: trip.id }, data: { closedAt: new Date() } });
    return { id: updated.id, closedAt: updated.closedAt.toISOString(), restocked };
  }

  async getShoppingTripHistory(storefrontId) {
    const trips = await prisma.shoppingTrip.findMany({
      where: { storefrontId, closedAt: { not: null } },
      orderBy: { closedAt: 'desc' },
      include: { items: { include: { products: true }, orderBy: { createdAt: 'asc' } } }
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
        products: { create: (item.productIds || []).map(productId => ({ productId })) }
      },
      include: { products: true }
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

    const updated = await prisma.shoppingListItem.update({ where: { id }, data, include: { products: true } });
    return serializeShoppingListItem(updated);
  }

  async deleteShoppingListItem(id) {
    await prisma.shoppingListItem.delete({ where: { id } }).catch(() => null);
  }

  // PRODUCTS -- storefrontId is explicit: any storefront's catalog can be
  // browsed and edited from its own page, not just the active (live) one.
  async getProducts(storefrontId) {
    const products = await prisma.product.findMany({ where: { storefrontId } });
    return products.map(serializeProduct);
  }

  async getProductById(id) {
    const product = await prisma.product.findUnique({ where: { id } });
    return serializeProduct(product);
  }

  async addProduct(product, storefrontId) {
    const stock = (product.stock === '' || product.stock === undefined || product.stock === null)
      ? null
      : parseInt(product.stock, 10);
    const created = await prisma.product.create({
      data: {
        storefrontId,
        name: product.name,
        categoryId: product.category,
        price: parseFloat(product.price) || 0,
        extraMenuPrice: parseFloat(product.extraMenuPrice) || 0,
        costPrice: (product.costPrice === '' || product.costPrice === undefined || product.costPrice === null) ? null : parseFloat(product.costPrice),
        stock,
        description: product.description || '',
        badge: product.badge || '',
        available: stock !== null ? stock > 0 : true,
        icon: product.icon || '🥪'
      }
    });
    return serializeProduct(created);
  }

  async updateProduct(id, updates) {
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) return null;

    const data = {};
    if (updates.name !== undefined) data.name = updates.name;
    if (updates.category !== undefined) data.categoryId = updates.category;
    if (updates.description !== undefined) data.description = updates.description;
    if (updates.badge !== undefined) data.badge = updates.badge;
    if (updates.icon !== undefined) data.icon = updates.icon;
    if (updates.available !== undefined) data.available = !!updates.available;
    if (updates.price !== undefined) data.price = parseFloat(updates.price);
    if (updates.extraMenuPrice !== undefined) data.extraMenuPrice = parseFloat(updates.extraMenuPrice) || 0;
    if (updates.costPrice !== undefined) {
      data.costPrice = (updates.costPrice === '' || updates.costPrice === null) ? null : parseFloat(updates.costPrice);
    }
    if (updates.stock !== undefined) {
      const stock = (updates.stock === '' || updates.stock === null) ? null : parseInt(updates.stock, 10);
      data.stock = stock;
      if (stock !== null) data.available = stock > 0;
    }
    if (updates.lowStockThreshold !== undefined) {
      data.lowStockThreshold = Math.max(0, parseInt(updates.lowStockThreshold, 10) || 0);
    }

    const updated = await prisma.product.update({ where: { id }, data });
    return serializeProduct(updated);
  }

  async deleteProduct(id) {
    await prisma.product.delete({ where: { id } }).catch(() => null);
  }

  async toggleProductStock(id) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return null;
    const updated = await prisma.product.update({
      where: { id },
      data: { available: !product.available }
    });
    return serializeProduct(updated);
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
      await this._adjustStock(serializeOrder(order).items, 1);
    }
    await prisma.order.delete({ where: { id } });
    return true;
  }

  // Decrements (delta -1) or restores (delta +1) the stock of an order's
  // products, breaking meal deals down into their chosen products. Only
  // touches products with tracked stock (stock !== null).
  async _adjustStock(items, delta) {
    const applyToProduct = async (productId, qty) => {
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product || product.stock === null || product.stock === undefined) return;
      const stock = Math.max(0, product.stock + delta * qty);
      await prisma.product.update({ where: { id: productId }, data: { stock, available: stock > 0 } });
    };
    for (const item of items || []) {
      if (item.type === 'menu' && item.choices) {
        const chosenProducts = Array.isArray(item.choices)
          ? item.choices.map(entry => entry && entry.product)
          : Object.values(item.choices);
        for (const chosenProduct of chosenProducts) {
          if (chosenProduct && chosenProduct.id) await applyToProduct(chosenProduct.id, item.quantity);
        }
      } else if (item.id) {
        await applyToProduct(item.id, item.quantity);
      }
    }
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
    await this._adjustStock(serialized.items, -1);
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
      await this._adjustStock(serializeOrder(order).items, 1);
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
    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) return null;

    const data = {};
    if (updates.pickupTime !== undefined) data.pickupTime = updates.pickupTime;
    if (updates.note !== undefined) data.note = updates.note;
    if (updates.totalPrice !== undefined) data.totalPrice = parseFloat(updates.totalPrice) || 0;

    if (updates.items !== undefined) {
      await prisma.orderItem.deleteMany({ where: { orderId: id } });
      data.items = buildOrderItemsInput(updates.items);
    }

    const updated = await prisma.order.update({ where: { id }, data, include: orderInclude });
    return serializeOrder(updated);
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
      include: { products: true },
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
  async getAverageShoppingList() {
    const items = await prisma.shoppingListItem.findMany({
      where: { storefront: { event: { status: 'completed' } }, forDays: { not: null, gt: 0 } },
      include: { products: true }
    });

    const groups = new Map();
    for (const item of items) {
      const key = `${item.name.trim().toLowerCase()} ${(item.unit || '').trim().toLowerCase()}`;
      if (!groups.has(key)) {
        groups.set(key, { name: item.name.trim(), unit: item.unit, qtySum: 0, qtyCount: 0, costSum: 0, costCount: 0, purchaseLocation: item.purchaseLocation, productIds: new Set() });
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
      (item.products || []).forEach(link => group.productIds.add(link.productId));
    }

    // Sales context (informational only, see getLastCompletedEventProductSales)
    // for whichever of a group's linked products were actually sold last time
    // -- it never feeds into perDayQuantity/perDayCost, which stay purely
    // purchase-history-based.
    const { eventName: lastEventName, sales: lastEventSales } = await this.getLastCompletedEventProductSales();

    return Array.from(groups.values())
      .map(g => {
        const soldLastEvent = [...g.productIds].reduce((sum, id) => sum + (lastEventSales[id] || 0), 0);
        return {
          name: g.name,
          unit: g.unit,
          purchaseLocation: g.purchaseLocation,
          perDayQuantity: g.qtyCount ? g.qtySum / g.qtyCount : null,
          perDayCost: g.costCount ? g.costSum / g.costCount : null,
          sampleSize: Math.max(g.qtyCount, g.costCount),
          soldLastEvent: g.productIds.size > 0 ? { eventName: lastEventName, quantity: soldLastEvent } : null
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
  // per-day quantity/cost math, only shown alongside it.
  async getLastCompletedEventProductSales() {
    const lastEvent = await prisma.event.findFirst({
      where: { status: 'completed' },
      orderBy: { createdAt: 'desc' }
    });
    if (!lastEvent) return { eventName: null, sales: {} };

    const orders = await this.getEventOrders(lastEvent.id);
    const sales = {};
    const add = (productId, qty) => { if (productId) sales[productId] = (sales[productId] || 0) + qty; };
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

  // Pre-fills a storefront's shopping list from the cross-event average,
  // scaled to `days`. Skips any item already on the list (matched the same
  // way getAverageShoppingList groups items: name + unit, trimmed/
  // lowercased) so clicking it twice, or generating after already adding a
  // few items by hand, never creates duplicate lines -- the admin edits or
  // deletes individual rows from here on, same as a manually-added one.
  async generateShoppingList(storefrontId, days) {
    const trip = await this.getOrCreateOpenTrip(storefrontId);
    const [average, existing] = await Promise.all([
      this.getAverageShoppingList(),
      prisma.shoppingListItem.findMany({ where: { tripId: trip.id }, select: { name: true, unit: true } })
    ]);
    const keyOf = (name, unit) => `${name.trim().toLowerCase()} ${(unit || '').trim().toLowerCase()}`;
    const existingKeys = new Set(existing.map(it => keyOf(it.name, it.unit)));
    const toCreate = average.filter(g => !existingKeys.has(keyOf(g.name, g.unit)));

    if (toCreate.length > 0) {
      await prisma.shoppingListItem.createMany({
        data: toCreate.map(g => ({
          storefrontId,
          tripId: trip.id,
          name: g.name,
          unit: g.unit || null,
          quantity: g.perDayQuantity != null ? Math.round(g.perDayQuantity * days * 10) / 10 : null,
          forDays: days,
          totalCost: g.perDayCost != null ? Math.round(g.perDayCost * days * 100) / 100 : null,
          purchaseLocation: g.purchaseLocation || null
        }))
      });
    }

    return { created: toCreate.length, skipped: average.length - toCreate.length };
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
