-- CreateTable
CREATE TABLE `crms` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `credentials` LONGTEXT NOT NULL,
    `type` ENUM('vrio', 'checkoutchamp') NOT NULL DEFAULT 'vrio',
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `crm_campaigns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `crm_id` INTEGER NOT NULL,
    `campaign_id` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,

    INDEX `crm_campaign_crm_id_fk`(`crm_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `crm_offers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `offer_id` VARCHAR(255) NOT NULL,
    `crm_id` INTEGER NOT NULL,
    `crm_campaign_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,

    INDEX `crm_offers_crm_campaign_id_fk`(`crm_campaign_id`),
    INDEX `crm_offers_crm_id_fk`(`crm_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `crm_shipping` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `crm_id` INTEGER NOT NULL,
    `shipping_profile_id` INTEGER NOT NULL,
    `crm_campaign_id` INTEGER NOT NULL,
    `shipping_profile` VARCHAR(100) NOT NULL,
    `shipping_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,

    INDEX `crm_shipping_crm_campaign_id_fk`(`crm_campaign_id`),
    INDEX `crm_shipping_crm_id_foreign`(`crm_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `doctor_networks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `api_url` VARCHAR(255) NOT NULL,
    `api_version` VARCHAR(255) NULL,
    `credentials` LONGTEXT NOT NULL,
    `type` ENUM('mdi') NOT NULL DEFAULT 'mdi',
    `intro_video_states` LONGTEXT NOT NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `doctor_network_offers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `doctor_network_id` INTEGER NOT NULL,
    `offerable_id` VARCHAR(255) NULL,
    `name` VARCHAR(255) NULL,
    `meta_data` VARCHAR(255) NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,
    `days_of_supply` INTEGER NOT NULL DEFAULT 0,
    `dispense_unit` VARCHAR(255) NULL,
    `refills` INTEGER NOT NULL DEFAULT 0,
    `prescription_duration` INTEGER NOT NULL DEFAULT 0,
    `pharmacy` VARCHAR(255) NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,

    INDEX `doctor_network_offers_doctor_network_id_foreign`(`doctor_network_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `questionnaires` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NULL,
    `questions` LONGTEXT NOT NULL,
    `type` ENUM('general', 'medical', 'swap', 'vitals') NOT NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,
    `deleted_by` INTEGER NULL,
    `deleted_at` TIMESTAMP(0) NULL,

    INDEX `questionnaires_status_index`(`status`),
    INDEX `questionnaires_type_index`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `keypoints` LONGTEXT NULL,
    `product_group_name` VARCHAR(255) NULL,
    `product_slug_name` VARCHAR(255) NULL,
    `meta_data` VARCHAR(255) NULL,
    `product_category` VARCHAR(255) NULL,
    `product_type` VARCHAR(255) NULL,
    `product_classification` ENUM('main', 'upsell', 'supply', 'titration', 'lab') NOT NULL DEFAULT 'main',
    `is_upsell` BOOLEAN NOT NULL DEFAULT false,
    `image` LONGTEXT NULL,
    `restricted_state` LONGTEXT NULL,
    `block_military_bases` BOOLEAN NOT NULL DEFAULT false,
    `block_islands` BOOLEAN NOT NULL DEFAULT false,
    `display_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `generic_question` INTEGER NULL,
    `medical_question` INTEGER NULL,
    `change_medicine_question` INTEGER NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,
    `meta_title` VARCHAR(255) NULL,
    `meta_description` TEXT NULL,
    `meta_keywords` VARCHAR(255) NULL,
    `og_image` VARCHAR(255) NULL,
    `swappable_campaign_id` INTEGER NULL,
    `renewal_campaign_id` INTEGER NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,
    `deleted_by` INTEGER NULL,
    `deleted_at` TIMESTAMP(0) NULL,

    UNIQUE INDEX `products_product_slug_name_unique`(`product_slug_name`),
    INDEX `products_change_medicine_question_fk`(`change_medicine_question`),
    INDEX `products_generic_question_fk`(`generic_question`),
    INDEX `products_medical_question_id_fk`(`medical_question`),
    INDEX `products_renewal_campaign_id_fk`(`renewal_campaign_id`),
    INDEX `products_status_index`(`status`),
    INDEX `products_swappable_campaign_id_fk`(`swappable_campaign_id`),
    INDEX `products_product_slug_name_index`(`product_slug_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_variants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `variant_name` VARCHAR(255) NOT NULL,
    `product_id` INTEGER NOT NULL,
    `crm_offer_id` INTEGER NULL,
    `doctor_network_id` INTEGER NULL,
    `doc_network_offering_id` VARCHAR(100) NOT NULL,
    `is_supply_available` BOOLEAN NOT NULL DEFAULT false,
    `is_titration_available` BOOLEAN NOT NULL DEFAULT false,
    `description` TEXT NULL,
    `image` VARCHAR(255) NULL,
    `gender` ENUM('male', 'female', 'both') NOT NULL DEFAULT 'both',
    `crm_item` VARCHAR(255) NULL,
    `shipping_profile` INTEGER NULL,
    `pharmacy` VARCHAR(255) NULL,
    `crm_campaign_id` INTEGER NULL,
    `doctor_quantity` INTEGER NOT NULL DEFAULT 0,
    `doctor_prescription_duration` INTEGER NOT NULL DEFAULT 0,
    `selling_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `refills` INTEGER NOT NULL DEFAULT 0,
    `days_supplies` INTEGER NOT NULL DEFAULT 0,
    `dispense_units` INTEGER NOT NULL DEFAULT 0,
    `is_popular` BOOLEAN NOT NULL DEFAULT false,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `variant_order` TINYINT NOT NULL DEFAULT 1,
    `block_armed_military` BOOLEAN NOT NULL DEFAULT false,
    `block_island_territories` BOOLEAN NOT NULL DEFAULT false,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,
    `deleted_at` TIMESTAMP(0) NULL,

    INDEX `product_variants_crm_campaign_id_fk`(`crm_campaign_id`),
    INDEX `product_variants_crm_offer_id_fk`(`crm_offer_id`),
    INDEX `product_variants_doc_network_offering_id_index`(`doc_network_offering_id`),
    INDEX `product_variants_doctor_network_id_fk`(`doctor_network_id`),
    INDEX `product_variants_is_popular_index`(`is_popular`),
    INDEX `product_variants_product_id_fk`(`product_id`),
    INDEX `product_variants_shipping_profile_fk`(`shipping_profile`),
    INDEX `product_variants_status_index`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `swapable_products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `swapable_product_id` INTEGER NOT NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,

    INDEX `swapable_products_product_id_foreign`(`product_id`),
    INDEX `swapable_products_swapable_product_id_foreign`(`swapable_product_id`),
    UNIQUE INDEX `swapable_products_product_id_swapable_product_id_key`(`product_id`, `swapable_product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_related_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `variant_id` INTEGER NULL,
    `type` ENUM('supply', 'titration') NOT NULL,
    `additional_product_id` INTEGER NOT NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,

    INDEX `product_related_items_additional_product_id_foreign`(`additional_product_id`),
    INDEX `product_related_items_product_id_foreign`(`product_id`),
    INDEX `product_related_items_variant_id_foreign`(`variant_id`),
    UNIQUE INDEX `product_related_items_product_id_variant_id_additional_produ_key`(`product_id`, `variant_id`, `additional_product_id`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `funnels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `funnel_name` VARCHAR(255) NOT NULL,
    `crm_campaign_id` INTEGER NOT NULL,
    `swappable_campaign_id` INTEGER NULL,
    `renewal_campaign_id` INTEGER NULL,
    `display_default` BOOLEAN NOT NULL DEFAULT false,
    `slug` VARCHAR(255) NOT NULL,
    `image` VARCHAR(255) NULL,
    `description` VARCHAR(255) NULL,
    `short_description` VARCHAR(255) NULL,
    `redirect_type` ENUM('soft', 'hard') NOT NULL DEFAULT 'soft',
    `redirect_funnel_id` INTEGER NULL,
    `promo_slug` VARCHAR(255) NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `meta_title` VARCHAR(255) NULL,
    `meta_description` TEXT NULL,
    `meta_keywords` VARCHAR(255) NULL,
    `og_image` VARCHAR(255) NULL,
    `template` VARCHAR(255) NOT NULL DEFAULT 'default',
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,
    `deleted_by` INTEGER NULL,
    `deleted_at` TIMESTAMP(0) NULL,

    INDEX `funnels_crm_campaign_id_fk`(`crm_campaign_id`),
    INDEX `funnels_display_default_index`(`display_default`),
    INDEX `funnels_promo_slug_index`(`promo_slug`),
    INDEX `funnels_redirect_funnel_id_foreign`(`redirect_funnel_id`),
    INDEX `funnels_renewal_campaign_id_fk`(`renewal_campaign_id`),
    INDEX `funnels_status_index`(`status`),
    INDEX `funnels_swappable_campaign_id_fk`(`swappable_campaign_id`),
    INDEX `funnels_template_index`(`template`),
    UNIQUE INDEX `funnels_slug_unique`(`slug`, `deleted_at`),
    UNIQUE INDEX `unique_slug_promo_slug`(`slug`, `promo_slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `funnel_products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `funnel_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `crm_campaign_id` INTEGER NOT NULL,
    `default_product_variant_id` INTEGER NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,
    `deleted_by` INTEGER NULL,
    `deleted_at` TIMESTAMP(0) NULL,

    INDEX `funnel_products_crm_campaign_id_fk`(`crm_campaign_id`),
    INDEX `product_variants_id_fk`(`default_product_variant_id`),
    INDEX `fullel_products_product_id_fk`(`product_id`),
    INDEX `funnel_products_status_index`(`status`),
    UNIQUE INDEX `funnel_products_unique_combo`(`funnel_id`, `product_id`, `default_product_variant_id`, `deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(150) NOT NULL,
    `email_verified_at` TIMESTAMP(0) NULL,
    `password` VARCHAR(255) NOT NULL,
    `remember_token` VARCHAR(100) NULL,
    `first_name` VARCHAR(50) NOT NULL,
    `last_name` VARCHAR(50) NULL,
    `phone` VARCHAR(15) NULL,
    `dob` DATE NULL,
    `height` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `weight` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `gender` ENUM('male', 'female', 'other') NULL,
    `ssn` VARCHAR(255) NULL,
    `doctor_network_id` INTEGER NULL,
    `doctor_netowrk_customer_id` VARCHAR(100) NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `metadata` LONGTEXT NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,

    UNIQUE INDEX `customers_email_unique`(`email`),
    INDEX `customers_doctor_network_id_foreign`(`doctor_network_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_addresses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER NOT NULL,
    `fname` VARCHAR(100) NOT NULL,
    `lname` VARCHAR(100) NOT NULL,
    `address1` VARCHAR(255) NOT NULL,
    `address2` VARCHAR(255) NULL,
    `crm_address_id` VARCHAR(255) NULL,
    `city` VARCHAR(100) NULL,
    `country` VARCHAR(2) NOT NULL,
    `state` VARCHAR(10) NOT NULL,
    `zip_code` VARCHAR(20) NULL,
    `make_default` BOOLEAN NOT NULL DEFAULT false,
    `type` ENUM('billing', 'shipping') NOT NULL DEFAULT 'shipping',
    `address_type` TINYINT NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,

    INDEX `customer_addresses_country_state_index`(`country`, `state`),
    INDEX `customer_addresses_customer_id_index`(`customer_id`),
    INDEX `customer_addresses_type_index`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `answers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `answers` LONGTEXT NULL,
    `questionary_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,

    INDEX `customers_id_fk`(`customer_id`),
    INDEX `questionnaires_id_fk`(`questionary_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `funnel_progress` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER NOT NULL,
    `funnel_product_id` INTEGER NOT NULL,
    `steps` ENUM('landing', 'general_question', 'account', 'medical_question', 'login', 'notification', 'register', 'payment', 'checkout', 'identity_upload', 'video_upload', 'dashboard') NOT NULL,
    `sms_consent` BOOLEAN NOT NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,
    `deleted_at` TIMESTAMP(0) NULL,

    INDEX `funnel_progress_customer_id_index`(`customer_id`),
    INDEX `funnel_progress_funnel_product_id_index`(`funnel_product_id`),
    INDEX `funnel_progress_steps_index`(`steps`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `parent_id` INTEGER NULL,
    `customer_id` INTEGER NOT NULL,
    `funnel_id` INTEGER NOT NULL,
    `customer_shipping_address_id` INTEGER NULL,
    `customer_billing_address_id` INTEGER NULL,
    `order_api_id` VARCHAR(255) NULL,
    `order_offer_id` VARCHAR(255) NULL,
    `status` ENUM('active', 'cancelled', 'complete', 'partial', 'declined', 'archive', 'rejected', 'removed', 'paused', 'expired', 'swapped') NOT NULL DEFAULT 'partial',
    `order_status` ENUM('authorized', 'captured') NULL,
    `product_group_name` VARCHAR(255) NULL,
    `order_discount` VARCHAR(255) NULL,
    `tracking_number` VARCHAR(255) NULL,
    `crm_id` INTEGER NULL,
    `is_multi` TINYINT NOT NULL DEFAULT 0,
    `order_prescription` VARCHAR(255) NULL,
    `order_step` VARCHAR(255) NULL,
    `flow` VARCHAR(255) NULL,
    `promo_version` VARCHAR(30) NULL,
    `upsell_for` VARCHAR(255) NULL,
    `used_merchant_id` VARCHAR(255) NULL,
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(255) NULL,
    `bill_fname` VARCHAR(255) NULL,
    `bill_lname` VARCHAR(255) NULL,
    `bill_country` VARCHAR(255) NOT NULL DEFAULT 'US',
    `bill_address1` VARCHAR(255) NULL,
    `bill_address2` VARCHAR(255) NULL,
    `bill_city` VARCHAR(255) NULL,
    `bill_state` VARCHAR(255) NULL,
    `bill_zipcode` VARCHAR(255) NULL,
    `shipping_same` BOOLEAN NOT NULL DEFAULT true,
    `ship_fname` VARCHAR(255) NULL,
    `ship_lname` VARCHAR(255) NULL,
    `ship_country` VARCHAR(255) NOT NULL DEFAULT 'US',
    `ship_address1` VARCHAR(255) NULL,
    `ship_address2` VARCHAR(255) NULL,
    `ship_city` VARCHAR(255) NULL,
    `ship_state` VARCHAR(255) NULL,
    `ship_zipcode` VARCHAR(255) NULL,
    `tracking_id` VARCHAR(255) NULL,
    `gross_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `total_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `shipping_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `tax` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `discount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `discount_coupon` VARCHAR(255) NULL,
    `offer_applied` DATETIME(0) NULL,
    `next_billing_at` DATETIME(0) NULL,
    `expires_at` DATETIME(0) NULL,
    `next_scheduled_refill_date` DATETIME(0) NULL,
    `renewal_notified_at` DATETIME(0) NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,

    UNIQUE INDEX `orders_tracking_number_unique`(`tracking_number`),
    INDEX `orders_crm_id_foreign`(`crm_id`),
    INDEX `orders_customer_billing_address_id_foreign`(`customer_billing_address_id`),
    INDEX `orders_customer_id_foreign`(`customer_id`),
    INDEX `orders_customer_shipping_address_id_foreign`(`customer_shipping_address_id`),
    INDEX `orders_funnel_id_foreign`(`funnel_id`),
    INDEX `orders_parent_id_foreign`(`parent_id`),
    INDEX `orders_status_index`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `order_offer_id` BIGINT NULL,
    `product_variant_id` INTEGER NOT NULL,
    `selling_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `total_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `shipping_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `tax` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `discount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,

    INDEX `order_items_order_id_foreign`(`order_id`),
    INDEX `order_items_product_variant_id_foreign`(`product_variant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `crm_customers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER NOT NULL,
    `crm_id` INTEGER NOT NULL,
    `crm_customer_id` VARCHAR(255) NOT NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,

    INDEX `crm_customers_crm_id_foreign`(`crm_id`),
    INDEX `crm_customers_customer_id_foreign`(`customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `patients` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER NOT NULL,
    `doctor_network_id` INTEGER NOT NULL,
    `doctor_network_patient_id` VARCHAR(255) NOT NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,

    INDEX `patients_customer_id_foreign`(`customer_id`),
    INDEX `patients_doctor_network_id_foreign`(`doctor_network_id`),
    UNIQUE INDEX `patients_customer_doctor_network_unique`(`customer_id`, `doctor_network_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_cases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `patient_id` INTEGER NOT NULL,
    `case_id` VARCHAR(255) NULL,
    `status` VARCHAR(255) NOT NULL,
    `reason` TEXT NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,
    `deleted_at` TIMESTAMP(0) NULL,

    INDEX `user_cases_order_id_foreign`(`order_id`),
    INDEX `user_cases_patient_id_foreign`(`patient_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `documents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `path` VARCHAR(255) NOT NULL,
    `public_url` VARCHAR(255) NULL,
    `type` ENUM('ID', 'VIDEO', 'OTHERS') NOT NULL DEFAULT 'ID',
    `doctors_network_id` INTEGER NOT NULL,
    `doctor_network_file_id` VARCHAR(255) NULL,
    `customer_id` INTEGER NOT NULL,
    `case_id` INTEGER NULL,
    `resource_id` INTEGER NULL,
    `resource_type` VARCHAR(255) NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,

    INDEX `documents_case_id_foreign`(`case_id`),
    INDEX `documents_customer_id_foreign`(`customer_id`),
    INDEX `documents_doctors_network_id_foreign`(`doctors_network_id`),
    INDEX `documents_resource_id_resource_type_index`(`resource_id`, `resource_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `case_messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `patient_id` INTEGER NOT NULL,
    `case_id` INTEGER NULL,
    `case_message_id` VARCHAR(255) NULL,
    `from` VARCHAR(255) NULL,
    `full_name` VARCHAR(255) NULL,
    `text` LONGTEXT NULL,
    `seen` TIMESTAMP(0) NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,
    `deleted_at` TIMESTAMP(0) NULL,

    INDEX `case_messages_case_id_foreign`(`case_id`),
    INDEX `patient_id`(`patient_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `supports` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `subject` VARCHAR(255) NOT NULL,
    `message` TEXT NOT NULL,
    `service` ENUM('zendesk') NOT NULL DEFAULT 'zendesk',
    `support_ticket_id` VARCHAR(255) NULL,
    `attachments` LONGTEXT NULL,
    `sent_by` INTEGER NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,

    INDEX `supports_sent_by_foreign`(`sent_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `portal_configurations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `portal_name` VARCHAR(255) NULL,
    `require_2fa` BOOLEAN NOT NULL DEFAULT false,
    `support_routing_emails` LONGTEXT NULL,
    `customer_support_email` VARCHAR(255) NULL,
    `customer_support_phone` VARCHAR(255) NULL,
    `phone_country_code` VARCHAR(5) NULL,
    `business_address` TEXT NULL,
    `business_hours` TEXT NULL,
    `feature_cancel_treatment_enabled` BOOLEAN NOT NULL DEFAULT true,
    `feature_cancel_treatment_metadata` LONGTEXT NULL,
    `feature_change_treatment_enabled` BOOLEAN NOT NULL DEFAULT false,
    `feature_change_refill_date_enabled` BOOLEAN NOT NULL DEFAULT true,
    `feature_next_refill_date_change_days` INTEGER NULL,
    `feature_refill_treatment_enabled` BOOLEAN NOT NULL DEFAULT true,
    `navigation_menu` LONGTEXT NULL,
    `logo_path` VARCHAR(255) NULL,
    `favicon_path` VARCHAR(255) NULL,
    `primary_color` VARCHAR(7) NOT NULL DEFAULT '#5C79FF',
    `body_bg_color` VARCHAR(7) NOT NULL DEFAULT '#F8F9FA',
    `header_bg_color` VARCHAR(7) NOT NULL DEFAULT '#212D3D',
    `nav_menu_color` VARCHAR(7) NOT NULL DEFAULT '#FFFFFF',
    `primary_text_color` VARCHAR(7) NOT NULL DEFAULT '#212D3D',
    `secondary_text_color` VARCHAR(7) NOT NULL DEFAULT '#5E6473',
    `header_text_color` VARCHAR(7) NOT NULL DEFAULT '#FFFFFF',
    `border_color` VARCHAR(7) NOT NULL DEFAULT '#E4ECF2',
    `icon_color` VARCHAR(7) NOT NULL DEFAULT '#A0A4B1',
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_transactions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `transaction_id` BIGINT NULL,
    `shipment_id` BIGINT NULL,
    `transaction_cycle` VARCHAR(255) NULL,
    `transaction_total` VARCHAR(255) NULL,
    `transaction_price` VARCHAR(255) NULL,
    `transaction_discount_total` VARCHAR(255) NULL,
    `transaction_shipping` VARCHAR(255) NULL,
    `transaction_sub_total` VARCHAR(255) NULL,
    `transaction_tax` VARCHAR(255) NULL,
    `transaction_fee` VARCHAR(255) NULL,
    `shipment_status_id` VARCHAR(255) NULL,
    `shipment_tracking_id` VARCHAR(255) NULL,
    `date_scheduled` DATETIME(0) NULL,
    `transaction_declined` VARCHAR(255) NULL,
    `transaction_type_id` VARCHAR(255) NULL,
    `gateway_response_description` VARCHAR(255) NULL,
    `processor_response_text` VARCHAR(255) NULL,
    `date_deliver` VARCHAR(255) NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,
    `deleted_at` TIMESTAMP(0) NULL,

    UNIQUE INDEX `order_transactions_transaction_id_key`(`transaction_id`),
    INDEX `order_transactions_order_id_foreign`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `email_verified_at` TIMESTAMP(0) NULL,
    `password` VARCHAR(255) NOT NULL,
    `remember_token` VARCHAR(100) NULL,
    `two_factor_code` VARCHAR(255) NULL,
    `two_factor_enabled` BOOLEAN NOT NULL DEFAULT true,
    `two_factor_expires_at` DATETIME(0) NULL,
    `phone_number` VARCHAR(255) NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `last_logged_in` TIMESTAMP(0) NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,
    `deleted_at` TIMESTAMP(0) NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `description` VARCHAR(255) NULL,
    `status` VARCHAR(1) NOT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_permissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `module` VARCHAR(255) NOT NULL,
    `scope` VARCHAR(255) NOT NULL,
    `action` VARCHAR(255) NOT NULL,
    `status` VARCHAR(255) NOT NULL,

    UNIQUE INDEX `admin_permissions_module_scope_action_unique`(`module`, `scope`, `action`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_actions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `label` VARCHAR(255) NOT NULL,
    `framework_permission_mapper` TEXT NULL,
    `created_at` TIMESTAMP(0) NULL,

    UNIQUE INDEX `admin_actions_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_role_permissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `role_id` INTEGER NOT NULL,
    `permission_id` INTEGER NOT NULL,
    `updated_at` TIMESTAMP(0) NOT NULL,

    UNIQUE INDEX `admin_role_permissions_role_id_permission_id_key`(`role_id`, `permission_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_user_roles_permissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `role_id` INTEGER NULL,
    `permission_id` INTEGER NULL,

    INDEX `admin_user_roles_permissions_permission_id_idx`(`permission_id`),
    INDEX `admin_user_roles_permissions_role_id_idx`(`role_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `crm_campaigns` ADD CONSTRAINT `crm_campaign_crm_id_fk` FOREIGN KEY (`crm_id`) REFERENCES `crms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_offers` ADD CONSTRAINT `crm_offers_crm_id_fk` FOREIGN KEY (`crm_id`) REFERENCES `crms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_offers` ADD CONSTRAINT `crm_offers_crm_campaign_id_fk` FOREIGN KEY (`crm_campaign_id`) REFERENCES `crm_campaigns`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_shipping` ADD CONSTRAINT `crm_shipping_crm_id_foreign` FOREIGN KEY (`crm_id`) REFERENCES `crms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_shipping` ADD CONSTRAINT `crm_shipping_crm_campaign_id_fk` FOREIGN KEY (`crm_campaign_id`) REFERENCES `crm_campaigns`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `doctor_network_offers` ADD CONSTRAINT `doctor_network_offers_doctor_network_id_foreign` FOREIGN KEY (`doctor_network_id`) REFERENCES `doctor_networks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_generic_question_fk` FOREIGN KEY (`generic_question`) REFERENCES `questionnaires`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_medical_question_id_fk` FOREIGN KEY (`medical_question`) REFERENCES `questionnaires`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_change_medicine_question_fk` FOREIGN KEY (`change_medicine_question`) REFERENCES `questionnaires`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_swappable_campaign_id_fk` FOREIGN KEY (`swappable_campaign_id`) REFERENCES `crm_campaigns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_renewal_campaign_id_fk` FOREIGN KEY (`renewal_campaign_id`) REFERENCES `crm_campaigns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_product_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_crm_offer_id_fk` FOREIGN KEY (`crm_offer_id`) REFERENCES `crm_offers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_doctor_network_id_fk` FOREIGN KEY (`doctor_network_id`) REFERENCES `doctor_networks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_crm_campaign_id_fk` FOREIGN KEY (`crm_campaign_id`) REFERENCES `crm_campaigns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_shipping_profile_fk` FOREIGN KEY (`shipping_profile`) REFERENCES `crm_shipping`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `swapable_products` ADD CONSTRAINT `swapable_products_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `swapable_products` ADD CONSTRAINT `swapable_products_swapable_product_id_foreign` FOREIGN KEY (`swapable_product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_related_items` ADD CONSTRAINT `product_related_items_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_related_items` ADD CONSTRAINT `product_related_items_variant_id_foreign` FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_related_items` ADD CONSTRAINT `product_related_items_additional_product_id_foreign` FOREIGN KEY (`additional_product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `funnels` ADD CONSTRAINT `funnels_crm_campaign_id_fk` FOREIGN KEY (`crm_campaign_id`) REFERENCES `crm_campaigns`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `funnels` ADD CONSTRAINT `funnels_swappable_campaign_id_fk` FOREIGN KEY (`swappable_campaign_id`) REFERENCES `crm_campaigns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `funnels` ADD CONSTRAINT `funnels_renewal_campaign_id_fk` FOREIGN KEY (`renewal_campaign_id`) REFERENCES `crm_campaigns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `funnels` ADD CONSTRAINT `funnels_redirect_funnel_id_foreign` FOREIGN KEY (`redirect_funnel_id`) REFERENCES `funnels`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `funnel_products` ADD CONSTRAINT `fullel_products_funnel_id_fk` FOREIGN KEY (`funnel_id`) REFERENCES `funnels`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `funnel_products` ADD CONSTRAINT `fullel_products_product_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `funnel_products` ADD CONSTRAINT `funnel_products_crm_campaign_id_fk` FOREIGN KEY (`crm_campaign_id`) REFERENCES `crm_campaigns`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `funnel_products` ADD CONSTRAINT `product_variants_id_fk` FOREIGN KEY (`default_product_variant_id`) REFERENCES `product_variants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customers` ADD CONSTRAINT `customers_doctor_network_id_foreign` FOREIGN KEY (`doctor_network_id`) REFERENCES `doctor_networks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_addresses` ADD CONSTRAINT `customer_addresses_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `answers` ADD CONSTRAINT `questionnaires_id_fk` FOREIGN KEY (`questionary_id`) REFERENCES `questionnaires`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `answers` ADD CONSTRAINT `customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `funnel_progress` ADD CONSTRAINT `funnel_progress_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `funnel_progress` ADD CONSTRAINT `funnel_progress_funnel_product_id_foreign` FOREIGN KEY (`funnel_product_id`) REFERENCES `funnel_products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_parent_id_foreign` FOREIGN KEY (`parent_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_funnel_id_foreign` FOREIGN KEY (`funnel_id`) REFERENCES `funnels`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_customer_shipping_address_id_foreign` FOREIGN KEY (`customer_shipping_address_id`) REFERENCES `customer_addresses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_customer_billing_address_id_foreign` FOREIGN KEY (`customer_billing_address_id`) REFERENCES `customer_addresses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_crm_id_foreign` FOREIGN KEY (`crm_id`) REFERENCES `crms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_foreign` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_product_variant_id_foreign` FOREIGN KEY (`product_variant_id`) REFERENCES `product_variants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_customers` ADD CONSTRAINT `crm_customers_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_customers` ADD CONSTRAINT `crm_customers_crm_id_foreign` FOREIGN KEY (`crm_id`) REFERENCES `crms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patients` ADD CONSTRAINT `patients_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patients` ADD CONSTRAINT `patients_doctor_network_id_foreign` FOREIGN KEY (`doctor_network_id`) REFERENCES `doctor_networks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_cases` ADD CONSTRAINT `user_cases_order_id_foreign` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_cases` ADD CONSTRAINT `user_cases_patient_id_foreign` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_doctors_network_id_foreign` FOREIGN KEY (`doctors_network_id`) REFERENCES `doctor_networks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_case_id_foreign` FOREIGN KEY (`case_id`) REFERENCES `user_cases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `case_messages` ADD CONSTRAINT `patient_id` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `case_messages` ADD CONSTRAINT `case_messages_case_id_foreign` FOREIGN KEY (`case_id`) REFERENCES `user_cases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supports` ADD CONSTRAINT `supports_sent_by_foreign` FOREIGN KEY (`sent_by`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_transactions` ADD CONSTRAINT `order_transactions_order_id_foreign` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_permissions` ADD CONSTRAINT `admin_permissions_action_foreign` FOREIGN KEY (`action`) REFERENCES `admin_actions`(`name`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_role_permissions` ADD CONSTRAINT `admin_role_permissions_role_id_foreign` FOREIGN KEY (`role_id`) REFERENCES `admin_roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_role_permissions` ADD CONSTRAINT `admin_role_permissions_permission_id_foreign` FOREIGN KEY (`permission_id`) REFERENCES `admin_permissions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_user_roles_permissions` ADD CONSTRAINT `admin_user_roles_permissions_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_user_roles_permissions` ADD CONSTRAINT `admin_user_roles_permissions_role_id_foreign` FOREIGN KEY (`role_id`) REFERENCES `admin_roles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_user_roles_permissions` ADD CONSTRAINT `admin_user_roles_permissions_permission_id_foreign` FOREIGN KEY (`permission_id`) REFERENCES `admin_permissions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
