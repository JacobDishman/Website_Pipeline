import { runScoringAction } from "./actions";
import ScoringButton from "./scoring-button";

type SearchParams = Promise<{
  status?: string;
  count?: string;
  timestamp?: string;
  message?: string;
  warning?: string;
}>;

export default async function ScoringPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const scoredCount =
    typeof params.count === "string" ? Number.parseInt(params.count, 10) : undefined;

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Run Scoring</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Run the inference job to refresh order risk scores in the database.
      </p>

      <form action={runScoringAction}>
        <ScoringButton />
      </form>

      {params.status === "success" ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
          <p>Scoring completed successfully.</p>
          <p>Orders scored: {Number.isFinite(scoredCount) ? scoredCount : "Unknown"}</p>
          <p>Timestamp: {params.timestamp ?? "Unknown"}</p>
          {params.warning === "stderr_output" ? <p>Warning: script wrote to stderr.</p> : null}
        </div>
      ) : null}

      {params.status === "error" ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          <p>Scoring failed.</p>
          <p>Timestamp: {params.timestamp ?? "Unknown"}</p>
          <p className="break-all">Error: {params.message ?? "Unknown error"}</p>
        </div>
      ) : null}
    </section>
  );
}
