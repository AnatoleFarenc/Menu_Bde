// One-time recovery: imports the ORDER HISTORY from the old server/data/db.json
// (the pre-MariaDB, file-based backend) into a dedicated, never-active
// "Archive" event/storefront. Catalog data (categories/products/menus/
// templates) from that era is deliberately NOT re-imported -- it's the old
// menu, not useful today, and every OrderItem/OrderItemChoice is already a
// self-contained snapshot (name/price/category frozen at order time, no
// foreign key to a live Product), so the order history stands on its own
// without it. See prisma/schema.prisma: every Order needs a storefrontId,
// which this script provides via the archive storefront it creates.
//
//   node prisma/import-from-json.mjs
//
// Safe to run only ONCE per environment: re-running would violate the
// unique orderNumber constraint on some rows and duplicate the rest. If you
// need to redo it, delete the "Archive (pre-MariaDB)" event first (deleting
// an Event cascades to its Storefronts/Orders, see onDelete: Cascade in the
// schema).
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
    throw new Error(`File not found: ${DB_FILE}`);
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

// Extracts the products chosen in a "meal deal" order line, whatever the
// historical format (array [{label, product}] or key/value object).
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
  const orders = data.orders || [];
  if (orders.length === 0) {
    console.log('No orders in server/data/db.json -- nothing to import.');
    return;
  }

  const dates = orders.map(o => new Date(o.createdAt)).filter(d => !isNaN(d));
  const startDate = dates.length ? new Date(Math.min(...dates)) : null;
  const endDate = dates.length ? new Date(Math.max(...dates)) : null;

  console.log('▶ Creating the archive event/storefront...');
  const event = await prisma.event.create({
    data: {
      name: 'Archive (pré-MariaDB)',
      description: `Historique des ${orders.length} commandes importées depuis l'ancien server/data/db.json (backend fichier, avant la migration vers MariaDB).`,
      status: 'completed',
      startDate,
      endDate
    }
  });
  const storefront = await prisma.storefront.create({
    data: { eventId: event.id, name: 'Archive', isActive: false }
  });

  console.log(`▶ Importing ${orders.length} orders...`);
  const seenOrderNumbers = new Set();
  let imported = 0;
  for (const order of orders) {
    let orderNumber = order.orderNumber;
    if (!orderNumber || seenOrderNumbers.has(orderNumber)) {
      // Historical duplicate/missing orderNumber (a generation bug never
      // checked before this cleanup): suffixed to satisfy the unique
      // constraint, the original is still visible in server/data/db.json.
      orderNumber = `${orderNumber || 'ARCHIVE'}-${order.id}`;
      console.warn(`  ⚠️  duplicate/missing orderNumber for order ${order.id} → renamed to "${orderNumber}"`);
    }
    seenOrderNumbers.add(orderNumber);

    await prisma.order.create({
      data: {
        id: order.id,
        storefrontId: storefront.id,
        orderNumber,
        status: order.status || 'completed',
        isPaid: !!order.isPaid,
        isFree: !!order.isFree,
        isKioskOrder: false,
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
    imported++;
  }

  console.log('');
  console.log('✅ Import complete:', { event: event.name, eventId: event.id, ordersImported: imported });
}

main()
  .catch(error => {
    console.error('❌ Import failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
