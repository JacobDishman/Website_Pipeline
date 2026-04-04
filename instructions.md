Your deployed app should include:

- A “Select Customer” screen (no signup/login required)
- The ability to place a new order and save it to the database
- An order history page for the administrator
- A “Run Scoring” button that triggers the ML inference job and refreshes the priority queue (of orders to verify before fulfilling)

### STEP 1 ###

You are generating a complete student project web app using Next.js (App Router) and SQLite.
      Constraints:
      - No authentication. Users select an existing customer to "act as".
      - Use a SQLite file named "shop.db" located at the project root (or /data/shop.db if you prefer).
      - Use better-sqlite3 for DB access.
      - Keep UI simple and clean.

      Tasks:
      1. Create a new Next.js app (App Router).
      2. Add a server-side DB helper module that opens shop.db and exposes helpers for SELECT and INSERT/UPDATE using prepared statements.
      3. Create a shared layout with navigation links:
        - Select Customer
        - Customer Dashboard
        - Place Order
        - Order History
        - Warehouse Priority Queue
        - Run Scoring
      4. Provide install/run instructions (npm) and any required scripts.

      Return:
      - All files to create/modify
      - Any commands to run

### STEP 2 ###

 Add a developer-only page at /debug/schema that prints:
      - All table names in shop.db
      - For each table, the column names and types (PRAGMA table_info)

      Purpose: Students can verify the real schema and adjust prompts if needed.
      Keep it simple and readable.

### STEP 3 ###

      Add a "Select Customer" page at /select-customer.

      Requirements:
      1. Query the database for customers:
        - customer_id
        - first_name
        - last_name
        - email
      2. Render a searchable dropdown or simple list. When a customer is selected, store customer_id in a cookie.
      3. Redirect to /dashboard after selection.
      4. Add a small banner showing the currently selected customer on every page (if set).

      Deliver:
      - Any new routes/components
      - DB query code using better-sqlite3
      - Notes on where customer_id is stored

### STEP 4 ###

Create a /dashboard page that shows a summary for the selected customer.

      Requirements:
      1. If no customer is selected, redirect to /select-customer.
      2. Show:
        - Customer name and email
        - Total number of orders for the customer
        - Total spend across all orders (sum total_value)
        - A small table of the 5 most recent orders (order_id, order_timestamp, fulfilled, total_value)
      3. All data must come from shop.db.

      Deliver:
      - SQL queries used
      - Page UI implementation

### STEP 5 ###

Create a /place-order page that allows creating a new order for the selected customer.

      Requirements:
      1. If no customer selected, redirect to /select-customer.
      2. Query products (product_id, product_name, price) and let the user add 1+ line items:
        - product
        - quantity
      3. On submit:
        - Insert a row into orders for this customer with fulfilled = 0 and order_timestamp = current time
        - Insert corresponding rows into order_items
        - Compute and store total_value in orders (sum price*quantity)
      4. After placing, redirect to /orders and show a success message.

      Constraints:
      - Use a transaction for inserts.
      - Keep the UI minimal (a table of line items is fine).

      Deliver:
      - SQL inserts
      - Next.js route handlers (server actions or API routes)
      - Any validation rules

### STEP 6 ###

 Create a /orders page that shows order history for the selected customer.

      Requirements:
      1. If no customer selected, redirect to /select-customer.
      2. Render a table of the customer's orders:
        - order_id, order_timestamp, fulfilled, total_value
      3. Clicking an order shows /orders/[order_id] with line items:
        - product_name, quantity, unit_price, line_total
      4. Keep it clean and readable.

      Deliver:
      - The two pages
      - SQL queries

### STEP 7 ###

Create /warehouse/priority page that shows the "Late Delivery Priority Queue".

      Use this SQL query exactly (adjust table/column names only if they differ in shop.db):

      SELECT
        o.order_id,
        o.order_timestamp,
        o.total_value,
        o.fulfilled,
        c.customer_id,
        c.first_name || ' ' || c.last_name AS customer_name,
        p.late_delivery_probability,
        p.predicted_late_delivery,
        p.prediction_timestamp
      FROM orders o
      JOIN customers c ON c.customer_id = o.customer_id
      JOIN order_predictions p ON p.order_id = o.order_id
      WHERE o.fulfilled = 0
      ORDER BY p.late_delivery_probability DESC, o.order_timestamp ASC
      LIMIT 50;

      Requirements:
      - Render the results in a table.
      - Add a short explanation paragraph describing why this queue exists.

      Deliver:
      - Page code

### STEP 8 ###

Add a /scoring page with a "Run Scoring" button.

      Behavior:
      1. When clicked, the server runs:
        python jobs/run_inference.py
      2. The Python script writes predictions into order_predictions keyed by order_id.
      3. The UI shows:
        - Success/failure status
        - How many orders were scored (parse stdout if available)
        - Timestamp

      Constraints:
      - Provide safe execution: timeouts and capture stdout/stderr.
      - The app should not crash if Python fails; show an error message.
      - Do not require Docker.

      Deliver:
      - Next.js route/handler for triggering scoring
      - Implementation details for running Python from Node
      - Any UI components needed

### STEP 9 ###

Polish the app for student usability and add a testing checklist.

      Tasks:
      1. Add a banner showing which customer is currently selected.
      2. Add basic form validation on /place-order.
      3. Add error handling for missing DB, missing tables, or empty results.
      4. Provide a manual QA checklist:
        - Select customer
        - Place order
        - View orders
        - Run scoring
        - View priority queue with the new order appearing (after scoring)

      Deliver:
      - Final code changes
      - A README.md with setup and run steps

