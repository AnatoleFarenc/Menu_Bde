-- AlterTable
ALTER TABLE `Category` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '📦';

-- AlterTable
ALTER TABLE `Menu` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '🍱';

-- AlterTable
ALTER TABLE `Product` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '🥪';

-- AlterTable
ALTER TABLE `ShoppingListItem` ADD COLUMN `tripId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ShoppingTrip` (
    `id` VARCHAR(191) NOT NULL,
    `storefrontId` VARCHAR(191) NOT NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ShoppingTrip_storefrontId_idx`(`storefrontId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ShoppingListItem_tripId_idx` ON `ShoppingListItem`(`tripId`);

-- AddForeignKey
ALTER TABLE `ShoppingTrip` ADD CONSTRAINT `ShoppingTrip_storefrontId_fkey` FOREIGN KEY (`storefrontId`) REFERENCES `Storefront`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShoppingListItem` ADD CONSTRAINT `ShoppingListItem_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `ShoppingTrip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
