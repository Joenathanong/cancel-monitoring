-- ============================================================================
-- Update 13 Okt 2026 — Monitoring Cancel
-- Jalankan SEKALI di TiDB Cloud SQL Editor (database pending_kiriman).
-- Struktur sama persis dengan prisma/schema.prisma.
-- ============================================================================
USE pending_kiriman;

-- 1) Tanda Lead di pengguna (boleh mereview kesalahan cancel)
ALTER TABLE `users` ADD COLUMN `isLead` BOOLEAN NOT NULL DEFAULT false;

-- 2) Order CANCELLED dari OCS
CREATE TABLE IF NOT EXISTS `cancel_orders` (
  `orderId` VARCHAR(64) NOT NULL,
  `statusCode` INTEGER NOT NULL,
  `platform` VARCHAR(32) NULL,
  `shopName` VARCHAR(64) NULL,
  `area` VARCHAR(64) NULL,
  `orderType` VARCHAR(8) NULL,
  `isInstant` BOOLEAN NOT NULL DEFAULT false,
  `pickId` VARCHAR(40) NULL,
  `totalQty` INTEGER NULL,
  `productName` VARCHAR(255) NULL,
  `orderCreatedAt` DATETIME(3) NOT NULL,
  `ocsUpdatedAt` DATETIME(3) NOT NULL,
  `calendarHours` DOUBLE NOT NULL,
  `detailedAt` DATETIME(3) NULL,
  `detailError` VARCHAR(500) NULL,
  `readyAt` DATETIME(3) NULL,
  `cancelledAt` DATETIME(3) NULL,
  `maxCodeBeforeCancel` INTEGER NULL,
  `lastStatusBeforeCancel` VARCHAR(64) NULL,
  `hasPicklist` BOOLEAN NULL,
  `picked` BOOLEAN NULL,
  `packed` BOOLEAN NULL,
  `pickFailed` BOOLEAN NULL,
  `picklistNo` VARCHAR(40) NULL,
  `pickerId` VARCHAR(64) NULL,
  `packerId` VARCHAR(64) NULL,
  `ocsLogs` JSON NULL,
  `reviewStatus` ENUM('BELUM','VALID','BUKAN_GUDANG') NOT NULL DEFAULT 'BELUM',
  `reviewTeam` ENUM('FULFILLMENT','INVENTORY') NULL,
  `reviewReason` VARCHAR(160) NULL,
  `reviewNote` TEXT NULL,
  `reviewedBy` VARCHAR(120) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `cancel_orders_orderCreatedAt_idx`(`orderCreatedAt`),
  INDEX `cancel_orders_ocsUpdatedAt_idx`(`ocsUpdatedAt`),
  INDEX `cancel_orders_detailedAt_calendarHours_idx`(`detailedAt`, `calendarHours`),
  PRIMARY KEY (`orderId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- 3) Jumlah order & cancel per hari (rasio cancel)
CREATE TABLE IF NOT EXISTS `cancel_daily` (
  `day` VARCHAR(10) NOT NULL,
  `totalOrders` INTEGER NOT NULL,
  `cancelled` INTEGER NOT NULL,
  `syncedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- 4) Cek
SHOW TABLES;
SHOW COLUMNS FROM `users` LIKE 'isLead';
