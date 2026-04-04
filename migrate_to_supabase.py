#!/usr/bin/env python3
"""
One-time migration script: copy all data from shop.db (SQLite) to Supabase (PostgreSQL).

Usage:
  pip install psycopg2-binary
  DATABASE_URL="postgresql://postgres.[ref]:[password]@..." python migrate_to_supabase.py
"""
import os
import sqlite3
import sys

import psycopg2

SQLITE_PATH = "shop.db"
DATABASE_URL = os.environ.get("DATABASE_URL")

# Tables in dependency order (parents before children)
TABLES = [
    "customers",
    "products",
    "orders",
    "order_items",
    "shipments",
    "product_reviews",
    "order_predictions",
]


def main() -> int:
    if not DATABASE_URL:
        print("ERROR: Set DATABASE_URL environment variable to your Supabase PostgreSQL connection string.")
        print('  Example: DATABASE_URL="postgresql://postgres.xxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres"')
        return 1

    # Connect to both databases
    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_conn.row_factory = sqlite3.Row
    pg_conn = psycopg2.connect(DATABASE_URL)
    pg_cur = pg_conn.cursor()

    for table in TABLES:
        print(f"\nMigrating {table}...")

        # Get rows from SQLite
        sqlite_cur = sqlite_conn.cursor()
        sqlite_cur.execute(f"SELECT * FROM {table}")
        rows = sqlite_cur.fetchall()

        if not rows:
            print(f"  No rows in {table}, skipping.")
            continue

        columns = [desc[0] for desc in sqlite_cur.description]
        col_list = ", ".join(columns)
        placeholders = ", ".join(["%s"] * len(columns))

        # Clear existing data in PostgreSQL (in case of re-run)
        pg_cur.execute(f"DELETE FROM {table}")

        # Insert in batches
        batch_size = 500
        inserted = 0
        for i in range(0, len(rows), batch_size):
            batch = rows[i:i + batch_size]
            values_list = [tuple(row) for row in batch]
            args_str = ",".join(
                pg_cur.mogrify(f"({placeholders})", vals).decode("utf-8")
                for vals in values_list
            )
            pg_cur.execute(f"INSERT INTO {table} ({col_list}) VALUES {args_str}")
            inserted += len(batch)

        print(f"  Inserted {inserted} rows into {table}.")

    # Reset sequences to match max IDs
    print("\nResetting sequences...")
    sequence_tables = {
        "customers": "customer_id",
        "products": "product_id",
        "orders": "order_id",
        "order_items": "order_item_id",
        "shipments": "shipment_id",
        "product_reviews": "review_id",
    }
    for table, pk_col in sequence_tables.items():
        seq_name = f"{table}_{pk_col}_seq"
        pg_cur.execute(f"SELECT setval('{seq_name}', COALESCE((SELECT MAX({pk_col}) FROM {table}), 1))")
        print(f"  Reset {seq_name}")

    pg_conn.commit()
    pg_conn.close()
    sqlite_conn.close()

    print("\nMigration complete!")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
