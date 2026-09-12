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

class DB {
  constructor() {
    this.ready = this._ensureDefaultCategories();
  }

  async _ensureDefaultCategories() {
    const count = await prisma.category.count();
    if (count > 0) return;
    for (const category of DEFAULT_CATEGORIES) {
      await prisma.category.create({ data: category });
    }
  }

  // CATEGORIES
  async getCategories() {
    const categories = await prisma.category.findMany();
    return categories.map(serializeCategory);
  }

  async getPublicProducts() {
    const products = await prisma.product.findMany({
      where: { category: { isVisible: true } }
    });
    return products.map(serializeProduct);
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

  // TEMPLATES
  async getTemplates() {
    const templates = await prisma.template.findMany({ orderBy: { createdAt: 'desc' } });
    return templates.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      createdAt: t.createdAt.toISOString(),
      products: t.products,
      menus: t.menus,
      categories: t.categories
    }));
  }

  async addTemplate(templateData) {
    const [products, menus, categories] = await Promise.all([
      this.getProducts(),
      this.getMenus(),
      this.getCategories()
    ]);
    const created = await prisma.template.create({
      data: {
        name: templateData.name.trim(),
        description: templateData.description || '',
        products,
        menus,
        categories
      }
    });
    return {
      id: created.id,
      name: created.name,
      description: created.description,
      createdAt: created.createdAt.toISOString(),
      products: created.products,
      menus: created.menus,
      categories: created.categories
    };
  }

  // Fully replaces the active catalog (categories/products/meal deals)
  // with the given snapshot. Used to replay a saved template.
  async applyTemplate(id) {
    const template = await prisma.template.findUnique({ where: { id } });
    if (!template) return null;

    await prisma.$transaction([
      prisma.menu.deleteMany(),
      prisma.product.deleteMany(),
      prisma.category.deleteMany()
    ]);

    for (const category of template.categories || []) {
      await prisma.category.create({
        data: {
          id: category.id,
          name: category.name,
          icon: category.icon || '📦',
          isVisible: category.isVisible !== false
        }
      });
    }
    for (const product of template.products || []) {
      await prisma.product.create({
        data: {
          id: product.id,
          name: product.name,
          categoryId: product.category,
          price: parseFloat(product.price) || 0,
          extraMenuPrice: parseFloat(product.extraMenuPrice) || 0,
          costPrice: product.costPrice ?? null,
          stock: product.stock ?? null,
          description: product.description || '',
          badge: product.badge || '',
          available: product.available !== false,
          icon: product.icon || '🥪'
        }
      });
    }
    const knownProductIds = new Set((template.products || []).map(p => p.id));
    for (const menu of template.menus || []) {
      await prisma.menu.create({
        data: {
          id: menu.id,
          name: menu.name,
          price: parseFloat(menu.price) || 0,
          description: menu.description || '',
          badge: menu.badge || '',
          available: menu.available !== false,
          icon: menu.icon || '🍱'
        }
      });
      for (const [index, group] of (menu.groups || []).entries()) {
        const validProductIds = (group.productIds || []).filter(pid => knownProductIds.has(pid));
        await prisma.menuGroup.create({
          data: {
            id: group.id,
            menuId: menu.id,
            name: group.name || '',
            position: index,
            products: { create: validProductIds.map(productId => ({ productId })) }
          }
        });
      }
    }

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      createdAt: template.createdAt.toISOString(),
      products: template.products,
      menus: template.menus,
      categories: template.categories
    };
  }

  async deleteTemplate(id) {
    await prisma.template.delete({ where: { id } }).catch(() => null);
  }

  // PRODUCTS
  async getProducts() {
    const products = await prisma.product.findMany();
    return products.map(serializeProduct);
  }

  async getProductById(id) {
    const product = await prisma.product.findUnique({ where: { id } });
    return serializeProduct(product);
  }

  async addProduct(product) {
    const stock = (product.stock === '' || product.stock === undefined || product.stock === null)
      ? null
      : parseInt(product.stock, 10);
    const created = await prisma.product.create({
      data: {
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

  // MENUS
  async getMenus() {
    const menus = await prisma.menu.findMany({ include: menuInclude });
    return menus.map(serializeMenu);
  }

  async addMenu(menu) {
    const groups = normalizeGroups(menu.groups);
    const created = await prisma.menu.create({
      data: {
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

  // ORDERS
  async getOrders() {
    const orders = await prisma.order.findMany({ include: orderInclude, orderBy: { createdAt: 'asc' } });
    return orders.map(serializeOrder);
  }

  async clearOrders() {
    await prisma.order.deleteMany();
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

  async addOrder(orderData) {
    const orderNumber = await this._generateUniqueOrderNumber();
    const created = await prisma.order.create({
      data: {
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
