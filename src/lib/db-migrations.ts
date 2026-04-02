import { execute } from "@/lib/db";

export function ensureOrderPredictionsTable() {
  execute(
    `CREATE TABLE IF NOT EXISTS order_predictions (
      order_id INTEGER PRIMARY KEY,
      late_delivery_probability REAL NOT NULL,
      predicted_late_delivery INTEGER NOT NULL,
      prediction_timestamp TEXT NOT NULL
    )`,
  );
}

