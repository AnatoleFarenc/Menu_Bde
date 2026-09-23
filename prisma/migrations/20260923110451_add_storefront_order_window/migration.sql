-- AlterTable
ALTER TABLE `Category` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '📦';

-- AlterTable
ALTER TABLE `Menu` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '🍱';

-- AlterTable
ALTER TABLE `Product` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '🥪';

-- AlterTable
ALTER TABLE `Storefront` ADD COLUMN `orderWindowEnd` VARCHAR(191) NULL,
    ADD COLUMN `orderWindowStart` VARCHAR(191) NULL;
