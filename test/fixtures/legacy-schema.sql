-- Generated once from the legacy bot's knex migrations (its `app/db`, on the branch `legacy`). Do not edit.

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Alias` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `aliasName` varchar(50) DEFAULT NULL,
  `roleId` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `alias_roleid_foreign` (`roleId`),
  CONSTRAINT `alias_roleid_foreign` FOREIGN KEY (`roleId`) REFERENCES `Role` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `AutoAssignRole` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `guildId` int unsigned DEFAULT NULL,
  `roleId` int unsigned DEFAULT NULL,
  `aliasId` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `autoassignrole_guildid_unique` (`guildId`),
  KEY `autoassignrole_roleid_foreign` (`roleId`),
  KEY `autoassignrole_aliasid_foreign` (`aliasId`),
  CONSTRAINT `autoassignrole_aliasid_foreign` FOREIGN KEY (`aliasId`) REFERENCES `Alias` (`id`) ON DELETE CASCADE,
  CONSTRAINT `autoassignrole_guildid_foreign` FOREIGN KEY (`guildId`) REFERENCES `Guild` (`id`) ON DELETE CASCADE,
  CONSTRAINT `autoassignrole_roleid_foreign` FOREIGN KEY (`roleId`) REFERENCES `Role` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `AutosetPokemon` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) DEFAULT NULL,
  `tier` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `autosetpokemon_name_unique` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `CommandRoleAuthorization` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `command` varchar(100) DEFAULT NULL,
  `guildId` int unsigned DEFAULT NULL,
  `roleRequired` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `commandroleauthorization_command_guildid_unique` (`command`,`guildId`),
  KEY `commandroleauthorization_guildid_foreign` (`guildId`),
  CONSTRAINT `commandroleauthorization_guildid_foreign` FOREIGN KEY (`guildId`) REFERENCES `Guild` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `CommandRoles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `command` varchar(100) DEFAULT NULL,
  `guildId` int unsigned DEFAULT NULL,
  `roleSnowflakeId` varchar(30) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `commandroles_command_guildid_rolesnowflakeid_unique` (`command`,`guildId`,`roleSnowflakeId`),
  KEY `commandroles_guildid_foreign` (`guildId`),
  CONSTRAINT `commandroles_guildid_foreign` FOREIGN KEY (`guildId`) REFERENCES `Guild` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Guild` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `snowflake` varchar(30) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `guild_snowflake_unique` (`snowflake`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Gym` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `pogoId` varchar(255) DEFAULT NULL,
  `lat` double(20,10) DEFAULT NULL,
  `lon` double(20,10) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `GymMeta` (
  `gymId` int unsigned NOT NULL,
  `nickname` varchar(255) DEFAULT NULL,
  `description` mediumtext,
  `keywords` mediumtext,
  `notice` mediumtext,
  `confirmedEx` tinyint(1) DEFAULT NULL,
  `taggedEx` tinyint(1) DEFAULT NULL,
  `imageUrl` varchar(255) DEFAULT NULL,
  `sponsor` int DEFAULT NULL,
  `geodata` mediumtext,
  `places` mediumtext,
  `nearestGym` int DEFAULT NULL,
  PRIMARY KEY (`gymId`),
  CONSTRAINT `gymmeta_gymid_foreign` FOREIGN KEY (`gymId`) REFERENCES `Gym` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `GymNotification` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `gym` varchar(50) DEFAULT NULL,
  `userId` int unsigned DEFAULT NULL,
  `guildId` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `gymnotification_guildid_foreign` (`guildId`),
  KEY `gymnotification_gym_guildid_index` (`gym`,`guildId`),
  KEY `gymnotification_userid_guildid_index` (`userId`,`guildId`),
  CONSTRAINT `gymnotification_guildid_foreign` FOREIGN KEY (`guildId`) REFERENCES `Guild` (`id`) ON DELETE CASCADE,
  CONSTRAINT `gymnotification_userid_foreign` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Pokemon` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) DEFAULT NULL,
  `tier` int unsigned DEFAULT '0',
  `exclusive` tinyint(1) DEFAULT '0',
  `shiny` tinyint(1) DEFAULT '0',
  `nickname` varchar(255) DEFAULT '',
  `mega` tinyint(1) DEFAULT '0',
  `elite` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `pokemon_name_unique` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `PokemonNotification` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `pokemon` int DEFAULT NULL,
  `guildId` int unsigned DEFAULT NULL,
  `userId` int unsigned DEFAULT NULL,
  `type` varchar(255) NOT NULL DEFAULT 'both',
  PRIMARY KEY (`id`),
  KEY `notification_guildid_foreign` (`guildId`),
  KEY `notification_pokemon_guildid_index` (`pokemon`,`guildId`),
  KEY `notification_userid_guildid_index` (`userId`,`guildId`),
  CONSTRAINT `notification_guildid_foreign` FOREIGN KEY (`guildId`) REFERENCES `Guild` (`id`) ON DELETE CASCADE,
  CONSTRAINT `notification_userid_foreign` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Region` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `bounds` polygon DEFAULT NULL,
  `guildId` int unsigned DEFAULT NULL,
  `channelId` bigint unsigned DEFAULT NULL,
  `description` text,
  PRIMARY KEY (`id`),
  KEY `region_guildid_foreign` (`guildId`),
  CONSTRAINT `region_guildid_foreign` FOREIGN KEY (`guildId`) REFERENCES `Guild` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Role` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `roleName` varchar(50) DEFAULT NULL,
  `roleDescription` varchar(150) DEFAULT NULL,
  `guildId` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `role_rolename_guildid_unique` (`roleName`,`guildId`),
  KEY `role_guildid_foreign` (`guildId`),
  CONSTRAINT `role_guildid_foreign` FOREIGN KEY (`guildId`) REFERENCES `Guild` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `SavedRoutes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `userId` int unsigned DEFAULT NULL,
  `name` varchar(100) DEFAULT NULL,
  `region` int unsigned DEFAULT NULL,
  `gyms` text,
  PRIMARY KEY (`id`),
  KEY `savedroutes_userid_foreign` (`userId`),
  KEY `savedroutes_region_foreign` (`region`),
  CONSTRAINT `savedroutes_region_foreign` FOREIGN KEY (`region`) REFERENCES `Region` (`id`) ON DELETE CASCADE,
  CONSTRAINT `savedroutes_userid_foreign` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `User` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `userSnowflake` varchar(30) DEFAULT NULL,
  `mentions` tinyint(1) NOT NULL DEFAULT '1',
  `status` int NOT NULL DEFAULT '0',
  `raidPrivacy` int NOT NULL DEFAULT '0',
  `shouts` tinyint(1) NOT NULL DEFAULT '1',
  `groups` tinyint(1) NOT NULL DEFAULT '1',
  `silph` varchar(255) DEFAULT NULL,
  `nickname` varchar(255) DEFAULT NULL,
  `friendcode` varchar(255) DEFAULT NULL,
  `raidBoss` tinyint(1) DEFAULT '0',
  `pokebattlerId` int DEFAULT NULL,
  `newTrain` tinyint(1) NOT NULL DEFAULT '0',
  `trainMovement` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_usersnowflake_unique` (`userSnowflake`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knex_migrations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) DEFAULT NULL,
  `batch` int DEFAULT NULL,
  `migration_time` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knex_migrations_lock` (
  `index` int unsigned NOT NULL AUTO_INCREMENT,
  `is_locked` int DEFAULT NULL,
  PRIMARY KEY (`index`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;



/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

/*!40000 ALTER TABLE `knex_migrations` DISABLE KEYS */;
INSERT INTO `knex_migrations` VALUES (1,'20171229-master.js',1,'2022-10-14 00:00:00'),(2,'20171230-notifications.js',1,'2022-10-14 00:00:00'),(3,'20180106-autoassignrole.js',1,'2022-10-14 00:00:00'),(4,'20180202-gymnotifications.js',1,'2022-10-14 00:00:00'),(5,'20180309-usermentions.js',1,'2022-10-14 00:00:00'),(6,'20180322-gymidasstring.js',1,'2022-10-14 00:00:00'),(7,'20180827-autostatus.js',1,'2022-10-14 00:00:00'),(8,'20181027-privacy.js',1,'2022-10-14 00:00:00'),(9,'20181127-pokemon.js',1,'2022-10-14 00:00:00'),(10,'20181221-autoset.js',1,'2022-10-14 00:00:00'),(11,'20190105-shiny.js',1,'2022-10-14 00:00:00'),(12,'20190108-usermentionrefinement.js',1,'2022-10-14 00:00:00'),(13,'20190109-spawnnotifications.js',1,'2022-10-14 00:00:00'),(14,'20190118-silphusername.js',1,'2022-10-14 00:00:00'),(15,'20190119-friendcode.js',1,'2022-10-14 00:00:00'),(16,'20190203-pokemonnickname.js',1,'2022-10-14 00:00:00'),(17,'20190204-raidbossnotifications.js',1,'2022-10-14 00:00:00'),(18,'20190225-userpokebattler.js',1,'2022-10-14 00:00:00'),(19,'20190226-bugfix.js',1,'2022-10-14 00:00:00'),(20,'20190531-region.js',1,'2022-10-14 00:00:00'),(21,'20191020-newtrain.js',1,'2022-10-14 00:00:00'),(22,'20191020-trainmovement.js',1,'2022-10-14 00:00:00'),(23,'20191022-savedroute.js',1,'2022-10-14 00:00:00'),(24,'20200422-roleauthorization.js',1,'2022-10-14 00:00:00'),(25,'20200506-region-fix-bounds-regression.js',1,'2022-10-14 00:00:00'),(26,'20200825-pokemon-mega.js',1,'2022-10-14 00:00:00'),(27,'20221014-pokemon-elite.js',1,'2022-10-14 00:00:00');
/*!40000 ALTER TABLE `knex_migrations` ENABLE KEYS */;

/*!40000 ALTER TABLE `knex_migrations_lock` DISABLE KEYS */;
INSERT INTO `knex_migrations_lock` VALUES (1,0);
/*!40000 ALTER TABLE `knex_migrations_lock` ENABLE KEYS */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

