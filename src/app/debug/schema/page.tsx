import { supabase } from "@/lib/db";

type SchemaRow = {
  table_name: string;
  column_name: string;
  data_type: string;
};

export default async function DebugSchemaPage() {
  let errorMessage: string | null = null;
  let schema: { tableName: string; columns: { name: string; type: string }[] }[] = [];

  try {
    const { data, error } = await supabase.rpc("get_schema_info");
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as SchemaRow[];
    const grouped = new Map<string, { name: string; type: string }[]>();
    for (const row of rows) {
      if (!grouped.has(row.table_name)) {
        grouped.set(row.table_name, []);
      }
      grouped.get(row.table_name)!.push({ name: row.column_name, type: row.data_type });
    }

    schema = Array.from(grouped.entries()).map(([tableName, columns]) => ({
      tableName,
      columns,
    }));
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Unknown error";
  }

  if (errorMessage) {
    return (
      <section className="space-y-2">
        <h2 className="text-2xl font-semibold">Database Schema Debug</h2>
        <p className="text-zinc-700 dark:text-zinc-300">
          Unable to read schema from Supabase.
        </p>
        <pre className="overflow-x-auto rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {errorMessage}
        </pre>
      </section>
    );
  }

  if (schema.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="text-2xl font-semibold">Database Schema Debug</h2>
        <p className="text-zinc-700 dark:text-zinc-300">
          No tables were found in the database.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold">Database Schema Debug</h2>
        <p className="text-zinc-700 dark:text-zinc-300">
          Table names and column types from Supabase PostgreSQL.
        </p>
      </div>

      {schema.map((table) => (
        <article
          key={table.tableName}
          className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
        >
          <header className="border-b border-zinc-200 bg-zinc-100 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="font-medium">{table.tableName}</h3>
          </header>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="px-4 py-2 text-left font-medium">Column</th>
                <th className="px-4 py-2 text-left font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {table.columns.map((column) => (
                <tr
                  key={`${table.tableName}-${column.name}`}
                  className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-900"
                >
                  <td className="px-4 py-2">{column.name}</td>
                  <td className="px-4 py-2">{column.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ))}
    </section>
  );
}
