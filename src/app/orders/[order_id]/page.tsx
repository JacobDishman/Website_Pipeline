import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getOrderForCustomer, getOrderLineItems } from "@/lib/shop-queries";

type Params = Promise<{
  order_id: string;
}>;

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export default async function OrderDetailsPage({
  params,
}: {
  params: Params;
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

  const { order_id: orderIdParam } = await params;
  const orderId = Number.parseInt(orderIdParam, 10);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    redirect("/orders");
  }

  const order = await getOrderForCustomer(parsedCustomerId, orderId);
  if (!order) {
    redirect("/orders");
  }

  const items = await getOrderLineItems(orderId);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold">Order #{order.orderId}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {order.orderTimestamp} · Fulfilled: {order.fulfilled ? "Yes" : "No"} · Total:{" "}
          {formatCurrency(order.totalValue)}
        </p>
        <Link href="/orders" className="text-sm underline">
          Back to Order History
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">No line items found for this order.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Product</th>
                <th className="px-3 py-2 text-left font-medium">Quantity</th>
                <th className="px-3 py-2 text-right font-medium">Unit Price</th>
                <th className="px-3 py-2 text-right font-medium">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {items.map((item) => (
                <tr key={`${item.productName}-${item.quantity}-${item.lineTotal}`}>
                  <td className="px-3 py-2">{item.productName}</td>
                  <td className="px-3 py-2">{item.quantity}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
