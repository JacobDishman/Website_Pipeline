# Shop Operations Dashboard

Student project web app built with Next.js (App Router) and SQLite.

## Prerequisites

- Node.js 20+
- npm 10+
- A SQLite database file named `shop.db` at the project root

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

## Scoring Job

Step 8 uses:

```bash
python3 jobs/run_inference.py
```

The script updates `orders.risk_score` and prints `SCORED_ORDERS=<count>`.

## Manual QA Checklist

1. Go to `/select-customer` and choose a customer.
2. Confirm selected-customer banner appears globally.
3. Visit `/dashboard` and verify totals + recent orders render.
4. Place an order on `/place-order` with at least one line item.
5. Confirm redirect to `/orders` with success message and new order link.
6. Open `/orders/[order_id]` and verify line item breakdown.
7. Open `/warehouse/priority` and verify queue renders and sorts.
8. Run `/scoring` and verify success/error status, scored count, and timestamp.
