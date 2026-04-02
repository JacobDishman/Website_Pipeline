#!/usr/bin/env python3
"""
Score every order in shop.db using the trained late-delivery model.
Called by the website:  python3 jobs/run_inference.py
Must print SCORED_ORDERS=<n> to stdout and exit 0 on success.
"""
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd

THRESHOLD = 0.5
DB_PATH = Path.cwd() / "shop.db"
MODEL_DIR = Path(__file__).resolve().parent / "model"

# Import shared feature engineering from the same package
sys.path.insert(0, str(Path(__file__).resolve().parent))
from data_preparation import ALL_FEATURES, engineer_features, load_tables


def main() -> int:
    model_path = MODEL_DIR / "model.pkl"
    if not model_path.exists():
        print(f"ERROR: trained model not found at {model_path}", file=sys.stderr)
        print("Run  python jobs/train.py  first.", file=sys.stderr)
        return 1

    model = joblib.load(model_path)

    tables = load_tables(DB_PATH)
    df = engineer_features(tables)

    X = df[ALL_FEATURES]
    probabilities = model.predict_proba(X)[:, 1]
    timestamp = datetime.now(timezone.utc).isoformat()

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS order_predictions (
            order_id                  INTEGER PRIMARY KEY,
            late_delivery_probability REAL    NOT NULL,
            predicted_late_delivery   INTEGER NOT NULL,
            prediction_timestamp      TEXT    NOT NULL
        )
    """)

    updated = 0
    for order_id, prob in zip(df["order_id"], probabilities):
        cur.execute("""
            INSERT INTO order_predictions
                (order_id, late_delivery_probability, predicted_late_delivery, prediction_timestamp)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(order_id) DO UPDATE SET
                late_delivery_probability  = excluded.late_delivery_probability,
                predicted_late_delivery    = excluded.predicted_late_delivery,
                prediction_timestamp       = excluded.prediction_timestamp
        """, (int(order_id), float(prob), int(prob >= THRESHOLD), timestamp))
        updated += 1

    conn.commit()
    conn.close()
    print(f"SCORED_ORDERS={updated}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
