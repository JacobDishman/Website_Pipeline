import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/db";
import { getCustomerById } from "@/lib/shop-queries";
import { placeOrderAction } from "./actions";
import OrderForm from "./order-form";

type SearchParams = Promise<{
  error?: string;
}>;

const ERROR_MESSAGES: Record<string, string> = {
  incomplete_line_item: "Each filled row must include both a product and quantity.",
  invalid_product: "One or more selected products are invalid.",
  invalid_quantity: "Quantity must be a positive whole number.",
  no_line_items: "Add at least one line item before placing the order.",
  product_not_found: "A selected product could not be found. Please refresh and try again.",
  schema_error: "Required order table columns are missing. Check database schema.",
  order_create_failed: "Could not create order. Please try again.",
};

export default async function PlaceOrderPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error } = await searchParams;
  const cookieStore = await cookies();
  const selectedCustomerId = cookieStore.get("selected_customer_id")?.value;
  const parsedCustomerId =
    selectedCustomerId !== undefined
      ? Number.parseInt(selectedCustomerId, 10)
      : Number.NaN;

  if (!Number.isInteger(parsedCustomerId) || parsedCustomerId <= 0) {
    redirect("/select-customer");
  }

  const customer = await getCustomerById(parsedCustomerId);

  if (!customer) {
    redirect("/select-customer");
  }

  const { data: products } = await supabase
    .from("products")
    .select("product_id, product_name, price")
    .order("product_name", { ascending: true });

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold">Place Order</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Creating order for {customer.fullName} ({customer.email})
        </p>
      </header>

      {error && ERROR_MESSAGES[error] ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {ERROR_MESSAGES[error]}
        </p>
      ) : null}

      <OrderForm products={products ?? []} action={placeOrderAction} />
    </section>
  );
}
