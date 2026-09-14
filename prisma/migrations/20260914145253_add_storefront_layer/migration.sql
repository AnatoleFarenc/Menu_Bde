-- Introduces Storefront as a layer between Event and Product/Menu/Order/
-- ShoppingListItem: one event can hold several storefronts (e.g.
-- "Petit-déjeuner" + "Déjeuner"), each with its own catalog and orders.
-- Backfill: one storefront per existing event (same id prefixed "sf_",
-- same name, same isActive), then every existing row is repointed from
-- eventId to that storefront.

CREATE TABLE `Storefront` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Storefront_eventId_idx`(`eventId`),
    INDEX `Storefront_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Storefront` ADD CONSTRAINT `Storefront_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- One storefront per existing event.
INSERT INTO `Storefront` (`id`, `eventId`, `name`, `isActive`, `createdAt`)
SELECT CONCAT('sf_', `id`), `id`, `name`, `isActive`, `createdAt` FROM `Event`;

-- Product
ALTER TABLE `Product` ADD COLUMN `storefrontId` VARCHAR(191) NULL;
UPDATE `Product` SET `storefrontId` = CONCAT('sf_', `eventId`);
ALTER TABLE `Product` MODIFY `storefrontId` VARCHAR(191) NOT NULL;
ALTER TABLE `Product` DROP FOREIGN KEY `Product_eventId_fkey`;
ALTER TABLE `Product` DROP INDEX `Product_eventId_idx`;
ALTER TABLE `Product` DROP COLUMN `eventId`;
CREATE INDEX `Product_storefrontId_idx` ON `Product`(`storefrontId`);
ALTER TABLE `Product` ADD CONSTRAINT `Product_storefrontId_fkey` FOREIGN KEY (`storefrontId`) REFERENCES `Storefront`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Menu
ALTER TABLE `Menu` ADD COLUMN `storefrontId` VARCHAR(191) NULL;
UPDATE `Menu` SET `storefrontId` = CONCAT('sf_', `eventId`);
ALTER TABLE `Menu` MODIFY `storefrontId` VARCHAR(191) NOT NULL;
ALTER TABLE `Menu` DROP FOREIGN KEY `Menu_eventId_fkey`;
ALTER TABLE `Menu` DROP INDEX `Menu_eventId_idx`;
ALTER TABLE `Menu` DROP COLUMN `eventId`;
CREATE INDEX `Menu_storefrontId_idx` ON `Menu`(`storefrontId`);
ALTER TABLE `Menu` ADD CONSTRAINT `Menu_storefrontId_fkey` FOREIGN KEY (`storefrontId`) REFERENCES `Storefront`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Order
ALTER TABLE `Order` ADD COLUMN `storefrontId` VARCHAR(191) NULL;
UPDATE `Order` SET `storefrontId` = CONCAT('sf_', `eventId`);
ALTER TABLE `Order` MODIFY `storefrontId` VARCHAR(191) NOT NULL;
ALTER TABLE `Order` DROP FOREIGN KEY `Order_eventId_fkey`;
ALTER TABLE `Order` DROP INDEX `Order_eventId_idx`;
ALTER TABLE `Order` DROP COLUMN `eventId`;
CREATE INDEX `Order_storefrontId_idx` ON `Order`(`storefrontId`);
ALTER TABLE `Order` ADD CONSTRAINT `Order_storefrontId_fkey` FOREIGN KEY (`storefrontId`) REFERENCES `Storefront`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ShoppingListItem
ALTER TABLE `ShoppingListItem` ADD COLUMN `storefrontId` VARCHAR(191) NULL;
UPDATE `ShoppingListItem` SET `storefrontId` = CONCAT('sf_', `eventId`);
ALTER TABLE `ShoppingListItem` MODIFY `storefrontId` VARCHAR(191) NOT NULL;
ALTER TABLE `ShoppingListItem` DROP FOREIGN KEY `ShoppingListItem_eventId_fkey`;
ALTER TABLE `ShoppingListItem` DROP INDEX `ShoppingListItem_eventId_idx`;
ALTER TABLE `ShoppingListItem` DROP COLUMN `eventId`;
CREATE INDEX `ShoppingListItem_storefrontId_idx` ON `ShoppingListItem`(`storefrontId`);
ALTER TABLE `ShoppingListItem` ADD CONSTRAINT `ShoppingListItem_storefrontId_fkey` FOREIGN KEY (`storefrontId`) REFERENCES `Storefront`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Event no longer tracks isActive itself (Storefront.isActive is now the
-- single source of truth for "what's live").
ALTER TABLE `Event` DROP INDEX `Event_isActive_idx`;
ALTER TABLE `Event` DROP COLUMN `isActive`;
