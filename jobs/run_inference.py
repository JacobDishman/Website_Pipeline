#!/usr/bin/env python3
"""
Score every order using the trained late-delivery model.
Called by the website:  python3 jobs/run_inference.py
Must print SCORED_ORDERS=<n> to stdout and exit 0 on success.

Connects to Supabase via REST API (SUPABASE_URL + SUPABASE_KEY env vars).
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
import requests

THRESHOLD = 0.5
MODEL_DIR = Path(__file__).resolve().parent / "model"

# Import shared feature engineering from the same package
sys.path.insert(0, str(Path(__file__).resolve().parent))
from data_preparation import ALL_FEATURES, engineer_features, load_tables


def upsert_predictions(url: str, key: str, records: list[dict]) -> int:
    """Upsert prediction records into order_predictions via Supabase REST API."""
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
        resp = requests.post(
            f"{url}/rest/v1/order_predictions",
            headers=headers,
            json=batch,
        )
        resp.raise_for_status()
        updated += len(batch)
    return updated


def main() -> int:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_KEY environment variables are required.", file=sys.stderr)
        return 1

    model_path = MODEL_DIR / "model.pkl"
    if not model_path.exists():
        print(f"ERROR: trained model not found at {model_path}", file=sys.stderr)
        print("Run  python jobs/train.py  first.", file=sys.stderr)
        return 1

    model = joblib.load(model_path)

    print("Loading data from Supabase...")
    tables = load_tables()  # Uses SUPABASE_URL/SUPABASE_KEY env vars
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

    print(f"Upserting {len(records)} predictions to Supabase...")
    updated = upsert_predictions(url, key, records)

    print(f"SCORED_ORDERS={updated}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
