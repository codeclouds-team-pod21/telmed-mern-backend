# Telemed Backend Kaise Run Kare

## Kya chahiye

- Node.js
- npm
- MySQL database

## 1. Dependencies install karo

```bash
npm install
```

## 2. `.env` file set karo

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
- `DATABASE_URL` sahi hona chahiye, warna Prisma database se connect nahi karega.
- Agar `PORT` nahi doge to app default `3005` par chalega.
- Kuch features ke liye extra env values lag sakti hain, jaise CRM, SMTP, doctor network wagaira.

## 3. Prisma client generate karo

```bash
npm run prisma:generate
```

## 4. Migration chalao

```bash
npm run prisma:migrate
```

Isse database schema setup ya update ho jayega.

## 5. Project run karo

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

## 6. Check karo server chal raha hai ya nahi

Browser ya Postman me ye URL kholo:

```text
http://localhost:3001/api/ping
```

Response aana chahiye:

```text
pong
```

Agar aapne `.env` me doosra port diya hai, to us port ka use karo.

## Useful commands

```bash
npm run lint
npm run prisma:generate
npm run prisma:migrate
```

## API base path

Saare APIs `/api` prefix ke andar chalenge.

Example:

```text
http://localhost:3001/api/products
```
