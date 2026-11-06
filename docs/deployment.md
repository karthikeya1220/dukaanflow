# Production Deployment Guide — DukaanFlow

This guide outlines the production deployment procedure for DukaanFlow across Supabase (managed PostgreSQL and Auth) and Vercel (Next.js hosting).

---

## 1. Managed Supabase Production Setup

### 1.1 Project Creation
1. Create a new Supabase project in your target region (e.g. `ap-south-1` for Mumbai).
2. Note your project credentials:
   - **Project URL**: `https://<project-ref>.supabase.co`
   - **Anon Key**: Under *Project Settings > API*.
   - **Service Role Key**: Under *Project Settings > API* (keep private).
   - **Database Connection Strings**:
     - *Transaction Connection Pooler* (Port `6543` / `pgbouncer=true`): Used for `DATABASE_URL` in Vercel serverless runtime.
     - *Direct Connection* (Port `5432` / Session mode): Used for running DDL migrations (`npx prisma migrate deploy`).

### 1.2 Authentication & Redirect Configuration
Under *Authentication > URL Configuration*:
1. **Site URL**: Set to the production domain (e.g. `https://dukaanflow.vercel.app` or custom domain).
2. **Redirect URLs**: Explicitly allow:
   - `https://<domain>/auth/callback`
   - `https://<domain>/auth/error`

### 1.3 Custom SMTP Provider
In production, Supabase's default email service has a strict rate limit (3 emails/hour). Configure a transactional SMTP provider under *Authentication > SMTP Settings*:
- Providers: Resend, SendGrid, Postmark, AWS SES.
- Custom Sender Name: `DukaanFlow Orders`
- Sender Email: `orders@yourdomain.com`

---

## 2. Prisma Database Migration Runbook

Prisma migrations must be applied before deploying the new frontend build.

### 2.1 Applying Migrations
From a secure deployment runner (e.g. GitHub Actions or local release terminal):
```bash
# Point DATABASE_URL to Supabase direct port 5432 connection
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres?sslmode=require" \
npx prisma migrate deploy
```

### 2.2 Verify Migration Status
```bash
npx prisma migrate status
```
All 7 migrations should be marked applied.

### 2.3 Initial Seed & User Provisioning
To provision the initial order desk administrator and demo retailers:
```bash
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres?sslmode=require" \
NEXT_PUBLIC_SUPABASE_URL="https://[project-ref].supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
npm run db:seed
```

---

## 3. Vercel Project Configuration

### 3.1 Project Settings
- **Framework Preset**: Next.js
- **Root Directory**: `./`
- **Build Command**: `next build` (Prisma generation is handled automatically via `"postinstall": "prisma generate"` in `package.json`).
- **Install Command**: `npm install`

### 3.2 Environment Variables

Configure the following variables under *Project Settings > Environment Variables*:

| Variable Name | Environment | Value Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | Production, Preview | Pooled PostgreSQL URL (Port `6543`, `?pgbouncer=true&sslmode=require`). |
| `NEXT_PUBLIC_SUPABASE_URL` | All | `https://[project-ref].supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All | Supabase Public Anon Key |
| `SITE_URL` | Production | `https://[your-production-domain]` |
| `AI_API_KEY` | Production (Optional) | OpenRouter API key (`sk-or-...`). If omitted, natural language orders fall back to rule-based parsing. |
| `AI_MODEL` | Production | `openrouter/free` |
| `ENABLE_COMMERCIAL_SUBMISSION` | Production | `false` *(Keep false until distributor inventory policy approval)* |
| `ENABLE_ORDER_DESK_REVIEW` | Production | `false` *(Keep false until order desk operational authorization)* |

---

## 4. Post-Deployment Verification (Smoke Tests)

Perform the following smoke tests on the production deployment:
1. **Health & Routing**:
   - Navigate to `/login`. Verify UI assets load cleanly.
2. **Magic Link Authentication**:
   - Request magic link for a provisioned retailer (`retailer@dukaanflow.test` or actual test user).
   - Check mailbox, follow the magic link, and verify redirection lands on `/retailer`.
   - Verify non-order-desk accounts are forbidden from `/order-desk` (`403 Forbidden`).
3. **Catalogue & AI Order Capture**:
   - Browse catalogue items, test search and scheme filter.
   - Open AI Order Assist, submit a test sentence.
   - Verify unit ambiguity flags trigger for items with mismatched packaging.
   - Test explicit confirmation stepper (`Confirm X CASE`).
4. **Simulation Order Submission**:
   - Confirm cart lines and submit a simulation order.
   - Verify `"Simulation Order Created"` banner appears with an order ID.
5. **Order Desk Audit & Tally Separation**:
   - Log in as order desk user.
   - Confirm the submitted order appears with the `SIMULATED` badge.
   - Access `/api/export/tally` and download the CSV.
   - Verify the simulated order ID is **strictly absent** from the commercial export.

---

## 5. Rollback & Recovery Considerations

1. **Frontend Rollback**:
   - Vercel allows instant rollback to any previously deployed immutable deployment with 1 click.
2. **Database Rollback**:
   - Database migrations are additive (`CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE ADD COLUMN`).
   - If rolling back code to an earlier revision, existing columns added by migrations (e.g. `is_simulation`) will be ignored by older schemas without data loss.
   - For disaster recovery, Supabase performs automated daily backups (and Point-in-Time Recovery on Pro plans).
