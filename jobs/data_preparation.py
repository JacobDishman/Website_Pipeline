"""
Shared data loading and feature engineering for the ML pipeline.
Used by both train.py (training) and run_inference.py (scoring).

Supports two backends:
  - Supabase REST API (default, via SUPABASE_URL + SUPABASE_KEY env vars)
  - SQLite (legacy, via a pathlib.Path argument)
"""
import os
from pathlib import Path

import numpy as np
import pandas as pd
import requests
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

NUMERIC_FEATURES = [
    "order_subtotal",
    "shipping_fee",
    "tax_amount",
    "order_total",
    "risk_score",
    "promo_used",
    "item_count",
    "total_qty",
    "avg_unit_price",
    "unique_products",
    "order_hour",
    "order_dow",
    "is_weekend",
    "zip_mismatch",
    "is_international",
    "subtotal_ratio",
    "log_order_total",
]

CATEGORICAL_FEATURES = [
    "payment_method",
    "device_type",
    "gender",
    "customer_segment",
    "loyalty_tier",
]

ALL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES


def _supabase_select_all(url: str, key: str, table: str) -> list[dict]:
    """Fetch all rows from a Supabase table via REST API with pagination."""
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Prefer": "count=exact",
    }
    all_rows = []
    offset = 0
    batch_size = 1000
    while True:
        resp = requests.get(
            f"{url}/rest/v1/{table}",
            headers=headers,
            params={"select": "*", "offset": offset, "limit": batch_size},
        )
        resp.raise_for_status()
        rows = resp.json()
        if not rows:
            break
        all_rows.extend(rows)
        if len(rows) < batch_size:
            break
        offset += batch_size
    return all_rows


def load_tables(db_source=None) -> dict[str, pd.DataFrame]:
    """Load all relevant tables into a dict of DataFrames.

    db_source can be:
      - A pathlib.Path (SQLite file path, for backwards compatibility)
      - None (reads from Supabase REST API via env vars)
    """
    if isinstance(db_source, Path):
        import sqlite3
        conn = sqlite3.connect(db_source)
        tables = {
            "orders": pd.read_sql("SELECT * FROM orders", conn),
            "customers": pd.read_sql("SELECT * FROM customers", conn),
            "order_items": pd.read_sql("SELECT * FROM order_items", conn),
            "shipments": pd.read_sql("SELECT * FROM shipments", conn),
        }
        conn.close()
        return tables

    # Supabase REST API mode
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise ValueError("Set SUPABASE_URL and SUPABASE_KEY environment variables")

    table_names = ["orders", "customers", "order_items", "shipments"]
    tables = {}
    for name in table_names:
        rows = _supabase_select_all(url, key, name)
        tables[name] = pd.DataFrame(rows)
        print(f"  Loaded {name}: {len(tables[name])} rows")
    return tables


def engineer_features(tables: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """
    Join tables and engineer features.
    Returns a DataFrame with order_id, all features, and target columns
    (is_fraud from orders, late_delivery from shipments where available).
    """
    orders = tables["orders"]
    customers = tables["customers"]
    order_items = tables["order_items"]
    shipments = tables["shipments"]

    order_items_columns = {c.lower() for c in order_items.columns}
    quantity_col = "quantity" if "quantity" in order_items_columns else "qty" if "qty" in order_items_columns else None
    unit_price_col = (
        "unit_price"
        if "unit_price" in order_items_columns
        else "price"
        if "price" in order_items_columns
        else None
    )
    if quantity_col is None:
        raise ValueError("order_items must include a quantity column (quantity or qty).")
    if unit_price_col is None:
        raise ValueError("order_items must include a unit price column (unit_price or price).")

    item_agg = order_items.groupby("order_id").agg(
        item_count=("order_item_id", "count"),
        total_qty=(quantity_col, "sum"),
        avg_unit_price=(unit_price_col, "mean"),
        unique_products=("product_id", "nunique"),
    ).reset_index()

    df = orders.merge(
        customers[["customer_id", "gender", "customer_segment", "loyalty_tier"]],
        on="customer_id",
        how="left",
    )
    df = df.merge(item_agg, on="order_id", how="left")
    df = df.merge(
        shipments[["order_id", "late_delivery"]],
        on="order_id",
        how="left",
    )

    df["order_datetime"] = pd.to_datetime(df["order_datetime"], format="mixed", utc=True)
    df["order_hour"] = df["order_datetime"].dt.hour
    df["order_dow"] = df["order_datetime"].dt.dayofweek
    df["is_weekend"] = (df["order_dow"] >= 5).astype(int)
    df["zip_mismatch"] = (df["billing_zip"] != df["shipping_zip"]).astype(int)
    df["is_international"] = (df["ip_country"] != "US").astype(int)
    df["subtotal_ratio"] = df["order_subtotal"] / df["order_total"].replace(0, np.nan)
    df["log_order_total"] = np.log1p(df["order_total"])

    return df


def build_preprocessor() -> ColumnTransformer:
    """Build the sklearn ColumnTransformer preprocessing pipeline."""
    numeric_pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])
    categorical_pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])
    return ColumnTransformer([
        ("num", numeric_pipeline, NUMERIC_FEATURES),
        ("cat", categorical_pipeline, CATEGORICAL_FEATURES),
    ])
