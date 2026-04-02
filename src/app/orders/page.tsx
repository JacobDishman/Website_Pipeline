import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrdersForCustomer } from "@/lib/shop-queries";

type SearchParams = Promise<{
  success?: string;
  orderId?: string;
}>;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const cookieStore = await cookies();
  const selectedCustomerId = cookieStore.get("selected_customer_id")?.value;
  const parsedCustomerId =
    selectedCustomerId !== undefined
      ? Number.parseInt(selectedCustomerId, 10)
      : Number.NaN;

  if (!Number.isInteger(parsedCustomerId) || parsedCustomerId <= 0) {
    redirect("/select-customer");
  }

  const { success, orderId } = await searchParams;
  const showSuccess = success === "1";
  const orders = getOrdersForCustomer(parsedCustomerId);

  const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Order History</h2>
      {showSuccess ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
          Order placed successfully{orderId ? ` (Order #${orderId})` : ""}.
        </p>
      ) : null}

      {orders.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          No orders found for this customer.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Order ID</th>
                <th className="px-3 py-2 text-left font-medium">Timestamp</th>
                <th className="px-3 py-2 text-left font-medium">Fulfilled</th>
                <th className="px-3 py-2 text-right font-medium">Total Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {orders.map((order) => (
                <tr key={order.orderId}>
                  <td className="px-3 py-2">
                    <Link className="underline" href={`/orders/${order.orderId}`}>
                      {order.orderId}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{order.orderTimestamp}</td>
                  <td className="px-3 py-2">{order.fulfilled ? "Yes" : "No"}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(order.totalValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
