-- ============================================================
-- Supabase Setup SQL — Run this in the Supabase SQL Editor
-- Creates all tables, disables RLS, and adds helper functions
-- ============================================================

-- 1. TABLES
-- ---------

CREATE TABLE IF NOT EXISTS customers (
  customer_id    SERIAL PRIMARY KEY,
  full_name      TEXT NOT NULL,
  email          TEXT NOT NULL,
  gender         TEXT NOT NULL,
  birthdate      TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  city           TEXT,
  state          TEXT,
  zip_code       TEXT,
  customer_segment TEXT,
  loyalty_tier   TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
  product_id  SERIAL PRIMARY KEY,
  sku         TEXT NOT NULL,
  product_name TEXT NOT NULL,
  category    TEXT NOT NULL,
  price       REAL NOT NULL,
  cost        REAL NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
  order_id       SERIAL PRIMARY KEY,
  customer_id    INTEGER NOT NULL REFERENCES customers(customer_id),
  order_datetime TEXT NOT NULL,
  billing_zip    TEXT,
  shipping_zip   TEXT,
  shipping_state TEXT,
  payment_method TEXT NOT NULL,
  device_type    TEXT NOT NULL,
  ip_country     TEXT NOT NULL,
  promo_used     INTEGER NOT NULL DEFAULT 0,
  promo_code     TEXT,
  order_subtotal REAL NOT NULL,
  shipping_fee   REAL NOT NULL,
  tax_amount     REAL NOT NULL,
  order_total    REAL NOT NULL,
  risk_score     REAL NOT NULL,
  is_fraud       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_items (
  order_item_id SERIAL PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(order_id),
  product_id    INTEGER NOT NULL REFERENCES products(product_id),
  quantity      INTEGER NOT NULL,
  unit_price    REAL NOT NULL,
  line_total    REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS shipments (
  shipment_id     SERIAL PRIMARY KEY,
  order_id        INTEGER NOT NULL REFERENCES orders(order_id),
  ship_datetime   TEXT NOT NULL,
  carrier         TEXT NOT NULL,
  shipping_method TEXT NOT NULL,
  distance_band   TEXT NOT NULL,
  promised_days   INTEGER NOT NULL,
  actual_days     INTEGER NOT NULL,
  late_delivery   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_reviews (
  review_id       SERIAL PRIMARY KEY,
  customer_id     INTEGER NOT NULL REFERENCES customers(customer_id),
  product_id      INTEGER NOT NULL REFERENCES products(product_id),
  rating          INTEGER NOT NULL,
  review_datetime TEXT NOT NULL,
  review_text     TEXT
);

CREATE TABLE IF NOT EXISTS order_predictions (
  order_id                  INTEGER PRIMARY KEY REFERENCES orders(order_id),
  late_delivery_probability REAL NOT NULL,
  predicted_late_delivery   INTEGER NOT NULL,
  prediction_timestamp      TEXT NOT NULL
);

-- 2. DISABLE ROW LEVEL SECURITY (no auth in this app)
-- ----------------------------------------------------

ALTER TABLE customers        DISABLE ROW LEVEL SECURITY;
ALTER TABLE products         DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders           DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items      DISABLE ROW LEVEL SECURITY;
ALTER TABLE shipments        DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_reviews  DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_predictions DISABLE ROW LEVEL SECURITY;

-- 3. HELPER FUNCTIONS
-- -------------------

-- get_order_summary: aggregate order stats for a customer
CREATE OR REPLACE FUNCTION get_order_summary(cid INTEGER)
RETURNS TABLE(order_count BIGINT, total_spend DOUBLE PRECISION) AS $$
  SELECT COUNT(*)::BIGINT, COALESCE(SUM(order_total), 0)::DOUBLE PRECISION
  FROM orders
  WHERE customer_id = cid;
$$ LANGUAGE sql STABLE;

-- get_priority_queue: late delivery priority queue
CREATE OR REPLACE FUNCTION get_priority_queue()
RETURNS TABLE(
  order_id INTEGER,
  order_timestamp TEXT,
  total_value REAL,
  customer_id INTEGER,
  customer_name TEXT,
  late_delivery_probability REAL,
  predicted_late_delivery INTEGER,
  prediction_timestamp TEXT
) AS $$
  SELECT
    o.order_id,
    o.order_datetime AS order_timestamp,
    o.order_total AS total_value,
    c.customer_id,
    c.full_name AS customer_name,
    p.late_delivery_probability,
    p.predicted_late_delivery,
    p.prediction_timestamp
  FROM orders o
  JOIN customers c ON c.customer_id = o.customer_id
  JOIN order_predictions p ON p.order_id = o.order_id
  LEFT JOIN shipments s ON s.order_id = o.order_id
  WHERE s.shipment_id IS NULL
  ORDER BY p.late_delivery_probability DESC, o.order_datetime ASC
  LIMIT 50;
$$ LANGUAGE sql STABLE;

-- place_order: transactional order creation
CREATE OR REPLACE FUNCTION place_order(
  p_customer_id INTEGER,
  p_items JSONB
) RETURNS INTEGER AS $$
DECLARE
  v_subtotal DOUBLE PRECISION := 0;
  v_shipping DOUBLE PRECISION := 6.50;
  v_tax DOUBLE PRECISION;
  v_total DOUBLE PRECISION;
  v_order_id INTEGER;
  item JSONB;
  v_unit_price DOUBLE PRECISION;
  v_line_total DOUBLE PRECISION;
  v_qty INTEGER;
BEGIN
  -- Calculate subtotal
  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT price INTO v_unit_price FROM products WHERE product_id = (item->>'productId')::INTEGER;
    v_qty := (item->>'quantity')::INTEGER;
    v_subtotal := v_subtotal + (v_unit_price * v_qty);
  END LOOP;

  v_subtotal := ROUND(v_subtotal::NUMERIC, 2)::DOUBLE PRECISION;
  v_tax := ROUND((v_subtotal * 0.08)::NUMERIC, 2)::DOUBLE PRECISION;
  v_total := ROUND((v_subtotal + v_shipping + v_tax)::NUMERIC, 2)::DOUBLE PRECISION;

  INSERT INTO orders (
    customer_id, order_datetime, payment_method, device_type,
    ip_country, promo_used, promo_code, order_subtotal, shipping_fee,
    tax_amount, order_total, risk_score, is_fraud
  ) VALUES (
    p_customer_id, NOW()::TEXT, 'credit_card', 'web',
    'US', 0, NULL, v_subtotal, v_shipping,
    v_tax, v_total, 0.1, 0
  ) RETURNING orders.order_id INTO v_order_id;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT price INTO v_unit_price FROM products WHERE product_id = (item->>'productId')::INTEGER;
    v_qty := (item->>'quantity')::INTEGER;
    v_line_total := ROUND((v_unit_price * v_qty)::NUMERIC, 2)::DOUBLE PRECISION;

    INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
    VALUES (v_order_id, (item->>'productId')::INTEGER, v_qty, v_unit_price, v_line_total);
  END LOOP;

  RETURN v_order_id;
END;
$$ LANGUAGE plpgsql;

-- get_schema_info: replacement for SQLite PRAGMA table_info
CREATE OR REPLACE FUNCTION get_schema_info()
RETURNS TABLE(table_name TEXT, column_name TEXT, data_type TEXT) AS $$
  SELECT
    c.table_name::TEXT,
    c.column_name::TEXT,
    c.data_type::TEXT
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
  ORDER BY c.table_name, c.ordinal_position;
$$ LANGUAGE sql STABLE;
