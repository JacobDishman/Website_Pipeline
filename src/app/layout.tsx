import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { getCustomerById } from "@/lib/shop-queries";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shop Operations Dashboard",
  description: "Student project app using Next.js and SQLite",
};

const navigationLinks = [
  { href: "/select-customer", label: "Select Customer" },
  { href: "/dashboard", label: "Customer Dashboard" },
  { href: "/place-order", label: "Place Order" },
  { href: "/orders", label: "Order History" },
  { href: "/warehouse/priority", label: "Warehouse Priority Queue" },
  { href: "/scoring", label: "Run Scoring" },
];

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const selectedCustomerId = cookieStore.get("selected_customer_id")?.value;
  const parsedCustomerId =
    selectedCustomerId !== undefined
      ? Number.parseInt(selectedCustomerId, 10)
      : Number.NaN;

  const selectedCustomer =
    Number.isInteger(parsedCustomerId) && parsedCustomerId > 0
      ? getCustomerById(parsedCustomerId)
      : undefined;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 py-6 sm:px-6">
          <header className="mb-6 space-y-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h1 className="text-xl font-semibold">Shop Operations Dashboard</h1>
            <nav aria-label="Main navigation">
              <ul className="flex flex-wrap gap-2">
                {navigationLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="inline-flex rounded-md border border-zinc-300 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </header>
          {selectedCustomer ? (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
              Selected customer:{" "}
              <span className="font-medium">{selectedCustomer.fullName}</span> (
              {selectedCustomer.email}) - ID {selectedCustomer.customerId}
            </div>
          ) : null}
          <main className="flex-1 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
