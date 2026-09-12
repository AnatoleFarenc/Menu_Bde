// Import unique : recopie server/data/db.json (catégories, produits, formules,
// templates, commandes) vers MariaDB via Prisma. À lancer une seule fois par
// environnement, juste après la première migration.
//
//   node prisma/import-from-json.mjs
//
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, '..', 'server', 'data', 'db.json');

const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

function readJsonDb() {
  if (!fs.existsSync(DB_FILE)) {
    throw new Error(`Fichier introuvable : ${DB_FILE}`);
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

// Extrait les produits choisis dans une ligne "formule" d'une commande, quel
// que soit le format historique (tableau [{label, product}] ou objet clé/valeur).
function extractChoices(item) {
  if (!item.choices) return [];
  const entries = Array.isArray(item.choices) ? item.choices : Object.values(item.choices);
  return entries
    .filter(entry => entry && entry.product)
    .map(entry => ({
      groupName: entry.label || '',
      productId: entry.product.id,
      productName: entry.product.name || '',
      costPrice: entry.product.costPrice ?? null
    }));
}

async function main() {
  const data = readJsonDb();

  console.log('▶ Catégories...');
  for (const category of data.categories || []) {
    await prisma.category.create({
      data: {
        id: category.id,
        name: category.name,
        icon: category.icon || '📦',
        isVisible: category.isVisible !== false
      }
    });
  }

  console.log('▶ Produits...');
  for (const product of data.products || []) {
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

  console.log('▶ Formules & groupes de choix...');
  for (const menu of data.menus || []) {
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
    const knownProductIds = new Set((data.products || []).map(p => p.id));
    for (const [index, group] of (menu.groups || []).entries()) {
      const validProductIds = (group.productIds || []).filter(id => knownProductIds.has(id));
      await prisma.menuGroup.create({
        data: {
          id: group.id,
          menuId: menu.id,
          name: group.name || '',
          position: index,
          products: {
            create: validProductIds.map(productId => ({ productId }))
          }
        }
      });
    }
  }

  console.log('▶ Templates (catalogues sauvegardés)...');
  for (const template of data.templates || []) {
    await prisma.template.create({
      data: {
        id: template.id,
        name: template.name,
        description: template.description || '',
        createdAt: new Date(template.createdAt),
        products: template.products || [],
        menus: template.menus || [],
        categories: template.categories || []
      }
    });
  }

  console.log('▶ Commandes...');
  const seenOrderNumbers = new Set();
  for (const order of data.orders || []) {
    let orderNumber = order.orderNumber;
    if (seenOrderNumbers.has(orderNumber)) {
      // Doublon historique détecté (bug de génération jamais vérifiée avant
      // ce nettoyage) : suffixé pour respecter la contrainte d'unicité,
      // l'original reste visible dans server/data/db.json.
      orderNumber = `${orderNumber}-dup`;
      console.warn(`  ⚠️  orderNumber dupliqué "${order.orderNumber}" (commande ${order.id}) → renommé "${orderNumber}"`);
    }
    seenOrderNumbers.add(orderNumber);

    await prisma.order.create({
      data: {
        id: order.id,
        orderNumber,
        status: order.status || 'pending',
        isPaid: !!order.isPaid,
        isFree: !!order.isFree,
        userId: String(order.userId),
        userLogin: order.userLogin,
        userDisplayName: order.userDisplayName,
        pickupTime: order.pickupTime || '12h00',
        note: order.note || '',
        totalPrice: parseFloat(order.totalPrice) || 0,
        createdAt: new Date(order.createdAt),
        reviewRating: order.review?.rating ?? null,
        reviewComment: order.review?.comment ?? null,
        reviewCreatedAt: order.review?.createdAt ? new Date(order.review.createdAt) : null,
        items: {
          create: (order.items || []).map(item => ({
            type: item.type || 'product',
            refId: item.type === 'menu' ? (item.menuId || item.id) : item.id,
            name: item.name || '',
            category: item.category || null,
            price: parseFloat(item.price) || 0,
            costPrice: item.costPrice ?? null,
            quantity: parseInt(item.quantity, 10) || 1,
            choices: { create: extractChoices(item) }
          }))
        }
      }
    });
  }

  const [categories, products, menus, templates, orders] = await Promise.all([
    prisma.category.count(),
    prisma.product.count(),
    prisma.menu.count(),
    prisma.template.count(),
    prisma.order.count()
  ]);
  console.log('');
  console.log('✅ Import terminé :', { categories, products, menus, templates, orders });
}

main()
  .catch(error => {
    console.error('❌ Import échoué :', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
