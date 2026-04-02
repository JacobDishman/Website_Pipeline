"use server";

import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { redirect } from "next/navigation";
import { ensureOrderPredictionsTable } from "@/lib/db-migrations";

const execFileAsync = promisify(execFile);

function getScoredOrdersCount(stdout: string): number | null {
  const match = stdout.match(/SCORED_ORDERS=(\d+)/);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1], 10);
}

export async function runScoringAction() {
  ensureOrderPredictionsTable();
  const scriptPath = path.join(process.cwd(), "jobs", "run_inference.py");
  const timestamp = new Date().toISOString();

  try {
    const { stdout, stderr } = await execFileAsync("python3", [scriptPath], {
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    });

    const scoredOrders = getScoredOrdersCount(stdout) ?? 0;
    const hasStderr = stderr.trim().length > 0;

    redirect(
      `/scoring?status=success&count=${scoredOrders}&timestamp=${encodeURIComponent(timestamp)}${
        hasStderr ? "&warning=stderr_output" : ""
      }`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scoring failure";
    redirect(
      `/scoring?status=error&timestamp=${encodeURIComponent(timestamp)}&message=${encodeURIComponent(message)}`,
    );
  }
}
