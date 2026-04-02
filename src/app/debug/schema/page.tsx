import { queryAll } from "@/lib/db";

type TableRow = {
  name: string;
};

type ColumnRow = {
  name: string;
  type: string;
};

function escapeSqlString(value: string): string {
  return value.replaceAll("'", "''");
}

function getSchemaSnapshot() {
  const tables = queryAll<TableRow>(
    `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `,
  );

  return tables.map((table) => {
    const safeTableName = escapeSqlString(table.name);
    const columns = queryAll<ColumnRow>(
      `PRAGMA table_info('${safeTableName}')`,
    ).map((column) => ({
      name: column.name,
      type: column.type || "(unspecified)",
    }));

    return {
      tableName: table.name,
      columns,
    };
  });
}

export default function DebugSchemaPage() {
  let schema: ReturnType<typeof getSchemaSnapshot> = [];
  let errorMessage: string | null = null;

  try {
    schema = getSchemaSnapshot();
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Unknown error";
  }

  if (errorMessage) {
    return (
      <section className="space-y-2">
        <h2 className="text-2xl font-semibold">Database Schema Debug</h2>
        <p className="text-zinc-700 dark:text-zinc-300">
          Unable to read schema from <code>shop.db</code>.
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
          No tables were found in <code>shop.db</code>.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold">Database Schema Debug</h2>
        <p className="text-zinc-700 dark:text-zinc-300">
          Table names and column types from <code>shop.db</code>.
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
