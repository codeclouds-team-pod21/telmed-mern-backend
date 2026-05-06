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

## Run locally

Detailed setup and run instructions are available in [stepd.md](./stepd.md).

Quick start:

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

Health check:

```text
GET /api/ping
```

## Notes

- Global API prefix is `/api`
- Default fallback port is `3005`
- CORS is enabled for local frontend ports `3000` and `3001`
- Some provider-driven features depend on correct environment values for CRM, doctor-network, and SMTP integrations
