-- AlterTable
ALTER TABLE `Category` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '📦';

-- AlterTable
ALTER TABLE `Menu` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '🍱';

-- AlterTable
ALTER TABLE `OrderItem` ADD COLUMN `category` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Product` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '🥪';
