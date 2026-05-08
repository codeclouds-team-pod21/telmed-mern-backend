# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Context

This is the backend half of an in-progress migration from a Laravel 12 monolith
(`../../telmed-internal/`) to a separately deployable stack. The frontend lives
at `../telmed-mern-frontend/`. Despite the parent folder being named `telmed-mern-src`,
**the stack is not classical MERN**:

- **N**estJS 11 (not Express)
- **N**ext.js 15 frontend (not raw React)
- **MySQL via Prisma 6** (not MongoDB)
- TypeScript end to end

When porting a Laravel feature, use `../../telmed-internal/CLAUDE.md` and
`../../telmed-internal/readme/` as the source of truth for behavior. Notable
references:
- `readme/user-journey.md`, `readme/funnel-setup.md`, `readme/checkout-conversion-process.md`
- `readme/external-systems.md`, `readme/mdi-integration.md`
- `audit-reports/` contains a security audit of the Laravel app — many findings
  (IDOR via `order_api_id`, missing rate limiting, session poisoning, plaintext
  SSN, non-functional admin 2FA) are things this rewrite should *not* re-port.

## Commands

```bash
npm install
npm run prisma:generate          # regenerate Prisma client
npm run prisma:migrate           # create/apply dev migrations
npm run prisma:seed              # seed admin user + roles + permissions (idempotent)
npm run start:dev                # nest watch mode
npm run start                    # production-style start (no watch)
npm run build                    # clean dist + nest build (uses tsconfig.build.json)
npm run lint                     # eslint over src/**/*.ts
```

There is **no test runner wired up** yet — `@nestjs/testing` is in
devDependencies but no `test` script and no spec files exist. If you add tests,
wire a script (`jest` or `vitest`) and update this section.

The build script (`package.json:7`) explicitly removes `dist/` and
`tsconfig.tsbuildinfo` before invoking `nest build` — incremental builds have
caused stale-output bugs, so don't replace it with a plain `nest build`.

## Required env

`.env` keys consumed at boot (see `README.md` for full list):

```env
DATABASE_URL="mysql://..."     # required, Prisma fails fast without it
PORT=3001                       # falls back to 3005 in main.ts
ADMIN_AUTH_SECRET=...           # admin JWT signing
CUSTOMER_AUTH_SECRET=...        # customer JWT signing
JWT_SECRET=...
APP_URL=http://localhost:3001
```

CRM, doctor-network, and SMTP integrations also pull from `.env` and from the
`Crm` / `DoctorNetwork` / `PortalConfiguration` rows in the database.

Default seeded admin: `admin@example.com` / `Admin@123456` (overridable with
`SEED_ADMIN_*` env vars).

## Bootstrap conventions (`src/main.ts`)

- Global prefix: `/api` — every controller route is mounted under `/api/...`.
  Health check: `GET /api/ping → "pong"`.
- CORS allow-list is **hard-coded** to `localhost:3000` and `localhost:3001`
  (with 127.0.0.1 variants). Add new origins in `main.ts`, not via env.
- `bodyParser` is replaced manually so a `req.rawBody` string is preserved —
  required by webhook signature verification (CRM/doctor-network HMAC). Do not
  re-enable Nest's default body parser.
- 35 MB body limit (document/video uploads).
- Global `ValidationPipe` with `whitelist`, `transform`, `forbidNonWhitelisted`
  — every controller relies on DTOs with `class-validator` decorators. A field
  not in the DTO is silently dropped *and* will 400; add to the DTO before
  expecting it on `req.body`.

## Module layout

`src/app.module.ts` registers feature modules under `src/modules/<name>/`:

| Module | Mount point | Notes |
|---|---|---|
| `admin-auth` | `/api/auth/admin` | login, 2FA verify/resend, refresh, logout, `me`. JWT + refresh-token rotation. |
| `admin-profile` | `/api/admin/profile` | profile read/update, password change |
| `customer-auth` | `/api/auth/customer` | login, forgot/reset password, refresh, logout, funnel-register |
| `product` | `/api/products` | admin CRUD + variants + slug check + dataset helpers + swap-product fetch |
| `funnel` | `/api/funnels` | admin CRUD + funnel-product mapping + slug-based public fetch + state validation |
| `questionnaire` | `/api/questionnaires` | admin CRUD + clone + evaluate + customer answer submission |
| `crm` | `/api/crm` | CRM record CRUD, campaign sync, campaign details, customer/coupon/order helpers |
| `doctor-network` | `/api/doctor-network` | network CRUD, offer sync, questionnaire sync, token refresh |
| `customer` | `/api/customers` | dashboard, profile, addresses, treatment details, swap flow |
| `patient` | `/api/patients` | sync customer → patient in doctor network |
| `document` | `/api/documents` | document upload, case creation (ID, SSN, video), background verification, video sync |
| `order` | `/api/orders` | create, capture, coupon validate/remove, eligibility, dashboard list, admin list/detail |
| `support` | `/api/support` | support ticket creation |
| `settings` | `/api/settings` | CRM list, doctor-networks, customer-portal config, SMTP, users, system info, states/keypoints |
| `webhook` | `/api/webhooks` | inbound `mdintegration`, `order`, `transaction`, `shipment` |

Each module typically contains: `*.controller.ts`, `*.service.ts`, `*.module.ts`,
optional `dto/`, `enums.ts`, `types.ts`. `crm/` and `doctor-network/` also have
`providers/` (factory targets) and `interfaces/`.

## Auth model

Two parallel JWT auth systems — **admins and customers are not interchangeable**.

- Admin: bearer token in `Authorization: Bearer ...` *or* cookie `tm_admin_access`;
  refresh cookie `tm_admin_refresh`. Guarded routes use:
  ```ts
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('orders.admin.list')
  ```
  Permissions are loaded onto `request.admin.permissions` by `AdminAuthGuard`
  (see `src/modules/admin-auth/guards/admin-auth.guard.ts`) and matched against
  the `@AdminPermissions(...)` reflector key with **OR semantics** (any one of
  the listed permissions grants access).
- Customer: `CustomerAuthGuard` on `/api/customers/...` and other customer-scoped
  endpoints. Cookie names mirror the admin set under a `tm_customer_*` prefix
  (the frontend middleware decodes both).

Permission slugs follow the Laravel convention (`products.admin.list`,
`orders.admin.list`, etc.) and are seeded by `prisma/seed.js` — keep parity with
the slugs the Next.js middleware checks (see frontend `middleware.ts`).

## External integration pattern

Mirrors Laravel's `App\Factories\CrmFactory` / `DoctorNetworkFactory`:

- `crm/providers/` and `doctor-network/providers/` hold per-provider classes.
- Each provider implements an interface in `interfaces/` and is `@Injectable()`,
  registered in the module's `providers: []` array.
- Currently ported: **`vrio.provider.ts`** (CRM), **`mdi.provider.ts`** (doctor
  network). Laravel additionally has CheckoutChamp and Beluga — **not yet
  ported**. To add one, create the provider class, register it in the
  module, and ensure the service-layer dispatch (in `crm.service.ts` /
  `doctor-network.service.ts`) selects it by `Crm.type` / `DoctorNetwork.type`
  enum.

`CrmType` and `DoctorNetworkType` enums in `prisma/schema.prisma` must be
extended in lockstep with new providers, then a migration generated.

## Webhook signing

Webhook handlers rely on `req.rawBody` (preserved in `main.ts`) — never read
`req.body` for signature verification, JSON parsing mutates whitespace and
breaks HMAC. Custom `Signature` header is allow-listed in CORS.

## Prisma schema

Single `prisma/schema.prisma` (~1k lines, 40 models) covers the full domain.
Highlights:

- Enums encode the funnel/order state machine: `FunnelStep` (12 steps from
  `landing` → `dashboard`), `OrderStatus` (`partial`/`active`/`captured`/...),
  `CrmOrderStatus` (`authorized`/`captured`).
- `FunnelProgress` tracks per-customer step state — the same role as Laravel's
  `App\Models\FunnelProgress`.
- `AdminRole`, `AdminPermission`, `AdminAction`, `AdminRolePermission`,
  `AdminUserRolesPermission` reproduce the Laravel admin RBAC tables.
- `OrderTransaction` records the partial/authorized/captured payment lifecycle.

Migrations live in `prisma/migrations/` (timestamps prefixed `20260420...`).
**Never edit a migration that has been applied to a shared environment** — add
a new one. `prisma migrate dev` is fine locally.

## Common utilities (`src/common/utils/`)

- `slug.util.ts` — slug generation (used by product/funnel slug-check endpoints)
- `bigint.util.ts` — JSON serialization helper (Prisma returns `bigint` for some
  fields and Express can't serialize it natively)
- `questionnaire.util.ts` / `questionnaire-evaluator.util.ts` — runs the
  questionnaire DSL (skip logic, conditional routing) — equivalent to Laravel's
  questionnaire evaluation
- `encrypted-config.util.ts` — encrypt/decrypt for stored CRM/doctor-network
  credentials (replaces Laravel's encrypted casts on `Crm` / `DoctorNetwork`)
- `smtp-mail.util.ts` — outbound mail via the SMTP settings stored in DB
- `json-db.util.ts` — JSON-column helpers for Prisma

## Migration status (vs. Laravel `../../telmed-internal/`)

What's done:

- Customer & admin auth (incl. 2FA codepath, refresh tokens)
- Admin RBAC schema + guards + permission decorator
- Product / variant / classification CRUD + dataset + swap support
- Funnel CRUD + product mapping + slug fetch + state validation
- Questionnaire CRUD + clone + evaluate + customer answers
- Customer dashboard / profile / addresses / treatment details
- Patient sync, document/case creation (ID/SSN/video), background verification stub
- Order create / capture / coupon / eligibility / admin views
- Webhooks: MDI, CRM order/transaction/shipment
- Settings: CRM, doctor networks, customer portal, SMTP, users, system info
- Support ticket creation
- One CRM provider (VRIO), one doctor-network provider (MDI)

What's **not yet ported** (present in Laravel):

- **CheckoutChamp** CRM provider and **Beluga** doctor-network provider
- **DoctorMessageController** / `DoctorMessageService` — doctor↔patient
  messaging (frontend has `customer/[customerId]/messages` page wired to TBD)
- **Activity log** / audit trail (Laravel `ActivityLogController`,
  `AdminAction` model is in schema but no controller)
- **ShortLinkController** (`/s/{code}` redirector + `autologin/{user}`)
- **Tracking postbacks** (`Services/Tracking/` — server-side conversion pixels)
- **Smarty** address verification, **XVerify** email/phone, full **Vouched** KYC
  (only a `background-verification` stub exists)
- **Notifications** beyond SMTP (Plivo SMS, marketing/drip jobs)
- **Background job queue** — Laravel's `PlacePartialOrderJob`, `CaptureOrderJob`,
  `CreatePatientJob` etc. currently run synchronously inside service methods.
  When a queue is introduced (BullMQ is the natural fit), expect to refactor.
- **Order renewal** flow (Laravel `OrderRenewalController`)
- **Log viewer** (Laravel mounts `Rap2hpoutre\LaravelLogViewer`)

When you are asked to "port feature X", first check the Laravel controller of
the same name under `../../telmed-internal/app/Http/Controllers/` (and its
service in `app/Services/`) — most logic lives there, not in the model.
