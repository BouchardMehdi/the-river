-- THE RIVER - creation de la base MySQL
-- A executer uniquement si ton hebergement te laisse creer la base en SQL.
-- Sur Hostinger, le plus courant est de creer la base depuis hPanel,
-- puis de reprendre le nom exact dans DB_DATABASE.

CREATE DATABASE IF NOT EXISTS `the_river_prod`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

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
