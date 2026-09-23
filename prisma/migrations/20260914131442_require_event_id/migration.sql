-- DropForeignKey
ALTER TABLE `Menu` DROP FOREIGN KEY `Menu_eventId_fkey`;

-- DropForeignKey
ALTER TABLE `Order` DROP FOREIGN KEY `Order_eventId_fkey`;

-- DropForeignKey
ALTER TABLE `Product` DROP FOREIGN KEY `Product_eventId_fkey`;

-- AlterTable
ALTER TABLE `Category` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '📦';

-- AlterTable
ALTER TABLE `Menu` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '🍱',
    MODIFY `eventId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `Order` MODIFY `eventId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `Product` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '🥪',
    MODIFY `eventId` VARCHAR(191) NOT NULL;

-- DropTable
DROP TABLE `Template`;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Menu` ADD CONSTRAINT `Menu_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

