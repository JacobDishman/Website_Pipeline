import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCustomerById, searchCustomers } from "@/lib/shop-queries";

type SearchParams = Promise<{
  q?: string;
}>;

async function selectCustomerAction(formData: FormData) {
  "use server";

  const rawCustomerId = formData.get("customer_id");
  const customerId =
    typeof rawCustomerId === "string" ? Number.parseInt(rawCustomerId, 10) : Number.NaN;

  if (!Number.isInteger(customerId) || customerId <= 0) {
    return;
  }

  const customer = getCustomerById(customerId);

  if (!customer) {
    return;
  }

  const cookieStore = await cookies();
  cookieStore.set("selected_customer_id", String(customer.customerId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/dashboard");
}

export default async function SelectCustomerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { q } = await searchParams;
  const searchTerm = (q ?? "").trim();

  const customers = searchCustomers(searchTerm);

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold">Select Customer</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Choose a customer to continue. Your selection is saved in a cookie.
        </p>
      </header>

      <form action="/select-customer" method="get" className="flex gap-2">
        <label htmlFor="q" className="sr-only">
          Search customers
        </label>
        <input
          id="q"
          name="q"
          defaultValue={searchTerm}
          placeholder="Search by name or email"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <button
          type="submit"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Search
        </button>
      </form>

      <form action={selectCustomerAction} className="space-y-3">
        <ul className="max-h-[28rem] divide-y divide-zinc-200 overflow-auto rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {customers.map((customer) => (
            <li key={customer.customerId} className="p-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="customer_id"
                  value={customer.customerId}
                  required
                  className="mt-1"
                />
                <span className="text-sm">
                  <span className="block font-medium">
                    {customer.fullName}
                  </span>
                  <span className="block text-zinc-600 dark:text-zinc-400">{customer.email}</span>
                  <span className="block text-xs text-zinc-500 dark:text-zinc-500">
                    ID: {customer.customerId}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        {customers.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">No customers found.</p>
        ) : null}

        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Continue to Dashboard
        </button>
      </form>
    </section>
  );
}
