// M0 demo-user provisioning — IDEMPOTENT by design (safe to run repeatedly):
//   1. Check Supabase Auth for the user (Admin API list); create with email_confirm
//      only if missing — Auth user ALWAYS exists before any public.users write.
//   2. Upsert the public.users row keyed on the Auth uid (authSubject).
// Run: npm run db:seed
import "dotenv/config";
import { prisma } from "../src/db";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEMO_USERS = [
  { email: "retailer@dukaanflow.test", role: "RETAILER" as const },
  { email: "desk@dukaanflow.test", role: "ORDER_DESK" as const },
];

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("seed FAILED: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (see .env.example)");
  process.exit(1);
}

const adminHeaders = {
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  apikey: SERVICE_ROLE_KEY,
  "Content-Type": "application/json",
};

async function findAuthUser(email: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: adminHeaders,
  });
  if (!res.ok) throw new Error(`admin list failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { users?: Array<{ id: string; email?: string }> };
  const users = body.users ?? [];
  const hit = users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
  return hit?.id ?? null;
}

async function createAuthUser(email: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ email, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`admin create failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { id?: string; user?: { id?: string } };
  const id = body.id ?? body.user?.id;
  if (!id) throw new Error("admin create returned no user id");
  return id;
}

async function main() {
  for (const demo of DEMO_USERS) {
    let authId = await findAuthUser(demo.email);
    const existed = authId !== null;
    if (!authId) authId = await createAuthUser(demo.email);

    // Auth identity first (above), public.users second — upsert on the unique Auth uid.
    await prisma.user.upsert({
      where: { authSubject: authId },
      create: { authSubject: authId, email: demo.email, role: demo.role },
      update: { email: demo.email, role: demo.role },
    });
    console.log(`seed: ${demo.email} (${demo.role}) auth=${existed ? "existing" : "created"} public.users=upserted`);
  }
  console.log("seed OK");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("seed FAILED:", err);
    process.exit(1);
  });
