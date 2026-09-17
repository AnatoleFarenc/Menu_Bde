// One-time backfill for the InventoryItem model (shared stock across every
// storefront/event, matched by name). Run once, between the two
// `add_inventory_item` / `drop_product_stock` migrations, same pattern as
// backfill-events.mjs:
//   1. `prisma migrate dev --name add_inventory_item` (adds InventoryItem +
//      Product.inventoryItemId, Product.stock/lowStockThreshold kept for now)
//   2. this script
//   3. `prisma migrate dev --name drop_product_stock` (removes the two
//      now-migrated columns from Product)
//
//   node prisma/backfill-inventory-items.mjs
//
// Groups every existing Product by name (trimmed/lowercased) and creates
// one InventoryItem per group, then links every product in it. The shared
// stock is seeded from NON-completed events' products only (ongoing/
// upcoming) -- summing in a completed event's leftover stock would just
// resurrect a stale number nobody should still be counting today; those
// products still get linked (for consistent lookups going forward), their
// own historical stock value just isn't added to the live total.
// lowStockThreshold is the lowest one set across the group (warn sooner
// rather than later on a merged, larger shared count).
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

const normalize = name => name.trim().toLowerCase();

async function main() {
  const products = await prisma.product.findMany({
    include: { storefront: { include: { event: true } } }
  });

  const groups = new Map(); // normalizedName -> { name, products: [] }
  for (const p of products) {
    const key = normalize(p.name);
    if (!groups.has(key)) groups.set(key, { name: p.name.trim(), products: [] });
    groups.get(key).products.push(p);
  }

  console.log(`Found ${products.length} product(s) across ${groups.size} distinct name(s).`);

  for (const [normalizedName, group] of groups) {
    const nonCompletedTracked = group.products.filter(
      p => p.storefront.event.status !== 'completed' && p.stock !== null && p.stock !== undefined
    );
    const stock = nonCompletedTracked.length > 0
      ? nonCompletedTracked.reduce((sum, p) => sum + p.stock, 0)
      : null;
    const lowStockThreshold = Math.min(...group.products.map(p => p.lowStockThreshold ?? 5));

    const item = await prisma.inventoryItem.upsert({
      where: { normalizedName },
      create: { name: group.name, normalizedName, stock, lowStockThreshold },
      update: { stock, lowStockThreshold }
    });
    const { count } = await prisma.product.updateMany({
      where: { id: { in: group.products.map(p => p.id) } },
      data: { inventoryItemId: item.id }
    });
    console.log(`  "${group.name}": stock=${stock ?? 'illimité'}, threshold=${lowStockThreshold}, linked ${count} product(s)`);
  }

  console.log('Done.');
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
