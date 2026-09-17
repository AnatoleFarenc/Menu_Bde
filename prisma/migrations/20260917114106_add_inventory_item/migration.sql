-- AlterTable
ALTER TABLE `Category` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '📦';

-- AlterTable
ALTER TABLE `Menu` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '🍱';

-- AlterTable
ALTER TABLE `Product` ADD COLUMN `inventoryItemId` VARCHAR(191) NULL,
    MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '🥪';

-- CreateTable
CREATE TABLE `ShoppingListItemMenu` (
    `shoppingListItemId` VARCHAR(191) NOT NULL,
    `menuId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`shoppingListItemId`, `menuId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InventoryItem` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `normalizedName` VARCHAR(191) NOT NULL,
    `stock` INTEGER NULL,
    `lowStockThreshold` INTEGER NOT NULL DEFAULT 5,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `InventoryItem_normalizedName_key`(`normalizedName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Product_inventoryItemId_idx` ON `Product`(`inventoryItemId`);

-- AddForeignKey
ALTER TABLE `ShoppingListItemMenu` ADD CONSTRAINT `ShoppingListItemMenu_shoppingListItemId_fkey` FOREIGN KEY (`shoppingListItemId`) REFERENCES `ShoppingListItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShoppingListItemMenu` ADD CONSTRAINT `ShoppingListItemMenu_menuId_fkey` FOREIGN KEY (`menuId`) REFERENCES `Menu`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_inventoryItemId_fkey` FOREIGN KEY (`inventoryItemId`) REFERENCES `InventoryItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
