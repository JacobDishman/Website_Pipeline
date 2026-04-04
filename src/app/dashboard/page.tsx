import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCustomerById, getOrderSummary, getOrdersForCustomer } from "@/lib/shop-queries";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export default async function DashboardPage() {
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

  const summary = await getOrderSummary(parsedCustomerId);
  const recentOrders = await getOrdersForCustomer(parsedCustomerId, 5);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold">Customer Dashboard</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Summary for {customer.fullName} ({customer.email})
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Total Orders</h3>
          <p className="mt-2 text-2xl font-semibold">{summary.orderCount}</p>
        </article>
        <article className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Total Spend</h3>
          <p className="mt-2 text-2xl font-semibold">{formatCurrency(summary.totalSpend)}</p>
        </article>
      </div>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Most Recent Orders</h3>
        {recentOrders.length === 0 ? (
          <p className="rounded-md border border-zinc-200 p-3 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
            This customer has no orders yet.
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
                {recentOrders.map((order) => (
                  <tr key={order.orderId}>
                    <td className="px-3 py-2">{order.orderId}</td>
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
    </section>
  );
}
