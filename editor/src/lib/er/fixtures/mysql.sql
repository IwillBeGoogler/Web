/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
# mysql style comment
SET FOREIGN_KEY_CHECKS=0;
DROP TABLE IF EXISTS `customers`;
CREATE TABLE `customers` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `email` varchar(190) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'login email',
  `status` enum('active','blocked') NOT NULL DEFAULT 'active',
  `updated` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `key` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_email` (`email`),
  KEY `idx_status` (`status`, `updated`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4;

CREATE TABLE `invoices` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `customer_id` int unsigned NOT NULL,
  `parent_id` bigint NULL,
  `amount` decimal(12,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_customer` (`customer_id`),
  CONSTRAINT `fk_inv_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_inv_parent` FOREIGN KEY (`parent_id`) REFERENCES `invoices` (`id`)
) ENGINE=InnoDB;
