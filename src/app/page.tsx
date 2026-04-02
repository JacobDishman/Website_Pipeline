import Link from "next/link";
import { queryOne } from "@/lib/db";

type DbHealthRow = {
  ok: number;
};

export default async function Home() {
  const dbHealth = queryOne<DbHealthRow>("SELECT 1 AS ok");

  return (
    <section className="space-y-4 font-sans">
      <h2 className="text-2xl font-semibold">Welcome</h2>
      <p className="text-zinc-700 dark:text-zinc-300">
        This app supports customer selection, order placement, order history,
        warehouse priority review, and scoring workflows.
      </p>
      <p className="text-zinc-700 dark:text-zinc-300">
        Database smoke test:{" "}
        <span className="font-medium">
          {dbHealth?.ok === 1 ? "connected (SELECT 1 succeeded)" : "unavailable"}
        </span>
      </p>
      <div className="flex flex-wrap gap-3 pt-2">
        <Link
          href="/select-customer"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Get Started: Select Customer
        </Link>
      </div>
    </section>
  );
}
