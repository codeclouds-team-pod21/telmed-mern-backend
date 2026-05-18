const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const ADMIN_ACTIONS = [
  {
    name: 'list',
    label: 'List',
    frameworkPermissionMapper: JSON.stringify(['index', 'show']),
  },
  {
    name: 'add',
    label: 'Add',
    frameworkPermissionMapper: JSON.stringify(['create', 'store']),
  },
  {
    name: 'view',
    label: 'View',
    frameworkPermissionMapper: JSON.stringify([]),
  },
  {
    name: 'modify',
    label: 'Modify',
    frameworkPermissionMapper: JSON.stringify(['edit', 'update']),
  },
  {
    name: 'delete',
    label: 'Delete',
    frameworkPermissionMapper: JSON.stringify(['destroy']),
  },
  {
    name: 'settings',
    label: 'Settings',
    frameworkPermissionMapper: JSON.stringify(['settings']),
  },
];

const ADMIN_PERMISSIONS = [
  ['customers', 'admin', 'list', 'public'],
  ['customers', 'admin', 'view', 'public'],
  ['customers', 'admin', 'modify', 'public'],
  ['products', 'admin', 'list', 'public'],
  ['products', 'admin', 'view', 'public'],
  ['products', 'admin', 'add', 'public'],
  ['products', 'admin', 'modify', 'public'],
  ['products', 'admin', 'delete', 'public'],
  ['funnels', 'admin', 'list', 'public'],
  ['funnels', 'admin', 'view', 'public'],
  ['funnels', 'admin', 'add', 'public'],
  ['funnels', 'admin', 'modify', 'public'],
  ['funnels', 'admin', 'delete', 'public'],
  ['orders', 'admin', 'list', 'public'],
  ['orders', 'admin', 'view', 'public'],
  ['cases', 'admin', 'list', 'public'],
  ['cases', 'admin', 'view', 'public'],
  ['roles', 'admin', 'list', 'hidden'],
  ['roles', 'admin', 'view', 'hidden'],
  ['roles', 'admin', 'add', 'hidden'],
  ['roles', 'admin', 'modify', 'hidden'],
  ['roles', 'admin', 'delete', 'hidden'],
  ['users', 'admin', 'list', 'hidden'],
  ['users', 'admin', 'view', 'hidden'],
  ['users', 'admin', 'add', 'hidden'],
  ['users', 'admin', 'modify', 'hidden'],
  ['users', 'admin', 'delete', 'hidden'],
  ['forms', 'admin', 'list', 'public'],
  ['forms', 'admin', 'view', 'public'],
  ['forms', 'admin', 'add', 'public'],
  ['forms', 'admin', 'modify', 'public'],
  ['forms', 'admin', 'delete', 'public'],
  ['logs', 'admin', 'list', 'public'],
  ['logs', 'admin', 'view', 'public'],
  ['settings', 'admin', 'settings', 'public'],
];

const ROLE_DEFINITIONS = [
  {
    name: 'Super Admin',
    description: 'For Super Admin role users',
    status: '1',
    isDefault: true,
    permissions: ADMIN_PERMISSIONS.map(([module, scope, action]) => `${module}.${scope}.${action}`),
  },
  {
    name: 'Admin',
    description: 'For Admin role users',
    status: '1',
    isDefault: false,
    permissions: [
      'customers.admin.list',
      'customers.admin.view',
      'customers.admin.modify',
      'products.admin.list',
      'products.admin.view',
      'products.admin.add',
      'products.admin.modify',
      'products.admin.delete',
      'funnels.admin.list',
      'funnels.admin.view',
      'funnels.admin.add',
      'funnels.admin.modify',
      'funnels.admin.delete',
      'orders.admin.list',
      'orders.admin.view',
      'cases.admin.list',
      'cases.admin.view',
      'forms.admin.list',
      'forms.admin.view',
      'forms.admin.add',
      'forms.admin.modify',
      'forms.admin.delete',
      'settings.admin.settings',
    ],
  },
  {
    name: 'Admin Lite',
    description: 'Admin lite role for listing and view',
    status: '1',
    isDefault: false,
    permissions: [
      'customers.admin.list',
      'customers.admin.view',
      'products.admin.list',
      'products.admin.view',
      'funnels.admin.list',
      'funnels.admin.view',
      'orders.admin.list',
      'orders.admin.view',
      'cases.admin.list',
      'cases.admin.view',
      'forms.admin.list',
      'forms.admin.view',
      'logs.admin.list',
      'logs.admin.view',
    ],
  },
];

const US_STATE_OPTIONS = [
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'DC', label: 'District of Columbia' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'MP', label: 'Northern Mariana Islands' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
];

const SAMPLE_CATALOG = {
  crm: {
    name: 'Seed CRM',
    campaignId: 'seed-main-campaign',
    campaignName: 'Seed Main Campaign',
    shippingProfileId: 1001,
    shippingProfileName: 'Seed Standard Shipping',
    shippingPrice: 9.99,
  },
  doctorNetwork: {
    name: 'Seed Doctor Network',
    apiUrl: 'https://example-doctor-network.test',
    apiVersion: 'v1',
    introVideoStates: ['CA', 'NY', 'TX'],
  },
  questionnaires: {
    general: {
      name: 'Seed General Questionnaire',
      type: 'general',
      questions: [
        {
          id: 'shipping_state',
          step: 0,
          type: 'select',
          send_to_dn: false,
          body_matrix: false,
          model: {
            field: 'state',
            value: '',
          },
          ui: {
            header: { text: '' },
            subHeader: { text: '' },
            question: {
              text: 'What is your state?',
              subText: 'Please select your state',
            },
            footer: { text: '' },
            image: '',
            description: '',
          },
          validation: {
            required: true,
          },
          logic: {
            rules: [],
          },
          options: US_STATE_OPTIONS.map((state) => ({
            label: state.label,
            value: state.value,
          })),
          children: [],
        },
        {
          id: 'full_name',
          question: 'What is your full name?',
          type: 'text',
          required: true,
        },
        {
          id: 'phone',
          question: 'What is the best phone number to reach you?',
          type: 'text',
          required: true,
        },
      ],
    },
    medical: {
      name: 'Seed Medical Questionnaire',
      type: 'medical',
      questions: [
        {
          id: 'allergies',
          question: 'Do you have any medication allergies?',
          type: 'textarea',
          required: true,
        },
        {
          id: 'conditions',
          question: 'Please list any ongoing medical conditions.',
          type: 'textarea',
          required: true,
        },
      ],
    },
  },
  subscriptionPlan: {
    name: 'Seed Monthly Plan',
    description: 'Default seed subscription plan for sample variants.',
    duration: 4,
    status: '1',
  },
  products: [
    {
      name: 'Seed Weight Care',
      slug: 'seed-weight-care',
      description: 'Seed product for weight-care funnel testing.',
      keypoints: ['Clinician reviewed', 'Monthly refill ready'],
      productCategory: 'wellness',
      productType: 'weight-care',
      displayPrice: 129,
      variant: {
        title: 'Seed Weight Care Starter',
        variantName: 'Starter',
        description: 'Starter variant for weight-care seed product.',
        docNetworkOfferingId: 'seed-offering-weight',
        crmOfferId: 'seed-offer-weight',
        crmItem: 'seed-weight-item',
        pharmacy: 'Seed Pharmacy',
        sellingPrice: 129,
        doctorQuantity: 1,
        doctorPrescriptionDuration: 30,
        refills: 1,
        daysSupplies: 30,
        dispenseUnits: 1,
        planWeeks: 4,
      },
      funnel: {
        name: 'Seed Weight Care Funnel',
        slug: 'seed-weight-care-funnel',
        promoSlug: 'seed-weight-care-promo',
        description: 'Seed public funnel for the weight-care product.',
        displayDefault: true,
      },
    },
    {
      name: 'Seed Energy Support',
      slug: 'seed-energy-support',
      description: 'Seed product for energy-support funnel testing.',
      keypoints: ['Simple checkout path', 'Doctor-reviewed flow'],
      productCategory: 'wellness',
      productType: 'energy-support',
      displayPrice: 89,
      variant: {
        title: 'Seed Energy Support Core',
        variantName: 'Core',
        description: 'Core variant for energy-support seed product.',
        docNetworkOfferingId: 'seed-offering-energy',
        crmOfferId: 'seed-offer-energy',
        crmItem: 'seed-energy-item',
        pharmacy: 'Seed Pharmacy',
        sellingPrice: 89,
        doctorQuantity: 1,
        doctorPrescriptionDuration: 30,
        refills: 1,
        daysSupplies: 30,
        dispenseUnits: 1,
        planWeeks: 4,
      },
      funnel: {
        name: 'Seed Energy Support Funnel',
        slug: 'seed-energy-support-funnel',
        promoSlug: 'seed-energy-support-promo',
        description: 'Seed public funnel for the energy-support product.',
        displayDefault: false,
      },
    },
  ],
};

function toJson(value) {
  return JSON.stringify(value);
}

async function findFirstAndUpsert(model, where, create, update) {
  const existing = await model.findFirst({ where, select: { id: true } });

  if (existing?.id) {
    return model.update({
      where: { id: existing.id },
      data: update,
    });
  }

  return model.create({ data: create });
}

async function seedAddressLocations() {
  for (const state of US_STATE_OPTIONS) {
    await findFirstAndUpsert(
      prisma.addressLocation,
      {
        countryCode: 'US',
        state: state.label,
        stateAbbr: state.value,
      },
      {
        country: 'United States',
        countryCode: 'US',
        state: state.label,
        stateAbbr: state.value,
      },
      {
        country: 'United States',
        countryCode: 'US',
        state: state.label,
        stateAbbr: state.value,
      },
    );
  }
}

async function seedSampleCatalog() {
  const now = new Date();

  await seedAddressLocations();

  const crm = await findFirstAndUpsert(
    prisma.crm,
    { name: SAMPLE_CATALOG.crm.name },
    {
      name: SAMPLE_CATALOG.crm.name,
      credentials: toJson({
        apiKey: 'seed-api-key',
        connectionId: 'seed-connection-id',
      }),
      type: 'vrio',
      status: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      credentials: toJson({
        apiKey: 'seed-api-key',
        connectionId: 'seed-connection-id',
      }),
      type: 'vrio',
      status: true,
      updatedAt: now,
    },
  );

  const crmCampaign = await findFirstAndUpsert(
    prisma.crmCampaign,
    {
      crmId: crm.id,
      campaignId: SAMPLE_CATALOG.crm.campaignId,
    },
    {
      crmId: crm.id,
      campaignId: SAMPLE_CATALOG.crm.campaignId,
      name: SAMPLE_CATALOG.crm.campaignName,
      status: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      name: SAMPLE_CATALOG.crm.campaignName,
      status: true,
      updatedAt: now,
    },
  );

  const crmShipping = await findFirstAndUpsert(
    prisma.crmShipping,
    {
      crmId: crm.id,
      crmCampaignId: crmCampaign.id,
      shippingProfileId: SAMPLE_CATALOG.crm.shippingProfileId,
    },
    {
      crmId: crm.id,
      crmCampaignId: crmCampaign.id,
      shippingProfileId: SAMPLE_CATALOG.crm.shippingProfileId,
      shippingProfile: SAMPLE_CATALOG.crm.shippingProfileName,
      shippingPrice: SAMPLE_CATALOG.crm.shippingPrice,
      createdAt: now,
      updatedAt: now,
    },
    {
      shippingProfile: SAMPLE_CATALOG.crm.shippingProfileName,
      shippingPrice: SAMPLE_CATALOG.crm.shippingPrice,
      updatedAt: now,
    },
  );

  const doctorNetwork = await findFirstAndUpsert(
    prisma.doctorNetwork,
    { name: SAMPLE_CATALOG.doctorNetwork.name },
    {
      name: SAMPLE_CATALOG.doctorNetwork.name,
      apiUrl: SAMPLE_CATALOG.doctorNetwork.apiUrl,
      apiVersion: SAMPLE_CATALOG.doctorNetwork.apiVersion,
      credentials: toJson({
        client_id: 'seed-client-id',
        client_secret: 'seed-client-secret',
      }),
      introVideoStates: toJson(SAMPLE_CATALOG.doctorNetwork.introVideoStates),
      type: 'mdi',
      status: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      apiUrl: SAMPLE_CATALOG.doctorNetwork.apiUrl,
      apiVersion: SAMPLE_CATALOG.doctorNetwork.apiVersion,
      credentials: toJson({
        client_id: 'seed-client-id',
        client_secret: 'seed-client-secret',
      }),
      introVideoStates: toJson(SAMPLE_CATALOG.doctorNetwork.introVideoStates),
      type: 'mdi',
      status: false,
      updatedAt: now,
    },
  );

  const generalQuestionnaire = await findFirstAndUpsert(
    prisma.questionnaire,
    {
      name: SAMPLE_CATALOG.questionnaires.general.name,
      type: SAMPLE_CATALOG.questionnaires.general.type,
      deletedAt: null,
    },
    {
      name: SAMPLE_CATALOG.questionnaires.general.name,
      type: SAMPLE_CATALOG.questionnaires.general.type,
      questions: toJson(SAMPLE_CATALOG.questionnaires.general.questions),
      intakeEngineType: 'custom',
      status: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      questions: toJson(SAMPLE_CATALOG.questionnaires.general.questions),
      intakeEngineType: 'custom',
      status: true,
      deletedAt: null,
      updatedAt: now,
    },
  );

  const medicalQuestionnaire = await findFirstAndUpsert(
    prisma.questionnaire,
    {
      name: SAMPLE_CATALOG.questionnaires.medical.name,
      type: SAMPLE_CATALOG.questionnaires.medical.type,
      deletedAt: null,
    },
    {
      name: SAMPLE_CATALOG.questionnaires.medical.name,
      type: SAMPLE_CATALOG.questionnaires.medical.type,
      questions: toJson(SAMPLE_CATALOG.questionnaires.medical.questions),
      intakeEngineType: 'custom',
      status: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      questions: toJson(SAMPLE_CATALOG.questionnaires.medical.questions),
      intakeEngineType: 'custom',
      status: true,
      deletedAt: null,
      updatedAt: now,
    },
  );

  const subscriptionPlan = await findFirstAndUpsert(
    prisma.subscriptionPlan,
    {
      name: SAMPLE_CATALOG.subscriptionPlan.name,
      status: SAMPLE_CATALOG.subscriptionPlan.status,
    },
    {
      name: SAMPLE_CATALOG.subscriptionPlan.name,
      description: SAMPLE_CATALOG.subscriptionPlan.description,
      duration: SAMPLE_CATALOG.subscriptionPlan.duration,
      status: SAMPLE_CATALOG.subscriptionPlan.status,
      createdAt: now,
      updatedAt: now,
    },
    {
      description: SAMPLE_CATALOG.subscriptionPlan.description,
      duration: SAMPLE_CATALOG.subscriptionPlan.duration,
      status: SAMPLE_CATALOG.subscriptionPlan.status,
      updatedAt: now,
    },
  );

  const seededProducts = [];

  for (const item of SAMPLE_CATALOG.products) {
    const crmOffer = await findFirstAndUpsert(
      prisma.crmOffer,
      {
        crmId: crm.id,
        crmCampaignId: crmCampaign.id,
        offerId: item.variant.crmOfferId,
      },
      {
        crmId: crm.id,
        crmCampaignId: crmCampaign.id,
        offerId: item.variant.crmOfferId,
        name: `${item.name} Offer`,
        status: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        name: `${item.name} Offer`,
        status: true,
        updatedAt: now,
      },
    );

    await findFirstAndUpsert(
      prisma.doctorNetworkOffer,
      {
        doctorNetworkId: doctorNetwork.id,
        offerableId: item.variant.docNetworkOfferingId,
      },
      {
        doctorNetworkId: doctorNetwork.id,
        offerableId: item.variant.docNetworkOfferingId,
        name: item.variant.title,
        metaData: toJson({ seed: true }),
        quantity: item.variant.doctorQuantity,
        daysOfSupply: item.variant.daysSupplies,
        dispenseUnit: String(item.variant.dispenseUnits),
        refills: item.variant.refills,
        prescriptionDuration: item.variant.doctorPrescriptionDuration,
        pharmacy: item.variant.pharmacy,
        createdAt: now,
        updatedAt: now,
      },
      {
        name: item.variant.title,
        metaData: toJson({ seed: true }),
        quantity: item.variant.doctorQuantity,
        daysOfSupply: item.variant.daysSupplies,
        dispenseUnit: String(item.variant.dispenseUnits),
        refills: item.variant.refills,
        prescriptionDuration: item.variant.doctorPrescriptionDuration,
        pharmacy: item.variant.pharmacy,
        updatedAt: now,
      },
    );

    const product = await prisma.product.upsert({
      where: { productSlugName: item.slug },
      update: {
        name: item.name,
        description: item.description,
        keypoints: toJson(item.keypoints),
        productGroupName: item.name,
        metaData: toJson({ seed: true }),
        productCategory: item.productCategory,
        productType: item.productType,
        productClassification: 'main',
        isUpsell: false,
        image: toJson([]),
        restrictedState: toJson([]),
        blockMilitaryBases: false,
        blockIslands: false,
        displayPrice: item.displayPrice,
        genericQuestionId: generalQuestionnaire.id,
        medicalQuestionId: medicalQuestionnaire.id,
        status: true,
        metaTitle: item.name,
        metaDescription: item.description,
        metaKeywords: `${item.productCategory},${item.productType}`,
        updatedAt: now,
        deletedAt: null,
      },
      create: {
        name: item.name,
        description: item.description,
        keypoints: toJson(item.keypoints),
        productGroupName: item.name,
        productSlugName: item.slug,
        metaData: toJson({ seed: true }),
        productCategory: item.productCategory,
        productType: item.productType,
        productClassification: 'main',
        isUpsell: false,
        image: toJson([]),
        restrictedState: toJson([]),
        blockMilitaryBases: false,
        blockIslands: false,
        displayPrice: item.displayPrice,
        genericQuestionId: generalQuestionnaire.id,
        medicalQuestionId: medicalQuestionnaire.id,
        status: true,
        createdAt: now,
        updatedAt: now,
        metaTitle: item.name,
        metaDescription: item.description,
        metaKeywords: `${item.productCategory},${item.productType}`,
      },
    });

    const productVariant = await findFirstAndUpsert(
      prisma.productVariant,
      {
        productId: product.id,
        variantName: item.variant.variantName,
        deletedAt: null,
      },
      {
        title: item.variant.title,
        variantName: item.variant.variantName,
        productId: product.id,
        crmOfferId: crmOffer.id,
        doctorNetworkId: doctorNetwork.id,
        docNetworkOfferingId: item.variant.docNetworkOfferingId,
        isSupplyAvailable: false,
        isTitrationAvailable: false,
        description: item.variant.description,
        image: '/seed-product-variant.png',
        gender: 'both',
        crmItem: item.variant.crmItem,
        shippingProfileId: crmShipping.id,
        pharmacy: item.variant.pharmacy,
        crmCampaignId: crmCampaign.id,
        doctorQuantity: item.variant.doctorQuantity,
        doctorPrescriptionDuration: item.variant.doctorPrescriptionDuration,
        sellingPrice: item.variant.sellingPrice,
        refills: item.variant.refills,
        daysSupplies: item.variant.daysSupplies,
        dispenseUnits: item.variant.dispenseUnits,
        isPopular: true,
        status: true,
        variantOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        title: item.variant.title,
        crmOfferId: crmOffer.id,
        doctorNetworkId: doctorNetwork.id,
        docNetworkOfferingId: item.variant.docNetworkOfferingId,
        isSupplyAvailable: false,
        isTitrationAvailable: false,
        description: item.variant.description,
        image: '/seed-product-variant.png',
        gender: 'both',
        crmItem: item.variant.crmItem,
        shippingProfileId: crmShipping.id,
        pharmacy: item.variant.pharmacy,
        crmCampaignId: crmCampaign.id,
        doctorQuantity: item.variant.doctorQuantity,
        doctorPrescriptionDuration: item.variant.doctorPrescriptionDuration,
        sellingPrice: item.variant.sellingPrice,
        refills: item.variant.refills,
        daysSupplies: item.variant.daysSupplies,
        dispenseUnits: item.variant.dispenseUnits,
        isPopular: true,
        status: true,
        variantOrder: 1,
        deletedAt: null,
        updatedAt: now,
      },
    );

    await findFirstAndUpsert(
      prisma.planVariantPrice,
      {
        planId: subscriptionPlan.id,
        productVariantId: productVariant.id,
        crmCampaignId: crmCampaign.id,
        crmOfferId: crmOffer.id,
        shippingProfile: crmShipping.id,
      },
      {
        planId: subscriptionPlan.id,
        productId: product.id,
        productVariantId: productVariant.id,
        crmCampaignId: crmCampaign.id,
        shippingProfile: crmShipping.id,
        crmOfferId: crmOffer.id,
        durationWeeks: item.variant.planWeeks,
        supplyWeeks: item.variant.planWeeks,
        originalPrice: item.variant.sellingPrice,
        discountAmount: 0,
        discountCoupon: null,
        isDefault: true,
        status: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        productId: product.id,
        durationWeeks: item.variant.planWeeks,
        supplyWeeks: item.variant.planWeeks,
        originalPrice: item.variant.sellingPrice,
        discountAmount: 0,
        discountCoupon: null,
        isDefault: true,
        status: true,
        updatedAt: now,
      },
    );

    const funnel = await findFirstAndUpsert(
      prisma.funnel,
      {
        slug: item.funnel.slug,
        deletedAt: null,
      },
      {
        funnelName: item.funnel.name,
        crmCampaignId: crmCampaign.id,
        displayDefault: item.funnel.displayDefault,
        slug: item.funnel.slug,
        description: item.funnel.description,
        shortDescription: item.funnel.description,
        redirectType: 'soft',
        promoSlug: item.funnel.promoSlug,
        status: true,
        template: 'default',
        createdAt: now,
        updatedAt: now,
      },
      {
        funnelName: item.funnel.name,
        crmCampaignId: crmCampaign.id,
        displayDefault: item.funnel.displayDefault,
        description: item.funnel.description,
        shortDescription: item.funnel.description,
        redirectType: 'soft',
        promoSlug: item.funnel.promoSlug,
        status: true,
        template: 'default',
        deletedAt: null,
        updatedAt: now,
      },
    );

    await findFirstAndUpsert(
      prisma.funnelProduct,
      {
        funnelId: funnel.id,
        productId: product.id,
        defaultProductVariantId: productVariant.id,
        deletedAt: null,
      },
      {
        funnelId: funnel.id,
        productId: product.id,
        crmCampaignId: crmCampaign.id,
        defaultProductVariantId: productVariant.id,
        status: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        crmCampaignId: crmCampaign.id,
        status: true,
        deletedAt: null,
        updatedAt: now,
      },
    );

    seededProducts.push({
      product,
      productVariant,
      funnel,
      crmOffer,
    });
  }

  return {
    generalQuestionnaire,
    medicalQuestionnaire,
    subscriptionPlan,
    seededProducts,
  };
}

async function seedActions() {
  const now = new Date();

  for (const action of ADMIN_ACTIONS) {
    await prisma.adminAction.upsert({
      where: { name: action.name },
      update: {
        label: action.label,
        frameworkPermissionMapper: action.frameworkPermissionMapper,
      },
      create: {
        ...action,
        createdAt: now,
      },
    });
  }
}

async function seedPermissions() {
  const permissionMap = new Map();

  for (const [module, scope, action, status] of ADMIN_PERMISSIONS) {
    const permission = await prisma.adminPermission.upsert({
      where: {
        module_scope_action: {
          module,
          scope,
          action,
        },
      },
      update: { status },
      create: {
        module,
        scope,
        action,
        status,
      },
    });

    permissionMap.set(`${module}.${scope}.${action}`, permission);
  }

  return permissionMap;
}

async function seedRoles(permissionMap) {
  const now = new Date();
  const roleMap = new Map();

  for (const roleDefinition of ROLE_DEFINITIONS) {
    const existingRole = await prisma.adminRole.findFirst({
      where: { name: roleDefinition.name },
    });

    const role = existingRole
      ? await prisma.adminRole.update({
          where: { id: existingRole.id },
          data: {
            description: roleDefinition.description,
            status: roleDefinition.status,
            isDefault: roleDefinition.isDefault,
            updatedAt: now,
          },
        })
      : await prisma.adminRole.create({
          data: {
        name: roleDefinition.name,
        description: roleDefinition.description,
        status: roleDefinition.status,
        isDefault: roleDefinition.isDefault,
        createdAt: now,
        updatedAt: now,
          },
        });

    roleMap.set(roleDefinition.name, role);

    for (const permissionKey of roleDefinition.permissions) {
      const permission = permissionMap.get(permissionKey);
      if (!permission) {
        throw new Error(`Missing permission mapping for role seed: ${permissionKey}`);
      }

      await prisma.adminRolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {
          updatedAt: now,
        },
        create: {
          roleId: role.id,
          permissionId: permission.id,
          updatedAt: now,
        },
      });
    }
  }

  return roleMap;
}

async function seedDefaultAdmin(superAdminRole) {
  const now = new Date();
  const name = process.env.SEED_ADMIN_NAME || 'Local Super Admin';
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@123456';
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      password: passwordHash,
      status: true,
      twoFactorEnabled: false,
      isDefault: true,
      updatedAt: now,
      deletedAt: null,
    },
    create: {
      name,
      email,
      password: passwordHash,
      status: true,
      twoFactorEnabled: false,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    },
  });

  const existingRoleAssignment = await prisma.adminUserRolesPermission.findFirst({
    where: {
      userId: user.id,
      roleId: superAdminRole.id,
      permissionId: null,
    },
  });

  if (!existingRoleAssignment) {
    await prisma.adminUserRolesPermission.create({
      data: {
        userId: user.id,
        roleId: superAdminRole.id,
        permissionId: null,
      },
    });
  }

  return { user, password };
}

async function main() {
  await seedActions();
  const permissionMap = await seedPermissions();
  const roleMap = await seedRoles(permissionMap);
  const { user, password } = await seedDefaultAdmin(roleMap.get('Super Admin'));
  const sampleCatalog = await seedSampleCatalog();

  console.log('');
  console.log('Admin seed completed.');
  console.log(`Admin email: ${user.email}`);
  console.log(`Admin password: ${password}`);
  console.log('Roles seeded: Super Admin, Admin, Admin Lite');
  console.log(
    `Questionnaires seeded: ${sampleCatalog.generalQuestionnaire.name}, ${sampleCatalog.medicalQuestionnaire.name}`,
  );
  console.log(
    `Products seeded: ${sampleCatalog.seededProducts.map((entry) => entry.product.name).join(', ')}`,
  );
  console.log(
    `Funnels seeded: ${sampleCatalog.seededProducts.map((entry) => entry.funnel.funnelName).join(', ')}`,
  );
}

main()
  .catch((error) => {
    console.error('Admin seed failed.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
