-- One stock model instead of two.
--
-- Before: a Product pointed at an InventoryItem (its sellable count, matched
-- by name) and a StockItem (a raw ingredient) could optionally be linked to
-- that same InventoryItem, with the two counts kept in sync by hand.
-- After: StockItem is the only place a count lives. A Product is either
-- `made` (a recipe of StockItems, nothing deducted automatically) or
-- `resold` (sold as-is: exactly one StockItem, deducted on every sale).
--
-- Every InventoryItem is folded into a StockItem so no count is lost:
--   1. one already linked to a StockItem -> that StockItem is kept as is
--   2. one with the same name as an unlinked StockItem -> merged into it
--   3. any other -> becomes a new StockItem (keeping the same id)

-- AlterTable
ALTER TABLE `Product` ADD COLUMN `kind` VARCHAR(191) NOT NULL DEFAULT 'made',
    ADD COLUMN `stockItemId` VARCHAR(191) NULL;

-- Scratch mapping, dropped at the end of this migration.
CREATE TABLE `_InventoryItemMap` (
    `inventoryItemId` VARCHAR(191) NOT NULL,
    `stockItemId` VARCHAR(191) NOT NULL,
    `isNew` BOOLEAN NOT NULL,

    PRIMARY KEY (`inventoryItemId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `_InventoryItemMap` (`inventoryItemId`, `stockItemId`, `isNew`)
SELECT ii.`id`, si.`id`, FALSE
FROM `InventoryItem` ii
JOIN `StockItem` si ON si.`inventoryItemId` = ii.`id`;

INSERT INTO `_InventoryItemMap` (`inventoryItemId`, `stockItemId`, `isNew`)
SELECT ii.`id`, si.`id`, FALSE
FROM `InventoryItem` ii
JOIN `StockItem` si ON si.`normalizedName` = ii.`normalizedName`
WHERE ii.`id` NOT IN (SELECT `inventoryItemId` FROM `_InventoryItemMap`);

INSERT INTO `StockItem` (`id`, `name`, `normalizedName`, `unit`, `stock`, `fullStock`, `lowStockThreshold`, `unitCost`, `createdAt`)
SELECT ii.`id`, ii.`name`, ii.`normalizedName`, NULL, ii.`stock`, NULL, ii.`lowStockThreshold`, NULL, ii.`createdAt`
FROM `InventoryItem` ii
WHERE ii.`id` NOT IN (SELECT `inventoryItemId` FROM `_InventoryItemMap`);

INSERT INTO `_InventoryItemMap` (`inventoryItemId`, `stockItemId`, `isNew`)
SELECT ii.`id`, ii.`id`, TRUE
FROM `InventoryItem` ii
WHERE ii.`id` NOT IN (SELECT `inventoryItemId` FROM `_InventoryItemMap`);

-- An existing StockItem only ever gains what it was missing.
UPDATE `StockItem` si
JOIN `_InventoryItemMap` m ON m.`stockItemId` = si.`id`
JOIN `InventoryItem` ii ON ii.`id` = m.`inventoryItemId`
SET si.`stock` = COALESCE(si.`stock`, ii.`stock`),
    si.`lowStockThreshold` = COALESCE(si.`lowStockThreshold`, ii.`lowStockThreshold`)
WHERE m.`isNew` = FALSE;

-- A product that already has a recipe is a made product, whatever else it
-- pointed at; every other product that had an InventoryItem is resold.
UPDATE `Product` p
JOIN `_InventoryItemMap` m ON m.`inventoryItemId` = p.`inventoryItemId`
SET p.`stockItemId` = m.`stockItemId`, p.`kind` = 'resold'
WHERE NOT EXISTS (SELECT 1 FROM `ProductIngredient` pi WHERE pi.`productId` = p.`id`);

-- A resold product's purchase price now lives on its article (unitCost), the
-- one place a cost is kept: every product selling that article derives its
-- costPrice from it. Keep what was typed by hand on the product.
UPDATE `StockItem` si
JOIN (
    SELECT p.`stockItemId`, MAX(p.`costPrice`) AS `costPrice`
    FROM `Product` p
    WHERE p.`kind` = 'resold' AND p.`costPrice` IS NOT NULL
    GROUP BY p.`stockItemId`
) c ON c.`stockItemId` = si.`id`
SET si.`unitCost` = c.`costPrice`
WHERE si.`unitCost` IS NULL;

-- `available` used to be overwritten with (stock > 0) on every count change;
-- from now on it is only the manual on/off switch and availability is
-- computed from the count. A leftover "false" that only meant "was at 0"
-- would otherwise stay hidden forever after a restock.
UPDATE `Product` p
JOIN `StockItem` si ON si.`id` = p.`stockItemId`
SET p.`available` = TRUE
WHERE p.`kind` = 'resold' AND si.`stock` IS NOT NULL;

-- DropForeignKey / DropIndex / DropColumn
ALTER TABLE `Product` DROP FOREIGN KEY `Product_inventoryItemId_fkey`;
DROP INDEX `Product_inventoryItemId_idx` ON `Product`;
ALTER TABLE `Product` DROP COLUMN `inventoryItemId`;

ALTER TABLE `StockItem` DROP FOREIGN KEY `StockItem_inventoryItemId_fkey`;
DROP INDEX `StockItem_inventoryItemId_key` ON `StockItem`;
ALTER TABLE `StockItem` DROP COLUMN `inventoryItemId`;

-- DropTable
DROP TABLE `_InventoryItemMap`;
DROP TABLE `InventoryItem`;

-- CreateIndex
CREATE INDEX `Product_stockItemId_idx` ON `Product`(`stockItemId`);

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_stockItemId_fkey` FOREIGN KEY (`stockItemId`) REFERENCES `StockItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
