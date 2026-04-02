"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { execute, queryAll, withTransaction } from "@/lib/db";
import { getCustomerById } from "@/lib/shop-queries";

type ProductRow = {
  product_id: number;
  price: number;
};

type TableInfoRow = {
  name: string;
};

type ParsedLineItem = {
  productId: number;
  quantity: number;
};

function redirectWithError(code: string): never {
  redirect(`/place-order?error=${encodeURIComponent(code)}`);
}

function parseLineItems(formData: FormData): ParsedLineItem[] {
  const rawProductIds = formData.getAll("product_id");
  const rawQuantities = formData.getAll("quantity");
  const rowCount = Math.max(rawProductIds.length, rawQuantities.length);
  const parsedItems: ParsedLineItem[] = [];

  for (let index = 0; index < rowCount; index += 1) {
    const rawProduct = rawProductIds[index];
    const rawQuantity = rawQuantities[index];

    const hasProduct = typeof rawProduct === "string" && rawProduct.trim() !== "";
    const hasQuantity = typeof rawQuantity === "string" && rawQuantity.trim() !== "";

    if (!hasProduct && !hasQuantity) {
      continue;
    }

    if (!hasProduct || !hasQuantity) {
      redirectWithError("incomplete_line_item");
    }

    const productId = Number.parseInt((rawProduct as string).trim(), 10);
    const quantity = Number.parseInt((rawQuantity as string).trim(), 10);

    if (!Number.isInteger(productId) || productId <= 0) {
      redirectWithError("invalid_product");
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      redirectWithError("invalid_quantity");
    }

    parsedItems.push({ productId, quantity });
  }

  if (parsedItems.length === 0) {
    redirectWithError("no_line_items");
  }

  return parsedItems;
}

function buildOrderItemsInsertMetadata() {
  const orderItemsColumns = queryAll<TableInfoRow>(`PRAGMA table_info('order_items')`).map((row) =>
    row.name.toLowerCase(),
  );
  const columnSet = new Set(orderItemsColumns);

  const quantityColumn = columnSet.has("quantity")
    ? "quantity"
    : columnSet.has("qty")
      ? "qty"
      : null;

  if (!quantityColumn) {
    throw new Error("order_items table must include quantity or qty column.");
  }

  const insertColumns = ["order_id", "product_id", quantityColumn];
  const valueMapper: Array<(lineTotal: number, unitPrice: number, item: ParsedLineItem) => number> = [
    (_lineTotal, _unitPrice, item) => item.quantity,
  ];

  if (columnSet.has("unit_price")) {
    insertColumns.push("unit_price");
    valueMapper.push((_lineTotal, unitPrice) => unitPrice);
  } else if (columnSet.has("price")) {
    insertColumns.push("price");
    valueMapper.push((_lineTotal, unitPrice) => unitPrice);
  }

  if (columnSet.has("line_total")) {
    insertColumns.push("line_total");
    valueMapper.push((lineTotal) => lineTotal);
  }

  const placeholders = insertColumns.map(() => "?").join(", ");
  const insertSql = `INSERT INTO order_items (${insertColumns.join(", ")}) VALUES (${placeholders})`;

  return { insertSql, valueMapper };
}

export async function placeOrderAction(formData: FormData) {
  const cookieStore = await cookies();
  const selectedCustomerId = cookieStore.get("selected_customer_id")?.value;
  const customerId =
    selectedCustomerId !== undefined
      ? Number.parseInt(selectedCustomerId, 10)
      : Number.NaN;

  if (!Number.isInteger(customerId) || customerId <= 0) {
    redirect("/select-customer");
  }

  const customer = getCustomerById(customerId);

  if (!customer) {
    redirect("/select-customer");
  }

  const lineItems = parseLineItems(formData);
  const uniqueProductIds = [...new Set(lineItems.map((item) => item.productId))];
  const placeholders = uniqueProductIds.map(() => "?").join(", ");

  const products = queryAll<ProductRow>(
    `SELECT product_id, price
     FROM products
     WHERE product_id IN (${placeholders})`,
    uniqueProductIds,
  );
  const priceByProductId = new Map(products.map((product) => [product.product_id, Number(product.price)]));

  if (priceByProductId.size !== uniqueProductIds.length) {
    redirectWithError("product_not_found");
  }

  let insertSql: string;
  let valueMapper: Array<(lineTotal: number, unitPrice: number, item: ParsedLineItem) => number>;
  try {
    const metadata = buildOrderItemsInsertMetadata();
    insertSql = metadata.insertSql;
    valueMapper = metadata.valueMapper;
  } catch {
    redirectWithError("schema_error");
  }
  const orderInsertSql = `INSERT INTO orders (
      customer_id,
      order_datetime,
      payment_method,
      device_type,
      ip_country,
      promo_used,
      promo_code,
      order_subtotal,
      shipping_fee,
      tax_amount,
      order_total,
      risk_score,
      is_fraud
    ) VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  let newOrderId: number;
  try {
    newOrderId = withTransaction<number>(() => {
      let subtotal = 0;

      for (const item of lineItems) {
        const unitPrice = priceByProductId.get(item.productId);

        if (unitPrice === undefined) {
          throw new Error(`Missing price for product ${item.productId}`);
        }

        subtotal += unitPrice * item.quantity;
      }

      const orderSubtotal = Number(subtotal.toFixed(2));
      const shippingFee = 6.5;
      const taxAmount = Number((orderSubtotal * 0.08).toFixed(2));
      const orderTotal = Number((orderSubtotal + shippingFee + taxAmount).toFixed(2));
      const orderInsert = execute(orderInsertSql, [
        customer.customerId,
        "credit_card",
        "web",
        "US",
        0,
        null,
        orderSubtotal,
        shippingFee,
        taxAmount,
        orderTotal,
        0.1,
        0,
      ]);
      const createdOrderId = Number(orderInsert.lastInsertRowid);

      for (const item of lineItems) {
        const unitPrice = priceByProductId.get(item.productId);

        if (unitPrice === undefined) {
          throw new Error(`Missing price for product ${item.productId}`);
        }

        const lineTotal = Number((unitPrice * item.quantity).toFixed(2));
        const baseValues: number[] = [createdOrderId, item.productId];
        const extraValues = valueMapper.map((mapValue) => mapValue(lineTotal, unitPrice, item));
        const sqlParams = [...baseValues, ...extraValues];

        execute(insertSql, sqlParams);
      }

      return createdOrderId;
    });
  } catch {
    redirectWithError("order_create_failed");
  }

  redirect(`/orders?success=1&orderId=${newOrderId}`);
}
