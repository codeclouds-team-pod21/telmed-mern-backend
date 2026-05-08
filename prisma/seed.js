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

  console.log('');
  console.log('Admin seed completed.');
  console.log(`Admin email: ${user.email}`);
  console.log(`Admin password: ${password}`);
  console.log('Roles seeded: Super Admin, Admin, Admin Lite');
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
