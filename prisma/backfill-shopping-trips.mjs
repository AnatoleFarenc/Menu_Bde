// One-time backfill for the ShoppingTrip model (Courses tab: close a trip,
// see its history). Run once, between the two `add_shopping_trip` /
// `require_shopping_list_item_trip_id` migrations, same pattern as
// backfill-events.mjs:
//   1. `prisma migrate dev --name add_shopping_trip` (nullable tripId)
//   2. this script
//   3. `prisma migrate dev --name require_shopping_list_item_trip_id`
//
//   node prisma/backfill-shopping-trips.mjs
//
// For every storefront with ShoppingListItem rows that have no tripId yet,
// creates one open ShoppingTrip (closedAt: null) and attaches them all to
// it -- so nothing existing gets silently closed or lost, it just becomes
// each storefront's current open trip.
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

async function main() {
  const orphanItems = await prisma.shoppingListItem.findMany({
    where: { tripId: null },
    select: { id: true, storefrontId: true }
  });

  const storefrontIds = [...new Set(orphanItems.map(i => i.storefrontId))];
  console.log(`Found ${orphanItems.length} orphan item(s) across ${storefrontIds.length} storefront(s).`);

  for (const storefrontId of storefrontIds) {
    const trip = await prisma.shoppingTrip.create({ data: { storefrontId, closedAt: null } });
    const { count } = await prisma.shoppingListItem.updateMany({
      where: { storefrontId, tripId: null },
      data: { tripId: trip.id }
    });
    console.log(`  storefront ${storefrontId}: created trip ${trip.id}, attached ${count} item(s)`);
  }

  console.log('Done.');
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
