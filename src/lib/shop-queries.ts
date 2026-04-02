import { queryAll, queryOne } from "@/lib/db";

export type Customer = {
  customerId: number;
  fullName: string;
  email: string;
};

export type OrderSummary = {
  orderCount: number;
  totalSpend: number;
};

export type OrderListItem = {
  orderId: number;
  orderTimestamp: string;
  fulfilled: boolean;
  totalValue: number;
};

export type OrderLineItem = {
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type OrderItemsColumn = {
  name: string;
};

function toCustomer(row: { customer_id: number; full_name: string; email: string }): Customer {
  return {
    customerId: row.customer_id,
    fullName: row.full_name,
    email: row.email,
  };
}

export function getCustomerById(customerId: number): Customer | undefined {
  const row = queryOne<{ customer_id: number; full_name: string; email: string }>(
    `SELECT customer_id, full_name, email
     FROM customers
     WHERE customer_id = ?`,
    [customerId],
  );

  return row ? toCustomer(row) : undefined;
}

export function searchCustomers(searchTerm: string): Customer[] {
  const term = searchTerm.trim();
  const like = `%${term}%`;

  const rows = queryAll<{ customer_id: number; full_name: string; email: string }>(
    `SELECT customer_id, full_name, email
     FROM customers
     WHERE (? = '' OR full_name LIKE ? OR email LIKE ?)
     ORDER BY full_name ASC
     LIMIT 200`,
    [term, like, like],
  );

  return rows.map(toCustomer);
}

export function getOrderSummary(customerId: number): OrderSummary {
  const row = queryOne<{ order_count: number; total_spend: number }>(
    `SELECT
       COUNT(*) AS order_count,
       COALESCE(SUM(order_total), 0) AS total_spend
     FROM orders
     WHERE customer_id = ?`,
    [customerId],
  );

  return {
    orderCount: row?.order_count ?? 0,
    totalSpend: row?.total_spend ?? 0,
  };
}

export function getOrdersForCustomer(customerId: number, limit?: number): OrderListItem[] {
  const limitClause = typeof limit === "number" ? "LIMIT ?" : "";
  const params = typeof limit === "number" ? [customerId, limit] : [customerId];

  return queryAll<{
    order_id: number;
    order_datetime: string;
    order_total: number;
    has_shipment: number;
  }>(
    `SELECT
       o.order_id,
       o.order_datetime,
       o.order_total,
       CASE WHEN s.shipment_id IS NULL THEN 0 ELSE 1 END AS has_shipment
     FROM orders o
     LEFT JOIN shipments s ON s.order_id = o.order_id
     WHERE o.customer_id = ?
     ORDER BY o.order_datetime DESC, o.order_id DESC
     ${limitClause}`,
    params,
  ).map((row) => ({
    orderId: row.order_id,
    orderTimestamp: row.order_datetime,
    fulfilled: row.has_shipment === 1,
    totalValue: row.order_total,
  }));
}

export function getOrderForCustomer(customerId: number, orderId: number): OrderListItem | undefined {
  const row = queryOne<{
    order_id: number;
    order_datetime: string;
    order_total: number;
    has_shipment: number;
  }>(
    `SELECT
       o.order_id,
       o.order_datetime,
       o.order_total,
       CASE WHEN s.shipment_id IS NULL THEN 0 ELSE 1 END AS has_shipment
     FROM orders o
     LEFT JOIN shipments s ON s.order_id = o.order_id
     WHERE o.customer_id = ? AND o.order_id = ?`,
    [customerId, orderId],
  );

  if (!row) {
    return undefined;
  }

  return {
    orderId: row.order_id,
    orderTimestamp: row.order_datetime,
    fulfilled: row.has_shipment === 1,
    totalValue: row.order_total,
  };
}

export function getOrderLineItems(orderId: number): OrderLineItem[] {
  const columns = queryAll<OrderItemsColumn>(`PRAGMA table_info('order_items')`).map((col) =>
    col.name.toLowerCase(),
  );
  const hasQty = columns.includes("qty");
  const hasQuantity = columns.includes("quantity");
  const hasUnitPrice = columns.includes("unit_price");
  const hasPrice = columns.includes("price");
  const hasLineTotal = columns.includes("line_total");

  const quantityExpr = hasQuantity ? "oi.quantity" : hasQty ? "oi.qty" : "1";
  const unitPriceExpr = hasUnitPrice
    ? "oi.unit_price"
    : hasPrice
      ? "oi.price"
      : "p.price";
  const lineTotalExpr = hasLineTotal ? "oi.line_total" : `(${quantityExpr} * ${unitPriceExpr})`;

  return queryAll<{
    product_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>(
    `SELECT
       p.product_name,
       ${quantityExpr} AS quantity,
       ${unitPriceExpr} AS unit_price,
       ${lineTotalExpr} AS line_total
     FROM order_items oi
     JOIN products p ON p.product_id = oi.product_id
     WHERE oi.order_id = ?
     ORDER BY oi.order_item_id ASC`,
    [orderId],
  ).map((row) => ({
    productName: row.product_name,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    lineTotal: row.line_total,
  }));
}
