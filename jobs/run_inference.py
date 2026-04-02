#!/usr/bin/env python3
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def main() -> int:
    db_path = Path.cwd() / "shop.db"
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    cursor = connection.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS order_predictions (
          order_id INTEGER PRIMARY KEY,
          late_delivery_probability REAL NOT NULL,
          predicted_late_delivery INTEGER NOT NULL,
          prediction_timestamp TEXT NOT NULL
        )
        """
    )

    rows = cursor.execute(
        """
        SELECT
          o.order_id,
          o.order_total,
          o.promo_used,
          o.shipping_fee,
          COALESCE(s.late_delivery, 0) AS late_delivery
        FROM orders o
        LEFT JOIN shipments s ON s.order_id = o.order_id
        """
    ).fetchall()

    updated = 0
    for row in rows:
        base = 0.1
        total_component = clamp(float(row["order_total"]) / 400.0, 0.0, 0.55)
        promo_component = 0.08 if int(row["promo_used"]) == 1 else 0.0
        shipping_component = clamp(float(row["shipping_fee"]) / 40.0, 0.0, 0.1)
        late_component = 0.2 if int(row["late_delivery"]) == 1 else 0.0
        probability = clamp(
            base + total_component + promo_component + shipping_component + late_component,
            0.0,
            0.99,
        )
        predicted = 1 if probability >= 0.5 else 0
        timestamp = datetime.now(timezone.utc).isoformat()

        cursor.execute(
            """
            INSERT INTO order_predictions (
              order_id,
              late_delivery_probability,
              predicted_late_delivery,
              prediction_timestamp
            ) VALUES (?, ?, ?, ?)
            ON CONFLICT(order_id) DO UPDATE SET
              late_delivery_probability=excluded.late_delivery_probability,
              predicted_late_delivery=excluded.predicted_late_delivery,
              prediction_timestamp=excluded.prediction_timestamp
            """,
            (int(row["order_id"]), float(probability), int(predicted), timestamp),
        )
        updated += 1

    connection.commit()
    connection.close()
    print(f"SCORED_ORDERS={updated}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
