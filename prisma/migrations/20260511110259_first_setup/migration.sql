-- AlterTable
ALTER TABLE `questionnaires` ADD COLUMN `doctor_network_id` INTEGER NULL,
    ADD COLUMN `intake_engine_type` VARCHAR(20) NULL,
    ADD COLUMN `offerings` JSON NULL,
    ADD COLUMN `partner_questionnaire_id` VARCHAR(50) NULL;

-- CreateTable
CREATE TABLE `datasets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `can_delete` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,

    INDEX `datasets_type_index`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscription_plans` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NOT NULL,
    `duration` INTEGER NULL,
    `status` VARCHAR(1) NOT NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,

    INDEX `subscription_plans_status_index`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plan_variant_prices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `plan_id` INTEGER NOT NULL,
    `product_id` INTEGER NULL,
    `product_variant_id` INTEGER NOT NULL,
    `crm_campaign_id` INTEGER NOT NULL,
    `shipping_profile` INTEGER NOT NULL,
    `crm_offer_id` INTEGER NOT NULL,
    `duration_weeks` INTEGER NOT NULL,
    `supply_weeks` INTEGER NOT NULL,
    `original_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `discount_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `discount_coupon` VARCHAR(100) NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,

    INDEX `plan_variant_prices_plan_id_index`(`plan_id`),
    INDEX `plan_variant_prices_product_id_index`(`product_id`),
    INDEX `plan_variant_prices_product_variant_id_index`(`product_variant_id`),
    INDEX `plan_variant_prices_crm_campaign_id_index`(`crm_campaign_id`),
    INDEX `plan_variant_prices_crm_offer_id_index`(`crm_offer_id`),
    INDEX `plan_variant_prices_shipping_profile_index`(`shipping_profile`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `crm_coupons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `discount_id` VARCHAR(255) NOT NULL,
    `crm_offer_id` INTEGER NOT NULL,
    `discount_code` VARCHAR(255) NOT NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,

    INDEX `crm_coupons_crm_offer_id_foreign`(`crm_offer_id`),
    UNIQUE INDEX `crm_coupons_discount_offer_unique`(`discount_id`, `crm_offer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `doctor_network_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `network_id` INTEGER NOT NULL,
    `access_token` LONGTEXT NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,

    INDEX `doctor_network_tokens_network_id_foreign`(`network_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `address_locations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `country` VARCHAR(255) NULL,
    `country_code` VARCHAR(10) NULL,
    `state` VARCHAR(255) NULL,
    `state_abbr` VARCHAR(20) NULL,
    `county` VARCHAR(255) NULL,
    `county_code` VARCHAR(20) NULL,
    `city` VARCHAR(255) NULL,
    `zip` VARCHAR(20) NULL,
    `latitude` DECIMAL(10, 7) NULL,
    `longitude` DECIMAL(10, 7) NULL,

    INDEX `address_locations_country_code_index`(`country_code`),
    INDEX `address_locations_state_abbr_index`(`state_abbr`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_environments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(191) NOT NULL,
    `value` LONGTEXT NULL,
    `notes` TEXT NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,

    UNIQUE INDEX `service_environments_key_unique`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `questionnaires_doctor_network_id_foreign` ON `questionnaires`(`doctor_network_id`);

-- CreateIndex
CREATE INDEX `questionnaires_partner_questionnaire_id_index` ON `questionnaires`(`partner_questionnaire_id`);

-- AddForeignKey
ALTER TABLE `questionnaires` ADD CONSTRAINT `questionnaires_doctor_network_id_foreign` FOREIGN KEY (`doctor_network_id`) REFERENCES `doctor_networks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plan_variant_prices` ADD CONSTRAINT `plan_variant_prices_plan_id_foreign` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plan_variant_prices` ADD CONSTRAINT `plan_variant_prices_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plan_variant_prices` ADD CONSTRAINT `plan_variant_prices_product_variant_id_foreign` FOREIGN KEY (`product_variant_id`) REFERENCES `product_variants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plan_variant_prices` ADD CONSTRAINT `plan_variant_prices_crm_campaign_id_foreign` FOREIGN KEY (`crm_campaign_id`) REFERENCES `crm_campaigns`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plan_variant_prices` ADD CONSTRAINT `plan_variant_prices_crm_offer_id_foreign` FOREIGN KEY (`crm_offer_id`) REFERENCES `crm_offers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plan_variant_prices` ADD CONSTRAINT `plan_variant_prices_shipping_profile_foreign` FOREIGN KEY (`shipping_profile`) REFERENCES `crm_shipping`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_coupons` ADD CONSTRAINT `crm_coupons_crm_offer_id_foreign` FOREIGN KEY (`crm_offer_id`) REFERENCES `crm_offers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `doctor_network_tokens` ADD CONSTRAINT `doctor_network_tokens_network_id_foreign` FOREIGN KEY (`network_id`) REFERENCES `doctor_networks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
