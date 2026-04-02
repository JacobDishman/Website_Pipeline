# ML Pipeline Integration Guide

This document is a briefing for a future AI model implementing the real machine learning
pipeline for this project. Read it entirely before touching any code.

---

## What already exists

The website is complete and wired up. The scoring button at `/scoring` calls a Node.js
Server Action that shells out to `jobs/run_inference.py` and reads back results. The
warehouse priority queue at `/warehouse/priority` reads those results from SQLite and
renders them.

The **only thing missing is a real model** inside `jobs/run_inference.py`. The file
currently contains a hand-written heuristic (weighted sums of `order_total`,
`promo_used`, `shipping_fee`, and past `late_delivery`). Replace that logic with a
trained model. Do not change anything else unless a specific problem forces it.

---

## The interface contract — do not break this

The Node.js layer (`src/app/scoring/actions.ts`) does exactly two things:

1. Runs `python3 jobs/run_inference.py` from the project root (`process.cwd()`), with a
   30-second timeout.
2. Parses the string `SCORED_ORDERS=<integer>` from stdout and displays it in the UI.

Your script **must**:

| Requirement | Details |
|---|---|
| Accept zero CLI arguments | Node calls `execFile("python3", [scriptPath])` with no extra args |
| Resolve `shop.db` relative to CWD | CWD is always the project root when invoked by Next.js |
| Write predictions to `order_predictions` | See schema below |
| Print `SCORED_ORDERS=<n>` to stdout | `n` = number of rows inserted/updated this run |
| Exit with code 0 on success | Non-zero exit → UI shows an error |
| Complete within 30 seconds | Hard timeout in Node; exceeded timeout → UI shows an error |

Everything else is up to you. Stderr output is captured and triggers a soft warning in
the UI but does not count as failure.

---

## The target table: `order_predictions`

Created automatically by both `src/lib/db-migrations.ts` (on page load) and by the
existing `jobs/run_inference.py` stub (on first run).

```sql
CREATE TABLE IF NOT EXISTS order_predictions (
  order_id             INTEGER PRIMARY KEY,
  late_delivery_probability REAL    NOT NULL,
  predicted_late_delivery   INTEGER NOT NULL,   -- 1 = predicted late, 0 = on time
  prediction_timestamp      TEXT    NOT NULL    -- ISO-8601, e.g. 2026-04-02T18:00:00+00:00
);
```

Use `INSERT ... ON CONFLICT(order_id) DO UPDATE SET ...` (upsert) so that re-running
scoring refreshes existing rows rather than failing on duplicates. The current stub
already shows this pattern.

---

## The source data: `shop.db` schema

Run the app and visit `/debug/schema` to inspect the live schema at any time. As of the
current DB, the relevant tables are:

### `orders`
| Column | Type | Notes |
|---|---|---|
| `order_id` | INTEGER PK | |
| `customer_id` | INTEGER | FK → customers |
| `order_datetime` | TEXT | ISO-8601 timestamp |
| `billing_zip` | TEXT | |
| `shipping_zip` | TEXT | |
| `shipping_state` | TEXT | |
| `payment_method` | TEXT | e.g. `"credit_card"` |
| `device_type` | TEXT | e.g. `"web"`, `"mobile"` |
| `ip_country` | TEXT | e.g. `"US"` |
| `promo_used` | INTEGER | 0 or 1 |
| `promo_code` | TEXT | nullable |
| `order_subtotal` | REAL | |
| `shipping_fee` | REAL | |
| `tax_amount` | REAL | |
| `order_total` | REAL | subtotal + shipping + tax |
| `risk_score` | REAL | placeholder; can be repurposed |
| `is_fraud` | INTEGER | 0 or 1 |

### `shipments`
| Column | Type | Notes |
|---|---|---|
| `shipment_id` | INTEGER PK | |
| `order_id` | INTEGER | FK → orders |
| `ship_datetime` | TEXT | |
| `carrier` | TEXT | |
| `shipping_method` | TEXT | |
| `distance_band` | TEXT | e.g. `"short"`, `"long"` |
| `promised_days` | INTEGER | SLA in days |
| `actual_days` | INTEGER | nullable until delivered |
| `late_delivery` | INTEGER | **ground truth label**: 1 = late, 0 = on time |

`late_delivery` on `shipments` is the ground-truth label used to train the model.
Orders without a shipment row are unfulfilled — these are the rows you score and surface
in the priority queue.

### `order_items`
| Column | Type |
|---|---|
| `order_item_id` | INTEGER PK |
| `order_id` | INTEGER |
| `product_id` | INTEGER |
| `quantity` | INTEGER |
| `unit_price` | REAL |
| `line_total` | REAL |

### `customers`
| Column | Type |
|---|---|
| `customer_id` | INTEGER PK |
| `full_name` | TEXT |
| `email` | TEXT |
| `gender` | TEXT |
| `birthdate` | TEXT |
| `city`, `state`, `zip_code` | TEXT |
| `customer_segment` | TEXT |
| `loyalty_tier` | TEXT |
| `is_active` | INTEGER |

### `products`
| Column | Type |
|---|---|
| `product_id` | INTEGER PK |
| `sku`, `product_name`, `category` | TEXT |
| `price`, `cost` | REAL |
| `is_active` | INTEGER |

---

## What orders to score

Score **all** orders — including already-fulfilled ones — so the model has fresh
probabilities if an order's status changes. The warehouse priority queue filters to
unfulfilled orders on the SQL side (`LEFT JOIN shipments s … WHERE s.shipment_id IS
NULL`), so there is no need to pre-filter in Python.

The current stub scores every order in the DB each run. Keep this behaviour unless
performance becomes an issue.

---

## Suggested implementation structure

```
jobs/
  run_inference.py      ← entry point (keep this filename and path)
  model/
    model.pkl           ← serialized trained model (joblib or pickle)
    feature_columns.json ← ordered list of feature names used during training
  train.py              ← (optional) training script, not called by the website
```

A minimal `run_inference.py` using scikit-learn:

```python
#!/usr/bin/env python3
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd

THRESHOLD = 0.5
DB_PATH   = Path.cwd() / "shop.db"
MODEL_DIR = Path(__file__).parent / "model"

def load_features(cursor) -> pd.DataFrame:
    # Build a dataframe of all orders joined to shipments for feature extraction.
    # Include all columns your model was trained on.
    rows = cursor.execute("""
        SELECT
          o.order_id,
          o.order_total,
          o.shipping_fee,
          o.promo_used,
          o.payment_method,
          o.device_type,
          COALESCE(s.distance_band, 'unknown') AS distance_band,
          COALESCE(s.promised_days, 0)         AS promised_days
        FROM orders o
        LEFT JOIN shipments s ON s.order_id = o.order_id
    """).fetchall()
    return pd.DataFrame(rows, columns=[d[0] for d in cursor.description])


def main() -> int:
    model = joblib.load(MODEL_DIR / "model.pkl")
    feature_columns = json.loads((MODEL_DIR / "feature_columns.json").read_text())

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur  = conn.cursor()

    conn.execute("""
        CREATE TABLE IF NOT EXISTS order_predictions (
          order_id                  INTEGER PRIMARY KEY,
          late_delivery_probability REAL    NOT NULL,
          predicted_late_delivery   INTEGER NOT NULL,
          prediction_timestamp      TEXT    NOT NULL
        )
    """)

    df = load_features(cur)
    # One-hot encode or otherwise transform to match training features.
    X  = pd.get_dummies(df[feature_columns])   # adapt to your actual pipeline
    probabilities = model.predict_proba(X)[:, 1]
    timestamp = datetime.now(timezone.utc).isoformat()

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
```

Adapt the SQL query and feature engineering to match however your model was trained.

---

## Adding Python dependencies

The website does not manage a Python virtual environment. The simplest approach that
works without Docker:

1. Create `jobs/requirements.txt` listing all Python packages the script needs
   (e.g. `scikit-learn`, `joblib`, `pandas`).
2. Update `README.md` to tell students to run `pip install -r jobs/requirements.txt`
   before using the scoring button.

If a virtual environment is preferred, put it at `jobs/.venv/` and update the `execFile`
call in `src/app/scoring/actions.ts` to use `jobs/.venv/bin/python` instead of `python3`.
The path must remain absolute or CWD-relative.

---

## How the Node.js side invokes the script

Full source: `src/app/scoring/actions.ts`

```typescript
// key parts
const scriptPath = path.join(process.cwd(), "jobs", "run_inference.py");

const { stdout, stderr } = await execFileAsync("python3", [scriptPath], {
  timeout:   30_000,       // ms — increase if batch scoring takes longer
  maxBuffer: 2 * 1024 * 1024,
});

const scoredOrders = getScoredOrdersCount(stdout) ?? 0;
// getScoredOrdersCount parses /SCORED_ORDERS=(\d+)/ from stdout
```

If you need to pass the DB path or a model path as an argument, add them to the array:
`["python3", [scriptPath, "--db", dbPath]]` — but also update `run_inference.py` to
accept them via `argparse`. Currently no arguments are passed.

If scoring reliably exceeds 30 seconds, increase the `timeout` value.

---

## How results are consumed

`src/app/warehouse/priority/page.tsx` runs this query on every page load:

```sql
SELECT
  o.order_id,
  o.order_datetime          AS order_timestamp,
  o.order_total             AS total_value,
  c.customer_id,
  c.full_name               AS customer_name,
  p.late_delivery_probability,
  p.predicted_late_delivery,
  p.prediction_timestamp
FROM orders o
JOIN customers       c ON c.customer_id = o.customer_id
JOIN order_predictions p ON p.order_id  = o.order_id
LEFT JOIN shipments  s ON s.order_id    = o.order_id
WHERE s.shipment_id IS NULL
ORDER BY p.late_delivery_probability DESC, o.order_datetime ASC
LIMIT 50;
```

The page renders whatever is in `order_predictions`. No changes to this file are needed
unless you add new output columns to the table.

---

## Checklist before marking the pipeline complete

- [ ] `python3 jobs/run_inference.py` runs from the project root without error
- [ ] It prints `SCORED_ORDERS=<n>` (n > 0) to stdout
- [ ] `order_predictions` is populated after running the script
- [ ] Clicking "Run Scoring" on `/scoring` shows a success banner with a non-zero count
- [ ] `/warehouse/priority` shows rows sorted by `late_delivery_probability DESC`
- [ ] Re-running scoring updates existing rows (timestamps change)
- [ ] Script completes in < 30 seconds on the full dataset
- [ ] `jobs/requirements.txt` lists all Python dependencies
