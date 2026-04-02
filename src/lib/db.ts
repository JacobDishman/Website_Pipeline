import "server-only";

import path from "node:path";
import Database from "better-sqlite3";

const resolvedDbPath = path.resolve(
  process.cwd(),
  process.env.SHOP_DB_PATH ?? "shop.db",
);

const db = new Database(resolvedDbPath);

type SqlParams = readonly unknown[];

export function queryAll<T>(sql: string, params: SqlParams = []): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function queryOne<T>(sql: string, params: SqlParams = []): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function execute(
  sql: string,
  params: SqlParams = [],
): { changes: number; lastInsertRowid: number | bigint } {
  const result = db.prepare(sql).run(...params);
  return {
    changes: result.changes,
    lastInsertRowid: result.lastInsertRowid,
  };
}

export function withTransaction<T>(callback: () => T): T {
  const transaction = db.transaction(callback);
  return transaction();
}
