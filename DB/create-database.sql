-- THE RIVER - schema MySQL complet
-- Si Hostinger cree deja la base depuis hPanel, garde seulement le USE
-- avec le vrai nom de ta base, puis execute les CREATE TABLE dans phpMyAdmin.

CREATE DATABASE IF NOT EXISTS `the_river_prod`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `the_river_prod`;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `users` (
  `userId` int NOT NULL AUTO_INCREMENT,
  `username` varchar(32) NOT NULL,
  `email` varchar(190) NOT NULL,
  `password` varchar(255) NOT NULL,
  `credits` int NOT NULL DEFAULT 1000,
  `points` int NOT NULL DEFAULT 0,
  `emailVerified` tinyint NOT NULL DEFAULT 0,
  `avatarUrl` varchar(500) DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`userId`),
  UNIQUE KEY `IDX_users_username` (`username`),
  UNIQUE KEY `IDX_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `email_verifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `email` varchar(190) NOT NULL,
  `codeHash` varchar(64) NOT NULL,
  `expiresAt` datetime NOT NULL,
  `usedAt` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `IDX_email_verifications_user_used` (`userId`, `usedAt`),
  KEY `IDX_email_verifications_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `password_resets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `email` varchar(190) NOT NULL,
  `codeHash` varchar(64) NOT NULL,
  `expiresAt` datetime NOT NULL,
  `usedAt` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `IDX_password_resets_user_used` (`userId`, `usedAt`),
  KEY `IDX_password_resets_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `settingsJson` longtext NOT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_user_settings_userId` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `endpoint` varchar(500) NOT NULL,
  `p256dh` varchar(190) NOT NULL,
  `auth` varchar(120) NOT NULL,
  `userAgent` varchar(255) DEFAULT NULL,
  `enabled` tinyint NOT NULL DEFAULT 1,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `IDX_push_subscriptions_userId` (`userId`),
  UNIQUE KEY `IDX_push_subscriptions_endpoint` (`endpoint`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notification_deliveries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `dedupeKey` varchar(190) NOT NULL,
  `type` varchar(80) NOT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_notification_deliveries_user_key` (`userId`, `dedupeKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `game_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `username` varchar(32) NOT NULL,
  `game` varchar(16) NOT NULL,
  `deltaCredits` int NOT NULL DEFAULT 0,
  `deltaPoints` int NOT NULL DEFAULT 0,
  `metaJson` text DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `IDX_game_events_user_createdAt` (`userId`, `createdAt`),
  KEY `IDX_game_events_game_createdAt` (`game`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_quest_states` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `questKey` varchar(64) NOT NULL,
  `lastClaimedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_user_quest_states_user_quest` (`userId`, `questKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `slot_spins` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `machine` varchar(16) NOT NULL,
  `spins` int NOT NULL,
  `totalCost` int NOT NULL,
  `totalPayout` int NOT NULL,
  `net` int NOT NULL,
  `results` text NOT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `IDX_slot_spins_userId` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `poker_tables` (
  `id` varchar(6) NOT NULL,
  `name` varchar(64) NOT NULL,
  `maxPlayers` int NOT NULL DEFAULT 6,
  `buyInAmount` int NOT NULL,
  `smallBlindAmount` int NOT NULL,
  `bigBlindAmount` int NOT NULL,
  `visibility` varchar(8) NOT NULL DEFAULT 'PRIVATE',
  `mode` varchar(16) NOT NULL DEFAULT 'CASUAL',
  `fillWithBots` tinyint NOT NULL DEFAULT 0,
  `status` varchar(16) NOT NULL DEFAULT 'OPEN',
  `phase` varchar(16) NOT NULL DEFAULT 'WAITING',
  `createdAt` varchar(32) DEFAULT NULL,
  `startedAt` varchar(32) DEFAULT NULL,
  `ownerPlayerId` varchar(32) DEFAULT NULL,
  `players` text NOT NULL,
  `hands` text NOT NULL,
  `communityCards` text NOT NULL,
  `deck` text NOT NULL,
  `burnedCards` text NOT NULL,
  `stacks` text NOT NULL,
  `pot` int NOT NULL DEFAULT 0,
  `currentBet` int NOT NULL DEFAULT 0,
  `bets` text NOT NULL,
  `foldedPlayers` text NOT NULL,
  `hasActed` text NOT NULL,
  `contributions` text NOT NULL,
  `dealerIndex` int NOT NULL DEFAULT 0,
  `bustedPlayers` text NOT NULL,
  `lastWinners` text DEFAULT NULL,
  `lastWinnerHandDescription` text DEFAULT NULL,
  `dealerPlayerId` varchar(64) DEFAULT NULL,
  `smallBlindPlayerId` varchar(64) DEFAULT NULL,
  `bigBlindPlayerId` varchar(64) DEFAULT NULL,
  `showdownHands` text DEFAULT NULL,
  `showdownEndsAt` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_poker_tables_id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `blackjack_tables` (
  `id` char(36) NOT NULL,
  `code` varchar(6) NOT NULL,
  `name` varchar(64) NOT NULL,
  `maxPlayers` int NOT NULL DEFAULT 6,
  `minBet` int NOT NULL,
  `tableMaxBet` int DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'waiting',
  `visibility` varchar(8) NOT NULL DEFAULT 'PUBLIC',
  `ownerId` int NOT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_blackjack_tables_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `blackjack_table_players` (
  `id` char(36) NOT NULL,
  `tableId` char(36) NOT NULL,
  `userId` int NOT NULL,
  `username` varchar(32) NOT NULL,
  `joinedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_blackjack_table_players_table_user` (`tableId`, `userId`),
  KEY `IDX_blackjack_table_players_tableId` (`tableId`),
  KEY `IDX_blackjack_table_players_userId` (`userId`),
  CONSTRAINT `FK_blackjack_table_players_table`
    FOREIGN KEY (`tableId`) REFERENCES `blackjack_tables` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `blackjack_games` (
  `id` char(36) NOT NULL,
  `tableId` char(36) NOT NULL,
  `stateJson` longtext NOT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_blackjack_games_tableId` (`tableId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- Optionnel si tu geres toi-meme les utilisateurs MySQL.
-- Sur Hostinger mutualise / Node Application, cree plutot l'utilisateur
-- depuis hPanel > Databases > MySQL Databases.
--
-- CREATE USER IF NOT EXISTS 'the_river_user'@'localhost'
--   IDENTIFIED BY 'REMPLACE_PAR_UN_MOT_DE_PASSE_FORT';
--
-- GRANT ALL PRIVILEGES ON `the_river_prod`.*
--   TO 'the_river_user'@'localhost';
--
-- FLUSH PRIVILEGES;
