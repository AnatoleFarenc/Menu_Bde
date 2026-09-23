/*
  Warnings:

  - Made the column `tripId` on table `ShoppingListItem` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `ShoppingListItem` DROP FOREIGN KEY `ShoppingListItem_tripId_fkey`;

-- AlterTable
ALTER TABLE `Category` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '📦';

-- AlterTable
ALTER TABLE `Menu` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '🍱';

-- AlterTable
ALTER TABLE `Product` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '🥪';

-- AlterTable
ALTER TABLE `ShoppingListItem` MODIFY `tripId` VARCHAR(191) NOT NULL;

-- AddForeignKey
ALTER TABLE `ShoppingListItem` ADD CONSTRAINT `ShoppingListItem_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `ShoppingTrip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
