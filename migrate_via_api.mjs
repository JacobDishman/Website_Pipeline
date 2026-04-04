/**
 * One-time migration: copy all data from shop.db (SQLite) to Supabase via REST API.
 * Usage: node migrate_via_api.mjs
 */
import Database from "better-sqlite3";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const db = new Database("shop.db");

// Tables in dependency order (parents first for insert, children first for delete)
const TABLES = [
  "customers",
  "products",
  "orders",
  "order_items",
  "shipments",
  "product_reviews",
  "order_predictions",
];

const PK_MAP = {
  customers: "customer_id",
  products: "product_id",
  orders: "order_id",
  order_items: "order_item_id",
  shipments: "shipment_id",
  product_reviews: "review_id",
  order_predictions: "order_id",
};

async function clearTable(tableName) {
  const pk = PK_MAP[tableName];
  const { error } = await supabase.from(tableName).delete().gte(pk, 0);
  if (error) {
    console.log(`  Warning clearing ${tableName}: ${error.message}`);
  }
}

async function migrateTable(tableName) {
  const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
  if (rows.length === 0) {
    console.log(`  ${tableName}: 0 rows, skipping.`);
    return;
  }

  // Insert in batches of 200 (Supabase REST has limits)
  const batchSize = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(tableName).insert(batch);
    if (error) {
      console.error(`  ERROR batch ${i}-${i + batch.length} in ${tableName}: ${error.message}`);
      return;
    }
    inserted += batch.length;
    if (inserted % 1000 === 0 || i + batchSize >= rows.length) {
      console.log(`  ${tableName}: ${inserted}/${rows.length} rows...`);
    }
  }
  console.log(`  ${tableName}: ${inserted} rows inserted.`);
}

async function main() {
  console.log("Starting migration from shop.db to Supabase...\n");

  // Clear tables in reverse order (children first)
  console.log("Clearing existing data...");
  for (const table of [...TABLES].reverse()) {
    await clearTable(table);
  }

  // Insert in dependency order
  for (const table of TABLES) {
    console.log(`Migrating ${table}...`);
    await migrateTable(table);
  }

  console.log("\nMigration complete!");
  db.close();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
