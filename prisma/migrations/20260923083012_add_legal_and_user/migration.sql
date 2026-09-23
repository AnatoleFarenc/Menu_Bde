-- AlterTable
ALTER TABLE `Category` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '📦';

-- AlterTable
ALTER TABLE `Menu` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '🍱';

-- AlterTable
ALTER TABLE `Product` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '🥪';

-- CreateTable
CREATE TABLE `User` (
    `login` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`login`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LegalDocument` (
    `id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `publishedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `publishedBy` VARCHAR(191) NULL,

    INDEX `LegalDocument_kind_idx`(`kind`),
    UNIQUE INDEX `LegalDocument_kind_version_key`(`kind`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CguAcceptance` (
    `id` VARCHAR(191) NOT NULL,
    `userLogin` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `acceptedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CguAcceptance_userLogin_idx`(`userLogin`),
    UNIQUE INDEX `CguAcceptance_userLogin_documentId_key`(`userLogin`, `documentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CguAcceptance` ADD CONSTRAINT `CguAcceptance_userLogin_fkey` FOREIGN KEY (`userLogin`) REFERENCES `User`(`login`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CguAcceptance` ADD CONSTRAINT `CguAcceptance_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `LegalDocument`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
