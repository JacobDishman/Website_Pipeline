import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { queryAll } from "@/lib/db";
import { getCustomerById } from "@/lib/shop-queries";
import { placeOrderAction } from "./actions";

type SearchParams = Promise<{
  error?: string;
}>;

type ProductRow = {
  product_id: number;
  product_name: string;
  price: number;
};

const ERROR_MESSAGES: Record<string, string> = {
  incomplete_line_item: "Each filled row must include both a product and quantity.",
  invalid_product: "One or more selected products are invalid.",
  invalid_quantity: "Quantity must be a positive whole number.",
  no_line_items: "Add at least one line item before placing the order.",
  product_not_found: "A selected product could not be found. Please refresh and try again.",
  schema_error: "Required order table columns are missing. Check database schema.",
  order_create_failed: "Could not create order. Please try again.",
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

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

  const customer = getCustomerById(parsedCustomerId);

  if (!customer) {
    redirect("/select-customer");
  }

  const products = queryAll<ProductRow>(
    `SELECT product_id, product_name, price
     FROM products
     ORDER BY product_name ASC`,
  );

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

      <form action={placeOrderAction} className="space-y-4">
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Product</th>
                <th className="px-3 py-2 text-left font-medium">Quantity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {Array.from({ length: 5 }).map((_, index) => (
                <tr key={index}>
                  <td className="px-3 py-2">
                    <select
                      name="product_id"
                      defaultValue=""
                      className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      <option value="">Select a product</option>
                      {products.map((product) => (
                        <option key={product.product_id} value={product.product_id}>
                          {product.product_name} ({formatCurrency(Number(product.price))})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      name="quantity"
                      min={1}
                      step={1}
                      placeholder="1"
                      className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Place Order
        </button>
      </form>
    </section>
  );
}
