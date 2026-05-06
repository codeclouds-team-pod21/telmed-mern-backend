# telemed-backend

NestJS + Prisma backend for the telemedicine platform migration.

## Tech stack

- NestJS
- Prisma ORM
- MySQL
- TypeScript

## Features

- Admin authentication with login, refresh token flow, logout, and two-factor verification
- Customer authentication with login, forgot password, reset password, refresh token flow, and logout
- Admin profile management with profile update and password change
- Product management with variants, dataset helpers, slug checks, and swap product support
- Funnel management with product mapping, state validation, and slug-based fetch APIs
- Questionnaire management with create, update, clone, evaluate, and customer answer submission flows
- CRM integration layer for campaign sync, campaign details, and order-related CRM actions
- Doctor network integration layer with offer sync, questionnaire sync, token refresh, and webhook support
- Customer management with dashboard, profile update, address management, and treatment detail APIs
- Patient sync APIs for customer-linked patient records
- Document upload and case creation flows for document, SSN, and video submissions
- Order management with order creation, coupon validation, coupon removal, capture flow, and dashboard order views
- Support ticket creation
- Settings management for CRM, doctor networks, customer portal, SMTP, and users
- Webhook endpoints for CRM orders, CRM transactions, CRM shipments, and doctor network events
- Prisma schema and migrations for core telemedicine entities

## Project structure

- `src/modules` contains feature modules
- `src/prisma` contains Prisma service wiring
- `prisma` contains schema and migrations
- `docs` contains request examples and reference notes

## Steps

### 1. Dependencies install karo

```bash
npm install
```

### 2. `.env` file set karo

Project ke root me `.env` file me kam se kam ye values honi chahiye:

```env
DATABASE_URL="mysql://root:password@localhost:3306/telemed-health"
PORT=3001
JWT_SECRET=your-jwt-secret
ADMIN_AUTH_SECRET=your-admin-secret
CUSTOMER_AUTH_SECRET=your-customer-secret
APP_URL=http://localhost:3001
```

Important:
- `DATABASE_URL` sahi hona chahiye, warna Prisma database se connect nahi karega
- Agar `PORT` nahi doge to app default `3005` par chalega
- Kuch features ke liye extra env values lag sakti hain, jaise CRM, SMTP, doctor network wagaira

### 3. Prisma client generate karo

```bash
npm run prisma:generate
```

### 4. Migration chalao

```bash
npm run prisma:migrate
```

### 5. Project run karo

Development mode:

```bash
npm run start:dev
```

Normal start:

```bash
npm run start
```

Build banana ho to:

```bash
npm run build
```

### 6. Check karo server chal raha hai ya nahi

```text
http://localhost:3001/api/ping
```

Response aana chahiye:

```text
pong
```

Agar aapne `.env` me doosra port diya hai, to us port ka use karo.

## Notes

- Global API prefix is `/api`
- Default fallback port is `3005`
- CORS is enabled for local frontend ports `3000` and `3001`
- Some provider-driven features depend on correct environment values for CRM, doctor-network, and SMTP integrations
