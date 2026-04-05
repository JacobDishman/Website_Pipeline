"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

type ProductRow = {
  product_id: number;
  product_name: string;
  price: number;
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
    >
      {pending ? "Placing Order..." : "Place Order"}
    </button>
  );
}

export default function OrderForm({
  products,
  action,
}: {
  products: ProductRow[];
  action: (formData: FormData) => void;
}) {
  const [rowCount, setRowCount] = useState(1);

  return (
    <form action={action} className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Product</th>
              <th className="px-3 py-2 text-left font-medium">Quantity</th>
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {Array.from({ length: rowCount }).map((_, index) => (
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
                <td className="px-3 py-2">
                  {rowCount > 1 ? (
                    <button
                      type="button"
                      onClick={() => setRowCount((c) => c - 1)}
                      className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                      aria-label="Remove row"
                    >
                      Remove
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton />
        <button
          type="button"
          onClick={() => setRowCount((c) => c + 1)}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Add Line Item
        </button>
      </div>
    </form>
  );
}
