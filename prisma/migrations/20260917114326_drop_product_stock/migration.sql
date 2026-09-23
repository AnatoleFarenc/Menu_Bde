-- Data already migrated to InventoryItem by prisma/backfill-inventory-items.mjs
-- (run between this migration and the prior `add_inventory_item` one).
-- AlterTable
ALTER TABLE `Product` DROP COLUMN `stock`,
    DROP COLUMN `lowStockThreshold`;
