// M0 demo-user provisioning — IDEMPOTENT by design (safe to run repeatedly):
//   1. Check Supabase Auth for the user (Admin API list); create with email_confirm
//      only if missing — Auth user ALWAYS exists before any public.users write.
//   2. Upsert the public.users row keyed on the Auth uid (authSubject).
// Run: npm run db:seed
import "dotenv/config";
import { prisma } from "../src/db";
import { z } from "zod";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEMO_USERS = [
  { email: "retailer@dukaanflow.test", role: "RETAILER" as const },
  { email: "desk@dukaanflow.test", role: "ORDER_DESK" as const },
];

const DEMO_PRODUCTS = [
  {
    sku: "SKU-BS-075",
    name: "Glucose biscuit, 75 g",
    pricePaise: 810,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 96,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 340,
    inventoryUnit: "CASE" as const,
    scheme: {
      kind: "BUY_X_GET_Y" as const,
      buyQty: 10,
      freeQty: 1,
    },
  },
  {
    sku: "SKU-DT-1KG",
    name: "Detergent powder, 1 kg",
    pricePaise: 10150,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 20,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 85,
    inventoryUnit: "CASE" as const,
    scheme: {
      kind: "THRESHOLD_PERCENT" as const,
      minQty: 5,
      discountBps: 300,
    },
  },
  {
    sku: "SKU-TE-250",
    name: "Tea leaf, 250 g",
    pricePaise: 11800,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 40,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 0,
    inventoryUnit: "CASE" as const,
    scheme: null,
  },
] as const;

const buyXGetYSchemeSchema = z.object({
  kind: z.literal("BUY_X_GET_Y"),
  buyQty: z.number().int().positive(),
  freeQty: z.number().int().positive(),
}).strict();

const thresholdPercentSchemeSchema = z.object({
  kind: z.literal("THRESHOLD_PERCENT"),
  minQty: z.number().int().positive(),
  discountBps: z.number().int().positive().max(10_000),
}).strict();

const productFixtureSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  pricePaise: z.number().int().nonnegative(),
  priceBasis: z.enum(["UNCONFIRMED", "PER_PACK", "PER_CASE"]),
  packSize: z.number().int().positive(),
  packUnit: z.enum(["PIECE", "PACK", "CASE"]),
  sellingUnit: z.enum(["PIECE", "PACK", "CASE"]),
  inventoryQty: z.number().int().nonnegative(),
  inventoryUnit: z.enum(["PIECE", "PACK", "CASE"]),
  scheme: z.union([
    buyXGetYSchemeSchema,
    thresholdPercentSchemeSchema,
    z.null(),
  ]),
}).strict();

const validatedProducts = z.array(productFixtureSchema).length(3).parse(DEMO_PRODUCTS);

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

  for (const product of validatedProducts) {
    const saved = await prisma.product.upsert({
      where: { sku: product.sku },
      create: {
        sku: product.sku,
        name: product.name,
        pricePaise: product.pricePaise,
        priceBasis: product.priceBasis,
        packSize: product.packSize,
        packUnit: product.packUnit,
        sellingUnit: product.sellingUnit,
        inventoryQty: product.inventoryQty,
        inventoryUnit: product.inventoryUnit,
        schemes: product.scheme
          ? { create: { ...product.scheme } }
          : undefined,
      },
      update: {
        name: product.name,
        pricePaise: product.pricePaise,
        priceBasis: product.priceBasis,
        packSize: product.packSize,
        packUnit: product.packUnit,
        sellingUnit: product.sellingUnit,
        inventoryQty: product.inventoryQty,
        inventoryUnit: product.inventoryUnit,
        isActive: true,
      },
    });

    if (product.scheme) {
      await prisma.scheme.upsert({
        where: {
          productId_kind: { productId: saved.id, kind: product.scheme.kind },
        },
        create: { productId: saved.id, ...product.scheme },
        update: { ...product.scheme, isActive: true },
      });
    } else {
      await prisma.scheme.deleteMany({ where: { productId: saved.id } });
    }

    console.log(`seed: ${product.sku} product=upserted scheme=${product.scheme?.kind ?? "none"}`);
  }
  console.log("seed OK");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("seed FAILED:", err);
    process.exit(1);
  });
