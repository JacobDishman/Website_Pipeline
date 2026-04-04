import { supabase } from "@/lib/db";

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

function toCustomer(row: { customer_id: number; full_name: string; email: string }): Customer {
  return {
    customerId: row.customer_id,
    fullName: row.full_name,
    email: row.email,
  };
}

export async function getCustomerById(customerId: number): Promise<Customer | undefined> {
  const { data, error } = await supabase
    .from("customers")
    .select("customer_id, full_name, email")
    .eq("customer_id", customerId)
    .single();

  if (error || !data) return undefined;
  return toCustomer(data);
}

export async function searchCustomers(searchTerm: string): Promise<Customer[]> {
  const term = searchTerm.trim();

  let query = supabase
    .from("customers")
    .select("customer_id, full_name, email")
    .order("full_name", { ascending: true })
    .limit(200);

  if (term !== "") {
    query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map(toCustomer);
}

export async function getOrderSummary(customerId: number): Promise<OrderSummary> {
  const { data, error } = await supabase.rpc("get_order_summary", { cid: customerId });

  if (error || !data || data.length === 0) {
    return { orderCount: 0, totalSpend: 0 };
  }

  const row = data[0];
  return {
    orderCount: Number(row.order_count) || 0,
    totalSpend: Number(row.total_spend) || 0,
  };
}

export async function getOrdersForCustomer(customerId: number, limit?: number): Promise<OrderListItem[]> {
  let query = supabase
    .from("orders")
    .select("order_id, order_datetime, order_total, shipments(shipment_id)")
    .eq("customer_id", customerId)
    .order("order_datetime", { ascending: false })
    .order("order_id", { ascending: false });

  if (typeof limit === "number") {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((row: Record<string, unknown>) => ({
    orderId: row.order_id as number,
    orderTimestamp: row.order_datetime as string,
    fulfilled: Array.isArray(row.shipments) && (row.shipments as unknown[]).length > 0,
    totalValue: row.order_total as number,
  }));
}

export async function getOrderForCustomer(customerId: number, orderId: number): Promise<OrderListItem | undefined> {
  const { data, error } = await supabase
    .from("orders")
    .select("order_id, order_datetime, order_total, shipments(shipment_id)")
    .eq("customer_id", customerId)
    .eq("order_id", orderId)
    .single();

  if (error || !data) return undefined;

  return {
    orderId: data.order_id,
    orderTimestamp: data.order_datetime,
    fulfilled: Array.isArray(data.shipments) && data.shipments.length > 0,
    totalValue: data.order_total,
  };
}

export async function getOrderLineItems(orderId: number): Promise<OrderLineItem[]> {
  const { data, error } = await supabase
    .from("order_items")
    .select("quantity, unit_price, line_total, products(product_name)")
    .eq("order_id", orderId)
    .order("order_item_id", { ascending: true });

  if (error || !data) return [];

  return data.map((row: Record<string, unknown>) => {
    const product = row.products as { product_name: string } | null;
    return {
      productName: product?.product_name ?? "Unknown",
      quantity: row.quantity as number,
      unitPrice: row.unit_price as number,
      lineTotal: row.line_total as number,
    };
  });
}
