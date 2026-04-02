"""
Shared data loading and feature engineering for the ML pipeline.
Used by both train.py (training) and run_inference.py (scoring).
"""
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd
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


def load_tables(db_path: Path) -> dict[str, pd.DataFrame]:
    """Load all relevant tables from shop.db into a dict of DataFrames."""
    conn = sqlite3.connect(db_path)
    tables = {
        "orders": pd.read_sql("SELECT * FROM orders", conn),
        "customers": pd.read_sql("SELECT * FROM customers", conn),
        "order_items": pd.read_sql("SELECT * FROM order_items", conn),
        "shipments": pd.read_sql("SELECT * FROM shipments", conn),
    }
    conn.close()
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

    df["order_datetime"] = pd.to_datetime(df["order_datetime"])
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
