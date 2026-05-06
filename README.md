# telemed-backend

Separate NestJS + Prisma backend scaffold for the telemedicine Laravel migration.

## Included in this pass

- Separate project under `telemed-backend`
- Prisma schema for the inspected domains:
  - products
  - product variants
  - swappable products
  - supply/titration product mappings
  - funnels and funnel products
  - CRM campaigns, offers, shipping profiles
  - doctor networks and doctor network offers
  - questionnaires, answers, funnel progress
  - customers, customer addresses
  - orders and order items
- Nest modules for:
  - `product`
  - `crm`
  - `doctor-network`
  - `funnel`
  - `questionnaire`
  - `order`
- DTOs modeled on the Laravel request payloads we inspected
- Transaction-based create/update flows for products, variants, swappables, funnels, and orders

## Important boundary

The Laravel application has additional modules that were not fully ported in this pass, including customer auth, patient creation, documents, case creation, tracking, notifications, and provider-specific HTTP clients. I did not invent those behaviors.

The CRM and doctor-network provider adapters are intentionally left as architecture placeholders so the Nest project can be extended with the exact provider logic from the Laravel services without guessing undocumented API details.

## Next steps

1. Install dependencies in `telemed-backend`.
2. Run `prisma generate`.
3. Validate `prisma/schema.prisma` against your real MySQL schema.
4. Implement provider adapters like VRIO and MDI using the Laravel integration classes as the source of truth.
5. Continue porting the remaining Laravel modules into the same project.
