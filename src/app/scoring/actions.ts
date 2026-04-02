"use server";

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
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
  const modelPath = path.join(process.cwd(), "jobs", "model", "model.pkl");
  const timestamp = new Date().toISOString();

  try {
    try {
      await fs.access(modelPath);
    } catch {
      redirect(
        `/scoring?status=error&timestamp=${encodeURIComponent(timestamp)}&message=${encodeURIComponent(
          `Trained model not found at ${modelPath}. Run: python3 jobs/train.py`,
        )}`,
      );
    }

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
    const err = error as unknown as {
      message?: string;
      stdout?: string | Buffer;
      stderr?: string | Buffer;
    };
    const stderr =
      typeof err.stderr === "string"
        ? err.stderr
        : Buffer.isBuffer(err.stderr)
          ? err.stderr.toString("utf8")
          : "";
    const messageBase =
      typeof err.message === "string" && err.message.trim().length > 0
        ? err.message
        : "Unknown scoring failure";
    const message =
      stderr.trim().length > 0 ? `${messageBase}\n\nstderr:\n${stderr.trim()}` : messageBase;

    redirect(
      `/scoring?status=error&timestamp=${encodeURIComponent(timestamp)}&message=${encodeURIComponent(message)}`,
    );
  }
}
