// Seeds realistic FAKE data for local testing: 3 events prefixed "[TEST]"
// (completed / ongoing / upcoming), products with a mix of out-of-stock,
// low-stock and unlimited items, one event with two storefronts, a
// shopping-list history (for the average/generation feature), and orders
// spread across several real days (for the Bilan/Statistiques charts).
// Never touches the live storefront -- every storefront created here is
// isActive: false.
//
//   node prisma/seed-test-data.mjs
//
// Safe to re-run: each run adds a fresh batch of [TEST] events rather than
// reusing old ones (events with orders can't be deleted from the UI, same
// protection as real events -- see deleteEvent in server/db.js -- so if you
// want to remove a batch later it needs a direct DB delete, order rows
// first).
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';
import { db } from '../server/db.js';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

const daysAgo = n => new Date(Date.now() - n * 86400000);
const daysFromNow = n => new Date(Date.now() + n * 86400000);
const rand = (min, max) => Math.floor(min + Math.random() * (max - min + 1));

let orderCounter = 1;
async function createOrder({ storefrontId, userLogin, userDisplayName, createdAt, status, items }) {
  const totalPrice = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
  await prisma.order.create({
    data: {
      storefrontId,
      orderNumber: `TEST-${String(orderCounter++).padStart(4, '0')}`,
      status,
      isPaid: status === 'completed',
      isFree: false,
      userId: `test_${userLogin}`,
      userLogin,
      userDisplayName,
      pickupTime: `${rand(8, 13)}h${rand(0, 1) ? '30' : '00'}`,
      note: '',
      totalPrice,
      createdAt,
      items: {
        create: items.map(it => ({
          type: it.type || 'product',
          refId: it.id,
          name: it.name,
          category: it.category || null,
          price: it.price,
          costPrice: it.costPrice ?? null,
          quantity: it.quantity,
          choices: it.choices ? { create: it.choices } : undefined
        }))
      }
    }
  });
}

const STUDENTS = [
  ['jdupont', 'Julien Dupont'], ['amartin', 'Alice Martin'], ['lbernard', 'Léo Bernard'],
  ['cdurand', 'Chloé Durand'], ['tpetit', 'Théo Petit'], ['mrobert', 'Manon Robert'],
  ['nrichard', 'Nathan Richard'], ['erenaud', 'Emma Renaud']
];
const student = () => STUDENTS[rand(0, STUDENTS.length - 1)];

async function main() {
  await db.ready;

  // ---------------------------------------------------------------------
  // Event A -- completed, single storefront, 4 days of orders (stats),
  // out-of-stock + low-stock + unlimited products, a shopping-list history.
  // ---------------------------------------------------------------------
  const eventA = await db.createEvent({
    name: '[TEST] Petit-déj Semaine A',
    description: 'Jeu de données fictif -- suppression manuelle possible.',
    startDate: daysAgo(6).toISOString(),
    endDate: daysAgo(2).toISOString()
  });
  await db.updateEvent(eventA.id, { status: 'completed' });
  const storefrontsA = await db.getStorefronts(eventA.id);
  const sfA = storefrontsA[0];
  await db.updateStorefront(sfA.id, { name: 'Petit-déjeuner' });

  const croissant = await db.addProduct({ name: 'Croissant', category: 'dessert', price: 1.2, costPrice: 0.5, stock: 0 }, sfA.id);
  await db.updateProduct(croissant.id, { lowStockThreshold: 5 });
  const painChoc = await db.addProduct({ name: 'Pain au chocolat', category: 'dessert', price: 1.3, costPrice: 0.55, stock: 3 }, sfA.id);
  await db.updateProduct(painChoc.id, { lowStockThreshold: 5 });
  const jusOrange = await db.addProduct({ name: "Jus d'orange", category: 'boisson', price: 1.5, costPrice: 0.6, stock: 40 }, sfA.id);
  await db.updateProduct(jusOrange.id, { lowStockThreshold: 10 });
  const cafe = await db.addProduct({ name: 'Café', category: 'boisson', price: 0.5, costPrice: 0.15, stock: null }, sfA.id);
  const the = await db.addProduct({ name: 'Thé', category: 'boisson', price: 0.5, costPrice: 0.15, stock: null }, sfA.id);

  const menuPtDej = await db.addMenu({
    name: 'Formule Petit-déj',
    price: 2.5,
    groups: [
      { name: 'Viennoiserie', productIds: [croissant.id, painChoc.id] },
      { name: 'Boisson', productIds: [jusOrange.id, cafe.id, the.id] }
    ]
  }, sfA.id);

  await db.addShoppingListItem(sfA.id, {
    name: 'Pain au chocolat', quantity: 120, unit: 'unités', forDays: 5, totalCost: 66,
    purchaseLocation: 'Boulangerie du coin', productIds: [painChoc.id]
  });
  await db.addShoppingListItem(sfA.id, {
    name: 'Café en grains', quantity: 3, unit: 'kg', forDays: 5, totalCost: 45,
    purchaseLocation: 'Metro'
  });
  await db.addShoppingListItem(sfA.id, {
    name: "Jus d'orange (briques)", quantity: 50, unit: 'unités', forDays: 5, totalCost: 75,
    purchaseLocation: 'Metro', productIds: [jusOrange.id]
  });

  const dailyOrderCounts = [3, 5, 4, 6]; // days -6..-3, a visible trend for the charts
  for (let dayOffset = 6; dayOffset >= 3; dayOffset--) {
    const count = dailyOrderCounts[6 - dayOffset];
    for (let i = 0; i < count; i++) {
      const [login, name] = student();
      const createdAt = new Date(daysAgo(dayOffset).getTime() + rand(7, 11) * 3600000);
      const useMenu = Math.random() < 0.4;
      const items = useMenu
        ? [{
            type: 'menu', id: menuPtDej.id, name: menuPtDej.name, price: menuPtDej.price, costPrice: null, quantity: 1,
            choices: [
              { groupName: 'Viennoiserie', productId: painChoc.id, productName: painChoc.name, costPrice: painChoc.costPrice },
              { groupName: 'Boisson', productId: cafe.id, productName: cafe.name, costPrice: cafe.costPrice }
            ]
          }]
        : [{ id: jusOrange.id, name: jusOrange.name, category: 'boisson', price: jusOrange.price, costPrice: jusOrange.costPrice, quantity: rand(1, 2) },
           { id: cafe.id, name: cafe.name, category: 'boisson', price: cafe.price, costPrice: cafe.costPrice, quantity: 1 }];
      await createOrder({ storefrontId: sfA.id, userLogin: login, userDisplayName: name, createdAt, status: 'completed', items });
    }
  }

  // ---------------------------------------------------------------------
  // Event B -- ongoing, TWO storefronts (multi-vitrine), light order
  // activity across 2 days on the "Déjeuner" storefront.
  // ---------------------------------------------------------------------
  const eventB = await db.createEvent({
    name: '[TEST] Sandwich Multi-vitrines',
    description: 'Jeu de données fictif -- événement avec deux vitrines.',
    startDate: daysAgo(1).toISOString(),
    endDate: daysFromNow(4).toISOString()
  });
  await db.updateEvent(eventB.id, { status: 'ongoing' });
  const storefrontsB = await db.getStorefronts(eventB.id);
  const sfB1 = storefrontsB[0];
  await db.updateStorefront(sfB1.id, { name: 'Petit-déjeuner' });
  const sfB2 = await db.createStorefront(eventB.id, { name: 'Déjeuner' });

  await db.addProduct({ name: 'Café', category: 'boisson', price: 0.5, costPrice: 0.15, stock: null }, sfB1.id);
  await db.addProduct({ name: 'Croissant', category: 'dessert', price: 1.2, costPrice: 0.5, stock: 10 }, sfB1.id);

  const jambonBeurre = await db.addProduct({ name: 'Sandwich Jambon-Beurre', category: 'plat', price: 3.5, costPrice: 1.2, stock: 0 }, sfB2.id);
  await db.updateProduct(jambonBeurre.id, { lowStockThreshold: 5 });
  const pouletCrudites = await db.addProduct({ name: 'Sandwich Poulet Crudités', category: 'plat', price: 4, costPrice: 1.5, stock: 4 }, sfB2.id);
  await db.updateProduct(pouletCrudites.id, { lowStockThreshold: 5 });
  const sandwichThon = await db.addProduct({ name: 'Sandwich Thon', category: 'plat', price: 4, costPrice: 1.4, stock: 25 }, sfB2.id);
  const chips = await db.addProduct({ name: 'Chips', category: 'supplement', price: 1, costPrice: 0.3, stock: null }, sfB2.id);
  const coca = await db.addProduct({ name: 'Coca', category: 'boisson', price: 1.5, costPrice: 0.5, stock: 2 }, sfB2.id);
  await db.updateProduct(coca.id, { lowStockThreshold: 5 });

  for (let dayOffset = 1; dayOffset >= 0; dayOffset--) {
    for (let i = 0; i < rand(2, 4); i++) {
      const [login, name] = student();
      const createdAt = new Date(daysAgo(dayOffset).getTime() + rand(11, 13) * 3600000);
      const items = [
        { id: sandwichThon.id, name: sandwichThon.name, category: 'plat', price: sandwichThon.price, costPrice: sandwichThon.costPrice, quantity: 1 },
        { id: chips.id, name: chips.name, category: 'supplement', price: chips.price, costPrice: chips.costPrice, quantity: 1 }
      ];
      await createOrder({ storefrontId: sfB2.id, userLogin: login, userDisplayName: name, createdAt, status: 'completed', items });
    }
  }
  // One order still pending, to exercise the live order board too.
  {
    const [login, name] = student();
    await createOrder({
      storefrontId: sfB2.id, userLogin: login, userDisplayName: name, createdAt: new Date(), status: 'pending',
      items: [{ id: pouletCrudites.id, name: pouletCrudites.name, category: 'plat', price: pouletCrudites.price, costPrice: pouletCrudites.costPrice, quantity: 1 }]
    });
  }

  // ---------------------------------------------------------------------
  // Event C -- upcoming, single storefront, minimal catalog, no orders yet.
  // ---------------------------------------------------------------------
  const eventC = await db.createEvent({
    name: '[TEST] Soirée BDE',
    description: 'Jeu de données fictif -- événement à venir, pas encore lancé.',
    startDate: daysFromNow(10).toISOString(),
    endDate: daysFromNow(10).toISOString()
  });
  const storefrontsC = await db.getStorefronts(eventC.id);
  const sfC = storefrontsC[0];
  await db.updateStorefront(sfC.id, { name: 'Soirée' });
  await db.addProduct({ name: 'Bière', category: 'boisson', price: 2, costPrice: 0.7, stock: null }, sfC.id);
  await db.addProduct({ name: 'Chips', category: 'supplement', price: 1, costPrice: 0.3, stock: 30 }, sfC.id);
  const softDrink = await db.addProduct({ name: 'Soda', category: 'boisson', price: 1.5, costPrice: 0.5, stock: 4 }, sfC.id);
  await db.updateProduct(softDrink.id, { lowStockThreshold: 6 });

  console.log('Seeded 3 [TEST] events:');
  console.log(' -', eventA.name, '(completed, 1 storefront, ~4 days of orders)');
  console.log(' -', eventB.name, '(ongoing, 2 storefronts)');
  console.log(' -', eventC.name, '(upcoming, no orders)');
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
