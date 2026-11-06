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
     - *Transaction Connection Pooler* (Port `6543`, `?pgbouncer=true`): Configured as `DATABASE_URL` in Vercel serverless runtime to prevent connection exhaustion.
     - *Direct / Session Connection* (Port `5432`): Used as `DATABASE_URL` when executing DDL migrations (`npx prisma migrate deploy`).
     *(Note: `prisma7.config.ts` reads `process.env["DATABASE_URL"]`. The legacy `DIRECT_URL` environment variable is not read by Prisma 7).*

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
# Point DATABASE_URL to Supabase direct database connection (port 5432)
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@db.[project-ref].supabase.co:5432/postgres?sslmode=require" \
npx prisma migrate deploy
```
*(Alternatively, the Supabase Session Pooler on port 5432 `aws-0-[region].pooler.supabase.com:5432` may be used if direct IPv6 connection is unavailable).*

### 2.2 Verify Migration Status
```bash
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@db.[project-ref].supabase.co:5432/postgres?sslmode=require" \
npx prisma migrate status
```
All 7 migrations should be marked applied.

### 2.3 Initial Seed & User Provisioning

DukaanFlow supports two user provisioning paths:

#### Option A: Automated Seed Script (Admin API)
Provisions the demo retailer and order-desk administrator idempotently using the Supabase Service Role Key:
```bash
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@db.[project-ref].supabase.co:5432/postgres?sslmode=require" \
NEXT_PUBLIC_SUPABASE_URL="https://[project-ref].supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
npm run db:seed
```
*Note: The seed script uses `auth.admin.createUser({ email_confirm: true })` and upserts the `User` table keyed on `authSubject`.*

#### Option B: Manual Dashboard & SQL Provisioning (Strict Production)
If users are created or invited manually in the Supabase Auth Dashboard (*Authentication > Users > Add user*):
1. Ensure the user is invited and confirms their email (`email_confirmed_at IS NOT NULL`).
2. Run the role-specific SQL block below in the Supabase SQL Editor.

The SQL script enforces:
- The email must resolve to **exactly one verified user** in `auth.users` (`email_confirmed_at IS NOT NULL`).
- Pre-checks for conflicts on both unique constraints (`"authSubject"` and `email`).
- **Does not silently reassign roles or identities**; if the account or email already exists with a different role or subject, it raises a descriptive exception.

**Provision Retailer:**
```sql
DO $$
DECLARE
  v_auth_id text;
  v_email text := lower(trim('retailer@example.com')); -- Target email (normalized)
  v_matching_count integer;
  v_existing_id text;
  v_existing_role "UserRole";
  v_existing_subject text;
BEGIN
  -- 1. Ensure target email resolves to EXACTLY ONE confirmed auth user
  SELECT count(*), max(id::text) INTO v_matching_count, v_auth_id
  FROM auth.users
  WHERE lower(trim(email)) = v_email
    AND email_confirmed_at IS NOT NULL;

  IF v_matching_count = 0 THEN
    RAISE EXCEPTION 'User % does not exist in auth.users or email is not confirmed (email_confirmed_at is NULL).', v_email;
  ELSIF v_matching_count > 1 THEN
    RAISE EXCEPTION 'Ambiguous state: % confirmed users match email % in auth.users.', v_matching_count, v_email;
  END IF;

  -- 2. Check if authSubject already exists in public."User"
  SELECT id, role, email INTO v_existing_id, v_existing_role, v_existing_subject
  FROM public."User"
  WHERE "authSubject" = v_auth_id;

  IF FOUND THEN
    IF v_existing_role <> 'RETAILER'::"UserRole" THEN
      RAISE EXCEPTION 'Role conflict: authSubject % is already registered with role %, cannot assign RETAILER.', v_auth_id, v_existing_role;
    END IF;
    IF lower(trim(v_existing_subject)) <> v_email THEN
      RAISE EXCEPTION 'Identity conflict: authSubject % is already registered with email %, cannot assign to %.', v_auth_id, v_existing_subject, v_email;
    END IF;
    -- Already provisioned with identical subject, email, and role: idempotent no-op
    RAISE NOTICE 'User % is already provisioned as RETAILER (id: %). No changes made.', v_email, v_existing_id;
    RETURN;
  END IF;

  -- 3. Check if email already exists in public."User" under another authSubject
  SELECT id, "authSubject" INTO v_existing_id, v_existing_subject
  FROM public."User"
  WHERE lower(trim(email)) = v_email;

  IF FOUND THEN
    RAISE EXCEPTION 'Identity conflict: email % is already linked to different authSubject %, expected %.', v_email, v_existing_subject, v_auth_id;
  END IF;

  -- 4. Insert confirmed user with explicit RETAILER role
  -- If another transaction inserted concurrently, ON CONFLICT DO NOTHING prevents unhandled duplicate key crashes.
  INSERT INTO public."User" (id, "authSubject", email, role, "createdAt", "updatedAt")
  VALUES (
    'usr_' || substr(md5(random()::text), 1, 16),
    v_auth_id,
    v_email,
    'RETAILER'::"UserRole",
    NOW(),
    NOW()
  )
  ON CONFLICT ("authSubject") DO NOTHING;

  -- 5. Strict post-insert concurrency verification:
  -- Confirm that the row registered under v_auth_id matches the intended email and role exactly.
  SELECT role, email INTO v_existing_role, v_existing_subject
  FROM public."User"
  WHERE "authSubject" = v_auth_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provisioning failure: user % (authSubject %) could not be inserted or verified.', v_email, v_auth_id;
  ELSIF v_existing_role <> 'RETAILER'::"UserRole" THEN
    RAISE EXCEPTION 'Concurrency conflict: user % (authSubject %) resolved to conflicting role %.', v_email, v_auth_id, v_existing_role;
  ELSIF lower(trim(v_existing_subject)) <> v_email THEN
    RAISE EXCEPTION 'Concurrency conflict: authSubject % resolved to conflicting email % instead of %.', v_auth_id, v_existing_subject, v_email;
  END IF;
END $$;
```

**Provision Order Desk:**
```sql
DO $$
DECLARE
  v_auth_id text;
  v_email text := lower(trim('orderdesk@example.com')); -- Target email (normalized)
  v_matching_count integer;
  v_existing_id text;
  v_existing_role "UserRole";
  v_existing_subject text;
BEGIN
  -- 1. Ensure target email resolves to EXACTLY ONE confirmed auth user
  SELECT count(*), max(id::text) INTO v_matching_count, v_auth_id
  FROM auth.users
  WHERE lower(trim(email)) = v_email
    AND email_confirmed_at IS NOT NULL;

  IF v_matching_count = 0 THEN
    RAISE EXCEPTION 'User % does not exist in auth.users or email is not confirmed (email_confirmed_at is NULL).', v_email;
  ELSIF v_matching_count > 1 THEN
    RAISE EXCEPTION 'Ambiguous state: % confirmed users match email % in auth.users.', v_matching_count, v_email;
  END IF;

  -- 2. Check if authSubject already exists in public."User"
  SELECT id, role, email INTO v_existing_id, v_existing_role, v_existing_subject
  FROM public."User"
  WHERE "authSubject" = v_auth_id;

  IF FOUND THEN
    IF v_existing_role <> 'ORDER_DESK'::"UserRole" THEN
      RAISE EXCEPTION 'Role conflict: authSubject % is already registered with role %, cannot assign ORDER_DESK.', v_auth_id, v_existing_role;
    END IF;
    IF lower(trim(v_existing_subject)) <> v_email THEN
      RAISE EXCEPTION 'Identity conflict: authSubject % is already registered with email %, cannot assign to %.', v_auth_id, v_existing_subject, v_email;
    END IF;
    -- Already provisioned with identical subject, email, and role: idempotent no-op
    RAISE NOTICE 'User % is already provisioned as ORDER_DESK (id: %). No changes made.', v_email, v_existing_id;
    RETURN;
  END IF;

  -- 3. Check if email already exists in public."User" under another authSubject
  SELECT id, "authSubject" INTO v_existing_id, v_existing_subject
  FROM public."User"
  WHERE lower(trim(email)) = v_email;

  IF FOUND THEN
    RAISE EXCEPTION 'Identity conflict: email % is already linked to different authSubject %, expected %.', v_email, v_existing_subject, v_auth_id;
  END IF;

  -- 4. Insert confirmed user with explicit ORDER_DESK role
  -- If another transaction inserted concurrently, ON CONFLICT DO NOTHING prevents unhandled duplicate key crashes.
  INSERT INTO public."User" (id, "authSubject", email, role, "createdAt", "updatedAt")
  VALUES (
    'usr_' || substr(md5(random()::text), 1, 16),
    v_auth_id,
    v_email,
    'ORDER_DESK'::"UserRole",
    NOW(),
    NOW()
  )
  ON CONFLICT ("authSubject") DO NOTHING;

  -- 5. Strict post-insert concurrency verification:
  -- Confirm that the row registered under v_auth_id matches the intended email and role exactly.
  SELECT role, email INTO v_existing_role, v_existing_subject
  FROM public."User"
  WHERE "authSubject" = v_auth_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provisioning failure: user % (authSubject %) could not be inserted or verified.', v_email, v_auth_id;
  ELSIF v_existing_role <> 'ORDER_DESK'::"UserRole" THEN
    RAISE EXCEPTION 'Concurrency conflict: user % (authSubject %) resolved to conflicting role %.', v_email, v_auth_id, v_existing_role;
  ELSIF lower(trim(v_existing_subject)) <> v_email THEN
    RAISE EXCEPTION 'Concurrency conflict: authSubject % resolved to conflicting email % instead of %.', v_auth_id, v_existing_subject, v_email;
  END IF;
END $$;
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
| `SITE_URL` | Production | `https://[your-production-domain]` (Server-only; used for magic-link callback targets) |
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
