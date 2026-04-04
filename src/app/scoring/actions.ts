"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

export async function runScoringAction() {
  const timestamp = new Date().toISOString();

  try {
    const headersList = await headers();
    const host = headersList.get("host") ?? "localhost:3000";
    const protocol = host.startsWith("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    const response = await fetch(`${baseUrl}/api/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const result = await response.json();

    if (!response.ok) {
      redirect(
        `/scoring?status=error&timestamp=${encodeURIComponent(timestamp)}&message=${encodeURIComponent(
          result.error ?? "Scoring request failed",
        )}`,
      );
    }

    const scoredOrders = result.scored_orders ?? 0;

    redirect(
      `/scoring?status=success&count=${scoredOrders}&timestamp=${encodeURIComponent(timestamp)}`,
    );
  } catch (error) {
    // Re-throw Next.js redirect errors
    if (error instanceof Error && error.message === "NEXT_REDIRECT") {
      throw error;
    }
    // Check for redirect digest
    const err = error as { digest?: string };
    if (typeof err.digest === "string" && err.digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "Unknown scoring failure";
    redirect(
      `/scoring?status=error&timestamp=${encodeURIComponent(timestamp)}&message=${encodeURIComponent(message)}`,
    );
  }
}
