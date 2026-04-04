"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/db";
import { getCustomerById } from "@/lib/shop-queries";

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

  const customer = await getCustomerById(customerId);

  if (!customer) {
    redirect("/select-customer");
  }

  const lineItems = parseLineItems(formData);

  // Validate products exist
  const uniqueProductIds = [...new Set(lineItems.map((item) => item.productId))];
  const { data: products } = await supabase
    .from("products")
    .select("product_id, price")
    .in("product_id", uniqueProductIds);

  if (!products || products.length !== uniqueProductIds.length) {
    redirectWithError("product_not_found");
  }

  // Use the place_order RPC function for transactional insert
  const { data: newOrderId, error } = await supabase.rpc("place_order", {
    p_customer_id: customer.customerId,
    p_items: lineItems,
  });

  if (error || newOrderId == null) {
    console.error("place_order RPC error:", error);
    redirectWithError("order_create_failed");
  }

  redirect(`/orders?success=1&orderId=${newOrderId}`);
}
