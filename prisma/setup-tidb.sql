-- ============================================================================
-- Pending Kiriman IEG — setup manual di TiDB Cloud (SQL Editor / Chat2Query)
-- Alternatif dari `npm run setup`. Jalankan SEKALI, berurutan dari atas.
-- Struktur sama persis dengan prisma/schema.prisma, jadi `npx prisma db push`
-- sesudahnya tidak akan mengubah apa pun.
-- ============================================================================

-- 1) Database
CREATE DATABASE IF NOT EXISTS pending_kiriman
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE pending_kiriman;

-- 2) Tabel
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(191) NOT NULL,
  `username` VARCHAR(64) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `role` ENUM('ADMIN','FULFILLMENT','INVENTORY','VIEWER') NOT NULL DEFAULT 'FULFILLMENT',
  `active` BOOLEAN NOT NULL DEFAULT true,
  `passwordHash` VARCHAR(255) NOT NULL,
  `isLead` BOOLEAN NOT NULL DEFAULT false,
  `mustChangePassword` BOOLEAN NOT NULL DEFAULT true,
  `sessionVersion` INTEGER NOT NULL DEFAULT 1,
  `lastLoginAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `users_username_key`(`username`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `pending_orders` (
  `orderId` VARCHAR(64) NOT NULL,
  `firstPendingAt` DATETIME(3) NOT NULL,
  `ocsFound` BOOLEAN NULL,
  `ocsStatusCode` INTEGER NULL,
  `ocsStatusName` VARCHAR(64) NULL,
  `ocsRawStatus` VARCHAR(120) NULL,
  `platform` VARCHAR(32) NULL,
  `shopName` VARCHAR(64) NULL,
  `area` VARCHAR(64) NULL,
  `orderType` VARCHAR(8) NULL,
  `trackingNumber` VARCHAR(120) NULL,
  `orderCreatedAt` DATETIME(3) NULL,
  `ocsSkus` JSON NULL,
  `resolution` ENUM('OPEN','PROCESSED','CANCELLED') NOT NULL DEFAULT 'OPEN',
  `processedAt` DATETIME(3) NULL,
  `cancelledAt` DATETIME(3) NULL,
  `manualResolution` BOOLEAN NOT NULL DEFAULT false,
  `lastCheckedAt` DATETIME(3) NULL,
  `lastCheckError` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `pending_orders_resolution_idx`(`resolution`),
  INDEX `pending_orders_firstPendingAt_idx`(`firstPendingAt`),
  INDEX `pending_orders_lastCheckedAt_idx`(`lastCheckedAt`),
  PRIMARY KEY (`orderId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `pending_items` (
  `id` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(64) NOT NULL,
  `sku` VARCHAR(120) NOT NULL,
  `qty` INTEGER NOT NULL,
  `note` VARCHAR(500) NULL,
  `skuInOrder` BOOLEAN NULL,
  `inputById` VARCHAR(32) NOT NULL,
  `inputByName` VARCHAR(120) NOT NULL,
  `inputAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `isPhaseOut` BOOLEAN NOT NULL DEFAULT false,
  `phaseOutInfo` VARCHAR(255) NULL,
  `isClearance` BOOLEAN NOT NULL DEFAULT false,
  `reason` VARCHAR(120) NULL,
  `reasonNote` TEXT NULL,
  `poStatus` ENUM('BELUM','SUDAH','TIDAK_PERLU') NOT NULL DEFAULT 'BELUM',
  `poNumber` VARCHAR(64) NULL,
  `poDate` DATETIME(3) NULL,
  `poEta` DATETIME(3) NULL,
  `poQty` INTEGER NULL,
  `arrivalStatus` ENUM('BELUM','SEBAGIAN','SUDAH') NOT NULL DEFAULT 'BELUM',
  `arrivedAt` DATETIME(3) NULL,
  `arrivedQty` INTEGER NULL,
  `followUpById` VARCHAR(32) NULL,
  `followUpByName` VARCHAR(120) NULL,
  `followUpAt` DATETIME(3) NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `pending_items_orderId_idx`(`orderId`),
  INDEX `pending_items_sku_idx`(`sku`),
  INDEX `pending_items_inputAt_idx`(`inputAt`),
  UNIQUE INDEX `pending_items_orderId_sku_key`(`orderId`, `sku`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `item_logs` (
  `id` VARCHAR(191) NOT NULL,
  `itemId` VARCHAR(32) NULL,
  `orderId` VARCHAR(64) NOT NULL,
  `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `byName` VARCHAR(120) NOT NULL,
  `action` VARCHAR(40) NOT NULL,
  `detail` TEXT NULL,
  INDEX `item_logs_itemId_idx`(`itemId`),
  INDEX `item_logs_orderId_idx`(`orderId`),
  INDEX `item_logs_at_idx`(`at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `phase_out_skus` (
  `sku` VARCHAR(120) NOT NULL,
  `sourceKey` VARCHAR(160) NOT NULL,
  `name` VARCHAR(255) NULL,
  `reason` VARCHAR(160) NULL,
  `disposition` VARCHAR(32) NULL,
  `replacement` VARCHAR(120) NULL,
  `syncedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`sku`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `sync_runs` (
  `id` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(16) NOT NULL,
  `trigger` VARCHAR(16) NOT NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finishedAt` DATETIME(3) NULL,
  `ok` BOOLEAN NOT NULL DEFAULT false,
  `checked` INTEGER NOT NULL DEFAULT 0,
  `changed` INTEGER NOT NULL DEFAULT 0,
  `message` TEXT NULL,
  INDEX `sync_runs_kind_startedAt_idx`(`kind`, `startedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `app_settings` (
  `key` VARCHAR(64) NOT NULL,
  `value` TEXT NOT NULL,
  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

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

-- 3) Admin pertama — login: admin / Admin123!  (wajib ganti password saat login pertama)
INSERT IGNORE INTO `users` (`id`, `username`, `name`, `role`, `active`, `passwordHash`, `mustChangePassword`, `sessionVersion`, `createdAt`, `updatedAt`)
VALUES ('cadmin0000000000000000001', 'admin', 'Administrator', 'ADMIN', true,
  'scrypt$16384$8$1$UXOQKcjArY0wjPLfQnBuwg==$ONrAJCtGGnY0KONSBs9PYWoTFIxXFQciFgu9EsRYc7BoVuV1P2dpXAjjRIowAGTtcqm08G7UbHukda8NNmLARA==',
  true, 1, NOW(3), NOW(3));

-- 4) Cek hasil
SHOW TABLES;
SELECT username, name, role, active FROM users;
