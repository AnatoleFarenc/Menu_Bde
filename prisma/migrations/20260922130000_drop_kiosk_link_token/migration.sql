-- DropIndex
DROP INDEX `Order_linkToken_key` ON `Order`;

-- AlterTable
ALTER TABLE `Order` DROP COLUMN `linkToken`,
    DROP COLUMN `linkTokenExpiresAt`;
