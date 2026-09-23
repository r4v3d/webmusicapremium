// Base PostgreSQL real (compilada a WASM) para Vitest. Aplica las mismas
// migraciones de db/migrations y conecta src/lib/pg.js a esta instancia.
import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { TYPE_PARSERS, __setTestDb } from "../lib/pg";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "db/migrations");

function adapt(runner) {
  return {
    async query(text, params) {
      const res = await runner.query(text, params ?? []);
      return { rows: res.rows, rowCount: res.rows.length || res.affectedRows || 0 };
    },
  };
}

export async function applyMigrations(db) {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Falló ${file}: ${error.message}`);
    }
  }
}

export async function createTestDb() {
  const db = new PGlite({ parsers: TYPE_PARSERS });
  await applyMigrations(db);
  const adapter = {
    ...adapt(db),
    transaction: (fn) => db.transaction((tx) => fn(adapt(tx))),
    raw: db,
    async reset() {
      const { rows } = await db.query(
        `select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations'`
      );
      if (rows.length) {
        await db.exec(`truncate ${rows.map((r) => `"${r.tablename}"`).join(", ")} restart identity cascade`);
      }
    },
    async close() {
      __setTestDb(null);
      await db.close();
    },
  };
  __setTestDb(adapter);
  return adapter;
}
