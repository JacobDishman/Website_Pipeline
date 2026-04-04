"""
Vercel Python Serverless Function — POST /api/score
Runs the ML inference pipeline and writes predictions to Supabase.
"""
import json
import os
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import requests as http_requests

THRESHOLD = 0.5
MODEL_DIR = Path(__file__).resolve().parent / ".." / "jobs" / "model"

# Feature lists (duplicated here to avoid import path issues in Vercel)
NUMERIC_FEATURES = [
    "order_subtotal", "shipping_fee", "tax_amount", "order_total",
    "risk_score", "promo_used", "item_count", "total_qty",
    "avg_unit_price", "unique_products", "order_hour", "order_dow",
    "is_weekend", "zip_mismatch", "is_international", "subtotal_ratio",
    "log_order_total",
]
CATEGORICAL_FEATURES = [
    "payment_method", "device_type", "gender", "customer_segment", "loyalty_tier",
]
ALL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES


def supabase_select_all(url, key, table):
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
    }
    all_rows = []
    offset = 0
    batch_size = 1000
    while True:
        resp = http_requests.get(
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


def upsert_predictions(url, key, records):
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    batch_size = 200
    updated = 0
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        resp = http_requests.post(
            f"{url}/rest/v1/order_predictions",
            headers=headers,
            json=batch,
        )
        resp.raise_for_status()
        updated += len(batch)
    return updated


def engineer_features(tables):
    orders = tables["orders"]
    customers = tables["customers"]
    order_items = tables["order_items"]
    shipments = tables["shipments"]

    item_agg = order_items.groupby("order_id").agg(
        item_count=("order_item_id", "count"),
        total_qty=("quantity", "sum"),
        avg_unit_price=("unit_price", "mean"),
        unique_products=("product_id", "nunique"),
    ).reset_index()

    df = orders.merge(
        customers[["customer_id", "gender", "customer_segment", "loyalty_tier"]],
        on="customer_id", how="left",
    )
    df = df.merge(item_agg, on="order_id", how="left")
    df = df.merge(shipments[["order_id", "late_delivery"]], on="order_id", how="left")

    df["order_datetime"] = pd.to_datetime(df["order_datetime"], format="mixed", utc=True)
    df["order_hour"] = df["order_datetime"].dt.hour
    df["order_dow"] = df["order_datetime"].dt.dayofweek
    df["is_weekend"] = (df["order_dow"] >= 5).astype(int)
    df["zip_mismatch"] = (df["billing_zip"] != df["shipping_zip"]).astype(int)
    df["is_international"] = (df["ip_country"] != "US").astype(int)
    df["subtotal_ratio"] = df["order_subtotal"] / df["order_total"].replace(0, np.nan)
    df["log_order_total"] = np.log1p(df["order_total"])

    return df


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

        if not url or not key:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Missing Supabase credentials"}).encode())
            return

        try:
            model_path = MODEL_DIR / "model.pkl"
            if not model_path.exists():
                raise FileNotFoundError(f"Model not found at {model_path}")

            model = joblib.load(model_path)

            # Load data from Supabase
            tables = {}
            for name in ["orders", "customers", "order_items", "shipments"]:
                rows = supabase_select_all(url, key, name)
                tables[name] = pd.DataFrame(rows)

            df = engineer_features(tables)
            X = df[ALL_FEATURES]
            probabilities = model.predict_proba(X)[:, 1]
            timestamp = datetime.now(timezone.utc).isoformat()

            records = []
            for order_id, prob in zip(df["order_id"], probabilities):
                records.append({
                    "order_id": int(order_id),
                    "late_delivery_probability": float(prob),
                    "predicted_late_delivery": int(prob >= THRESHOLD),
                    "prediction_timestamp": timestamp,
                })

            updated = upsert_predictions(url, key, records)

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"scored_orders": updated}).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
