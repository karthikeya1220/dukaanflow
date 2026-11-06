# DukaanFlow — B2B FMCG Distributor Ordering Platform

DukaanFlow is a production-quality FMCG distributor ordering and order-desk application built for FMCG distributors and retailers. It solves the friction of traditional distributor ordering (informal WhatsApp messages, unstructured phone orders, unit errors, and manual tallying) by providing an intuitive digital catalogue, intelligent natural language order capture, strict cart confirmation, and an order desk review portal with Tally-compatible commercial export.

---

## 1. Architecture & Technology Stack

- **Framework**: Next.js 16 (App Router with Server Components, Server Actions, Partial Prerendering)
- **Language**: TypeScript (strict mode)
- **Styling & UI**: Tailwind CSS 4, shadcn/ui primitives, Radix UI, Lucide icons
- **Database & ORM**: PostgreSQL via Supabase, managed with Prisma ORM 7 (`@prisma/adapter-pg`)
- **Authentication & RBAC**: Supabase Auth (PKCE passwordless magic link OTP) with cookie-based SSR sessions (`@supabase/ssr`) and server-side RBAC enforcement
- **AI Assist**: OpenRouter API with dynamic free-tier model routing (`openrouter/free`) and deterministic rule-based fallback
- **Testing**: Vitest (unit & integration tests), Playwright (end-to-end browser workflows)

---

## 2. Core User Roles & Workflows

### Retailer (`RETAILER`)
- **Catalogue Browsing**: View distributor SKUs, pack configurations, active trade schemes (e.g. *Buy 10 Get 1 Free*), and indicative stock levels.
- **Natural Language Order Assist**: Paste or type Hinglish order text (e.g., *"10 cases Glucose biscuit aur 5 peti Good Day butter"*).
  - AI extraction maps items to validated database SKUs only.
  - **Unit Safety**: Items requested in non-orderable units (e.g., packets when only cases are sold) are flagged as ambiguous. The retailer must explicitly acknowledge and confirm the distributor's selling unit before adding to cart.
  - **Human-in-the-Loop**: AI never submits orders; retailers confirm items and quantities.
- **Cart & Pricing**: Review cart lines, computed promotional schemes, and discounts in integer paise.
- **Order Placement**:
  - **Simulation Mode**: Enabled by default for risk-free end-to-end testing without decrementing inventory.
  - **Commercial Mode**: Protected by server-side policy gates pending distributor inventory agreement.
- **Order History**: Track past submissions and review status.

### Order Desk (`ORDER_DESK`)
- **Queue Overview**: Filter and inspect incoming retailer orders.
- **Audit Details**: Inspect price basis, scheme line items, retailer identities, and simulation tags.
- **Simulation Separation**: Simulated orders display prominent `SIMULATED` badges.
- **Tally Export**: Download commercial CSV export (`/api/export/tally`). Simulation orders and unconfirmed-price orders are strictly excluded.
- **Review Policy**: Order approval and rejection are fail-closed by default until authorized by operational sign-off.

---

## 3. Local Development Setup

### Prerequisites
- **Node.js**: v20+ (recommended v22 or v26)
- **npm**: v10+
- **Docker**: Required to run the local Supabase container stack

### Step 1: Start Supabase Local Stack
```bash
# Start local Supabase containers (API :54321, Postgres :54322, Mailpit :54324)
npx supabase start
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure the following variables point to your local stack:
```env
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon key from npx supabase status>"
SUPABASE_SERVICE_ROLE_KEY="<service_role key from npx supabase status>"
SITE_URL="http://127.0.0.1:3000"

# Test isolation settings
TEST_DB_MUTATIONS="1"
TEST_DATABASE_NAME="postgres"
TEST_DATABASE_SCHEMA="public"

# Optional AI credentials (falls back to rule engine if omitted)
AI_API_KEY=""
AI_MODEL="openrouter/free"
AI_TIMEOUT_MS="30000"

# Policy gates (defaults to false for safety)
ENABLE_COMMERCIAL_SUBMISSION="false"
ENABLE_ORDER_DESK_REVIEW="false"
```

### Step 3: Run Database Migrations & Seed
```bash
# Apply Prisma migrations
npx prisma migrate dev

# Seed demo users and catalogue items
npm run db:seed
```
*Demo credentials provisioned:*
- Retailer: `retailer@dukaanflow.test`
- Order Desk: `desk@dukaanflow.test`

### Step 4: Run the Development Server
```bash
npm run dev
```
Open `http://127.0.0.1:3000` in your browser. Magic links delivered locally can be inspected at Mailpit: `http://127.0.0.1:54324`.

---

## 4. Quality Gates & Testing

Run all quality checks:
```bash
# Linting
npm run lint

# TypeScript verification
npm run typecheck

# Unit tests
npm test

# Full unit and integration tests with loopback database safety flags
TEST_DB_MUTATIONS=1 TEST_DATABASE_NAME=postgres TEST_DATABASE_SCHEMA=public npm test

# Playwright End-to-End tests
TEST_DB_MUTATIONS=1 TEST_DATABASE_NAME=postgres TEST_DATABASE_SCHEMA=public npm run test:e2e

# Production Next.js build
npm run build
```

---

## 5. Production Deployment Overview

DukaanFlow is designed for serverless deployment on **Vercel** with a managed **Supabase** backend:
1. **Prisma Generation**: Configured via `"postinstall": "prisma generate"` to automatically generate client assets at `src/generated/prisma`.
2. **Migrations**: Applied during release via `npx prisma migrate deploy`.
3. **Auth & Mail**: Requires setting production Site URL, Redirect URLs, and custom SMTP in Supabase Auth.
4. **Policy Safeguards**: Commercial orders and Order Desk approvals are fail-closed by default.

For comprehensive production instructions, see [docs/deployment.md](docs/deployment.md) and technical assumptions in [docs/TDD.md](docs/TDD.md).

---

## 6. Known Limitations & Policy Safeguards (v1)

- **No Stock Decrement / Reservation**: Displays indicative catalogue stock; orders do not decrement inventory in v1 pending distributor inventory reconciliation policy sign-off.
- **Unconfirmed Dealer Prices**: Catalogue prices represent baseline distributor list prices; orders containing `UNCONFIRMED` price basis items cannot be exported commercially.
- **Simulation Isolation**: Simulation orders (`isSimulation: true`) are excluded from Tally accounting exports by database constraint and application queries.
