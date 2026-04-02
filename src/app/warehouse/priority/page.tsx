import { queryAll } from "@/lib/db";
import { ensureOrderPredictionsTable } from "@/lib/db-migrations";

type PriorityRow = {
  order_id: number;
  order_timestamp: string;
  total_value: number;
  customer_id: number;
  customer_name: string;
  late_delivery_probability: number;
  predicted_late_delivery: number;
  prediction_timestamp: string;
};

export default function WarehousePriorityPage() {
  ensureOrderPredictionsTable();

  const queue = queryAll<PriorityRow>(
    `SELECT
      o.order_id,
      o.order_datetime AS order_timestamp,
      o.order_total AS total_value,
      c.customer_id,
      c.full_name AS customer_name,
      p.late_delivery_probability,
      p.predicted_late_delivery,
      p.prediction_timestamp
    FROM orders o
    JOIN customers c ON c.customer_id = o.customer_id
    JOIN order_predictions p ON p.order_id = o.order_id
    LEFT JOIN shipments s ON s.order_id = o.order_id
    WHERE s.shipment_id IS NULL
    ORDER BY p.late_delivery_probability DESC, o.order_datetime ASC
    LIMIT 50;`,
  );

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Late Delivery Priority Queue</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        This queue prioritizes warehouse attention by surfacing unfulfilled orders with the highest
        predicted late-delivery probability. Run scoring to refresh predictions.
      </p>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Order ID</th>
              <th className="px-3 py-2 text-left font-medium">Order Timestamp</th>
              <th className="px-3 py-2 text-right font-medium">Total Value</th>
              <th className="px-3 py-2 text-left font-medium">Customer</th>
              <th className="px-3 py-2 text-right font-medium">Late Delivery Probability</th>
              <th className="px-3 py-2 text-left font-medium">Predicted Late</th>
              <th className="px-3 py-2 text-left font-medium">Prediction Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {queue.map((row) => (
              <tr key={row.order_id}>
                <td className="px-3 py-2">{row.order_id}</td>
                <td className="px-3 py-2">{row.order_timestamp}</td>
                <td className="px-3 py-2 text-right">{Number(row.total_value).toFixed(2)}</td>
                <td className="px-3 py-2">
                  {row.customer_name} (#{row.customer_id})
                </td>
                <td className="px-3 py-2 text-right">
                  {Number(row.late_delivery_probability).toFixed(3)}
                </td>
                <td className="px-3 py-2">{row.predicted_late_delivery ? "Yes" : "No"}</td>
                <td className="px-3 py-2">{row.prediction_timestamp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
