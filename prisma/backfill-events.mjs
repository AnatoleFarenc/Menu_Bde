// One-time backfill for the Event model (Phase 01 of the roadmap).
// Run once, between the two `add_event_model` migrations:
//   1. `prisma migrate dev --name add_event_model` (nullable eventId columns)
//   2. this script
//   3. `prisma migrate dev --name require_event_id` (makes eventId required,
//      drops the Template table)
//
//   node prisma/backfill-events.mjs "Name for the current live catalog"
//
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

const currentEventName = process.argv[2];
if (!currentEventName) {
  console.error('Usage: node prisma/backfill-events.mjs "Name for the current live catalog"');
  process.exit(1);
}

// Recreates products/menus from a JSON snapshot (template) as real rows
// scoped to the given event. Returns nothing; ids are freshly generated,
// old ids from the snapshot are only used to remap menu group references.
async function recreateCatalogForEvent(eventId, products, menus) {
  const idMap = new Map(); // old snapshot product id -> new row id
  const knownCategoryIds = new Set((await prisma.category.findMany()).map(c => c.id));

  for (const product of products || []) {
    if (!knownCategoryIds.has(product.category)) continue; // category no longer exists, skip
    const created = await prisma.product.create({
      data: {
        eventId,
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
    idMap.set(product.id, created.id);
  }

  for (const menu of menus || []) {
    const createdMenu = await prisma.menu.create({
      data: {
        eventId,
        name: menu.name,
        price: parseFloat(menu.price) || 0,
        description: menu.description || '',
        badge: menu.badge || '',
        available: menu.available !== false,
        icon: menu.icon || '🍱'
      }
    });
    for (const [index, group] of (menu.groups || []).entries()) {
      const remappedProductIds = (group.productIds || [])
        .map(oldId => idMap.get(oldId))
        .filter(Boolean);
      await prisma.menuGroup.create({
        data: {
          menuId: createdMenu.id,
          name: group.name || '',
          position: index,
          products: { create: remappedProductIds.map(productId => ({ productId })) }
        }
      });
    }
  }
}

async function main() {
  console.log('▶ Turning saved templates into historical events...');
  const templates = await prisma.template.findMany();
  for (const template of templates) {
    const event = await prisma.event.create({
      data: {
        name: template.name,
        description: template.description || '',
        isActive: false,
        createdAt: template.createdAt
      }
    });
    await recreateCatalogForEvent(event.id, template.products, template.menus);
    console.log(`  - "${template.name}" -> event ${event.id}`);
  }

  console.log(`▶ Creating the active event for the current live catalog: "${currentEventName}"...`);
  const currentEvent = await prisma.event.create({
    data: { name: currentEventName, description: '', isActive: true }
  });

  const productsUpdated = await prisma.product.updateMany({
    where: { eventId: null },
    data: { eventId: currentEvent.id }
  });
  const menusUpdated = await prisma.menu.updateMany({
    where: { eventId: null },
    data: { eventId: currentEvent.id }
  });
  const ordersUpdated = await prisma.order.updateMany({
    where: { eventId: null },
    data: { eventId: currentEvent.id }
  });

  console.log('');
  console.log('✅ Backfill complete:', {
    historicalEvents: templates.length,
    currentEvent: currentEvent.id,
    productsAttached: productsUpdated.count,
    menusAttached: menusUpdated.count,
    ordersAttached: ordersUpdated.count
  });
}

main()
  .catch(error => {
    console.error('❌ Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
