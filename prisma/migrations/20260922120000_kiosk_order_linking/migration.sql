-- AlterTable
ALTER TABLE `Order` ADD COLUMN `isKioskOrder` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `linkToken` VARCHAR(191) NULL,
    ADD COLUMN `linkTokenExpiresAt` DATETIME(3) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Order_linkToken_key` ON `Order`(`linkToken`);
