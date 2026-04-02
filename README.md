# Shop Operations Dashboard

Student project web app built with Next.js (App Router) and SQLite.

## Prerequisites

- Node.js 20+
- npm 10+
- A SQLite database file named `shop.db` at the project root
- Python 3.10+ (for training/scoring)

You can override the DB location with:

```bash
SHOP_DB_PATH=./data/shop.db
```

## Install

```bash
npm install
```

## Run (Development)

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production

```bash
npm run build
npm run start
```

## Available Scripts

- `npm run dev` - start development server
- `npm run build` - create production build
- `npm run start` - run production server
- `npm run lint` - run ESLint checks

## Expected Database Tables

The refactored app expects this populated schema:

- `customers`
- `products`
- `orders`
- `order_items`
- `shipments`
- `product_reviews` (optional for current UI)
- `order_predictions` (created by scoring if missing)

## ML Pipeline (Train + Score)

### Python dependencies

```bash
pip install -r jobs/requirements.txt
```

### Train the model

This creates `jobs/model/model.pkl` and `jobs/model/feature_columns.json`.

```bash
python3 jobs/train.py
```

Note: `jobs/model/` is gitignored, so each environment should train (or otherwise supply) the model file.

### Run scoring (CLI)

```bash
python3 jobs/run_inference.py
```

The script writes predictions into `order_predictions` and prints `SCORED_ORDERS=<count>`.

### Run scoring (UI)

Visit `/scoring` and click **Run Scoring**. If the model file is missing, the UI will prompt you to run training first.

## Deployment note (Vercel)

The app UI can be deployed to Vercel, but **Vercel Serverless Functions are not a reliable place to run Python subprocesses**. Treat `/scoring` as a local/dev feature unless you move scoring to an external job runner (future work).

## Manual QA Checklist

1. Go to `/select-customer` and choose a customer.
2. Confirm selected-customer banner appears globally.
3. Visit `/dashboard` and verify totals + recent orders render.
4. Place an order on `/place-order` with at least one line item.
5. Confirm redirect to `/orders` with success message and new order link.
6. Open `/orders/[order_id]` and verify line item breakdown.
7. Open `/warehouse/priority` and verify queue renders and sorts.
8. Run `/scoring` and verify success/error status, scored count, and timestamp.
