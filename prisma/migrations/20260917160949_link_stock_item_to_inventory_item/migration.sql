-- AlterTable
ALTER TABLE `StockItem` ADD COLUMN `inventoryItemId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `StockItem_inventoryItemId_key` ON `StockItem`(`inventoryItemId`);

-- AddForeignKey
ALTER TABLE `StockItem` ADD CONSTRAINT `StockItem_inventoryItemId_fkey` FOREIGN KEY (`inventoryItemId`) REFERENCES `InventoryItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
