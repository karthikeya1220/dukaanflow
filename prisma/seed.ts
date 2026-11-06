// M0 demo-user provisioning — IDEMPOTENT by design (safe to run repeatedly):
//   1. Check Supabase Auth for the user (Admin API list); create with email_confirm
//      only if missing — Auth user ALWAYS exists before any public.users write.
//   2. Upsert the public.users row keyed on the Auth uid (authSubject).
// Run: npm run db:seed
import "dotenv/config";
import { assertSafeSeedEnvironment } from "../src/lib/seed-safety";

// Production Safeguard: Run guard before database connection or Auth imports
assertSafeSeedEnvironment();

import { prisma } from "../src/db";
import { z } from "zod";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEMO_USERS = [
  { email: "retailer@dukaanflow.test", role: "RETAILER" as const },
  { email: "desk@dukaanflow.test", role: "ORDER_DESK" as const },
];

const DEMO_PRODUCTS = [
  // ── Existing Core Assessment SKUs (Preserved for compatibility) ──
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

  // ── Biscuits, Snacks & Bakery ──
  {
    sku: "SKU-PARLE-G",
    name: "Parle-G Gold Biscuits, 100 g",
    pricePaise: 1000,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 120,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 500,
    inventoryUnit: "CASE" as const,
    scheme: {
      kind: "BUY_X_GET_Y" as const,
      buyQty: 12,
      freeQty: 1,
    },
  },
  {
    sku: "SKU-GD-BUTTER",
    name: "Britannia Good Day Butter Cookies, 75 g",
    pricePaise: 1500,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 72,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 220,
    inventoryUnit: "CASE" as const,
    scheme: {
      kind: "THRESHOLD_PERCENT" as const,
      minQty: 5,
      discountBps: 250,
    },
  },
  {
    sku: "SKU-OREO-120",
    name: "Cadbury Oreo Vanilla Crème Sandwich Biscuits, 120 g",
    pricePaise: 3500,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 48,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 150,
    inventoryUnit: "CASE" as const,
    scheme: null,
  },
  {
    sku: "SKU-LAYS-MAGIC",
    name: "Lay's India's Magic Masala Potato Chips, 50 g",
    pricePaise: 2000,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 60,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 310,
    inventoryUnit: "CASE" as const,
    scheme: {
      kind: "BUY_X_GET_Y" as const,
      buyQty: 9,
      freeQty: 1,
    },
  },
  {
    sku: "SKU-KURKURE-MS",
    name: "Kurkure Masala Munch Crisps, 85 g",
    pricePaise: 2000,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 50,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 280,
    inventoryUnit: "CASE" as const,
    scheme: {
      kind: "THRESHOLD_PERCENT" as const,
      minQty: 8,
      discountBps: 400,
    },
  },

  // ── Staples, Pulses & Cooking Oil ──
  {
    sku: "SKU-AASH-ATTA-5KG",
    name: "Aashirvaad Shudh Chakki Whole Wheat Atta, 5 kg",
    pricePaise: 25500,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 6,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 110,
    inventoryUnit: "CASE" as const,
    scheme: {
      kind: "THRESHOLD_PERCENT" as const,
      minQty: 10,
      discountBps: 350,
    },
  },
  {
    sku: "SKU-FORT-OIL-1L",
    name: "Fortune Refined Mustard Oil Kachi Ghani, 1 L Pouch",
    pricePaise: 14200,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 16,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 90,
    inventoryUnit: "CASE" as const,
    scheme: null,
  },
  {
    sku: "SKU-FORT-SUN-1L",
    name: "Fortune Sunlite Refined Sunflower Oil, 1 L Pouch",
    pricePaise: 13500,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 16,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 125,
    inventoryUnit: "CASE" as const,
    scheme: {
      kind: "BUY_X_GET_Y" as const,
      buyQty: 15,
      freeQty: 1,
    },
  },
  {
    sku: "SKU-TATA-SALT-1KG",
    name: "Tata Salt Vacuum Evaporated Iodized Salt, 1 kg",
    pricePaise: 2800,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 24,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 420,
    inventoryUnit: "CASE" as const,
    scheme: null,
  },
  {
    sku: "SKU-TATA-DAL-TOOR-1KG",
    name: "Tata Sampann Unpolished Toor Dal Arhar Dal, 1 kg",
    pricePaise: 17500,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 20,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 75,
    inventoryUnit: "CASE" as const,
    scheme: {
      kind: "THRESHOLD_PERCENT" as const,
      minQty: 6,
      discountBps: 200,
    },
  },
  {
    sku: "SKU-DAAWAT-RICE-5KG",
    name: "Daawat Rozana Super Basmati Rice, 5 kg",
    pricePaise: 44000,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 4,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 60,
    inventoryUnit: "CASE" as const,
    scheme: null,
  },

  // ── Beverages, Tea & Coffee ──
  {
    sku: "SKU-RED-LABEL-500",
    name: "Brooke Bond Red Label Strong Blend Tea, 500 g",
    pricePaise: 26000,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 24,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 95,
    inventoryUnit: "CASE" as const,
    scheme: {
      kind: "BUY_X_GET_Y" as const,
      buyQty: 8,
      freeQty: 1,
    },
  },
  {
    sku: "SKU-TATA-TEA-GOLD-500",
    name: "Tata Tea Gold Assam Orthodox Long Leaf, 500 g",
    pricePaise: 31000,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 20,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 80,
    inventoryUnit: "CASE" as const,
    scheme: {
      kind: "THRESHOLD_PERCENT" as const,
      minQty: 6,
      discountBps: 350,
    },
  },
  {
    sku: "SKU-NESCAFE-CL-100",
    name: "Nescafe Classic Instant Pure Coffee Jar, 100 g",
    pricePaise: 34000,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 24,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 65,
    inventoryUnit: "CASE" as const,
    scheme: null,
  },
  {
    sku: "SKU-BOURNVITA-500",
    name: "Cadbury Bournvita Chocolate Health Nutrition Drink, 500 g",
    pricePaise: 24500,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 18,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 110,
    inventoryUnit: "CASE" as const,
    scheme: {
      kind: "BUY_X_GET_Y" as const,
      buyQty: 5,
      freeQty: 1,
    },
  },

  // ── Packaged & Instant Foods ──
  {
    sku: "SKU-MAGGI-MASALA-70",
    name: "Maggi 2-Minute Instant Noodles Masala, 70 g",
    pricePaise: 1400,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 48,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 600,
    inventoryUnit: "CASE" as const,
    scheme: {
      kind: "BUY_X_GET_Y" as const,
      buyQty: 11,
      freeQty: 1,
    },
  },
  {
    sku: "SKU-KISSAN-KETCHUP-1KG",
    name: "Kissan Fresh Tomato Ketchup Bottle, 1 kg",
    pricePaise: 13500,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 12,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 140,
    inventoryUnit: "CASE" as const,
    scheme: {
      kind: "THRESHOLD_PERCENT" as const,
      minQty: 4,
      discountBps: 500,
    },
  },

  // ── Personal Care & Grooming ──
  {
    sku: "SKU-DOVE-BAR-100",
    name: "Dove Cream Beauty Bathing Bar Soap, 100 g",
    pricePaise: 6500,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 36,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 190,
    inventoryUnit: "CASE" as const,
    scheme: {
      kind: "BUY_X_GET_Y" as const,
      buyQty: 14,
      freeQty: 1,
    },
  },
  {
    sku: "SKU-DETTOL-SOAP-125",
    name: "Dettol Original Germ Protection Bathing Soap, 125 g",
    pricePaise: 5800,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 32,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 240,
    inventoryUnit: "CASE" as const,
    scheme: null,
  },
  {
    sku: "SKU-COLGATE-MAX-150",
    name: "Colgate MaxFresh Spicy Fresh Red Gel Toothpaste, 150 g",
    pricePaise: 11500,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 30,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 160,
    inventoryUnit: "CASE" as const,
    scheme: {
      kind: "THRESHOLD_PERCENT" as const,
      minQty: 6,
      discountBps: 300,
    },
  },
  {
    sku: "SKU-HEAD-SHOULDERS-180",
    name: "Head & Shoulders Anti-Dandruff Cool Menthol Shampoo, 180 ml",
    pricePaise: 18500,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 22,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 130,
    inventoryUnit: "CASE" as const,
    scheme: null,
  },

  // ── Home Care & Laundry ──
  {
    sku: "SKU-SURF-EXCEL-1KG",
    name: "Surf Excel Easy Wash Detergent Powder, 1 kg",
    pricePaise: 14500,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 18,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 210,
    inventoryUnit: "CASE" as const,
    scheme: {
      kind: "BUY_X_GET_Y" as const,
      buyQty: 7,
      freeQty: 1,
    },
  },
  {
    sku: "SKU-VIM-BAR-300",
    name: "Vim Dishwash Anti-Smell Lemon Bar, 300 g",
    pricePaise: 3200,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 54,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 350,
    inventoryUnit: "CASE" as const,
    scheme: {
      kind: "THRESHOLD_PERCENT" as const,
      minQty: 7,
      discountBps: 250,
    },
  },
  {
    sku: "SKU-HARPIC-FL-1L",
    name: "Harpic Power Plus Disinfectant Toilet Cleaner Liquid, 1 L",
    pricePaise: 21500,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 12,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 145,
    inventoryUnit: "CASE" as const,
    scheme: null,
  },
  {
    sku: "SKU-ALLOUT-REFILL-45",
    name: "All Out Ultra Mosquito Repellent Liquid Refill, 45 ml",
    pricePaise: 8800,
    priceBasis: "UNCONFIRMED" as const,
    packSize: 28,
    packUnit: "PACK" as const,
    sellingUnit: "CASE" as const,
    inventoryQty: 260,
    inventoryUnit: "CASE" as const,
    scheme: {
      kind: "BUY_X_GET_Y" as const,
      buyQty: 6,
      freeQty: 1,
    },
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

const validatedProducts = z.array(productFixtureSchema).min(3).parse(DEMO_PRODUCTS);

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
  assertSafeSeedEnvironment();

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
