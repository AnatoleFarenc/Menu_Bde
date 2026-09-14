-- AlterTable
ALTER TABLE `Category` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '📦';

-- AlterTable
ALTER TABLE `Menu` ADD COLUMN `eventId` VARCHAR(191) NULL,
    MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '🍱';

-- AlterTable
ALTER TABLE `Order` ADD COLUMN `eventId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Product` ADD COLUMN `eventId` VARCHAR(191) NULL,
    MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '🥪';

-- CreateTable
CREATE TABLE `Event` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL DEFAULT '',
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `startDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Event_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Menu_eventId_idx` ON `Menu`(`eventId`);

-- CreateIndex
CREATE INDEX `Order_eventId_idx` ON `Order`(`eventId`);

-- CreateIndex
CREATE INDEX `Product_eventId_idx` ON `Product`(`eventId`);

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Menu` ADD CONSTRAINT `Menu_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
