import pg from "pg";

const { Pool, types } = pg;

// Parsers alineados con lo que devolvía Supabase, para no romper a los consumidores:
// - date (1082) como texto 'YYYY-MM-DD': se compara como string y no se desplaza por la zona horaria.
// - int8 (20) y numeric (1700) como número JS: los montos y los ids caben sin pérdida en este negocio.
export const TYPE_PARSERS = {
  1082: (value) => value,
  20: (value) => (value === null ? null : Number(value)),
  1700: (value) => (value === null ? null : parseFloat(value)),
};

for (const [oid, parser] of Object.entries(TYPE_PARSERS)) {
  types.setTypeParser(Number(oid), parser);
}

const globalForPg = globalThis;
let testDb = null;

function getPool() {
  if (globalForPg.__mpbPool) return globalForPg.__mpbPool;
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no está configurada. Revisa /etc/musicapremium/env o tu .env.local.");
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PGPOOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: process.env.PG_APP_NAME || "musicapremium-web",
  });
  pool.on("error", (error) => console.error("[pg] error en conexión inactiva:", error.message));
  globalForPg.__mpbPool = pool;
  return pool;
}

/** Solo para Vitest: redirige query()/withTransaction() a una base PGlite en memoria. */
export function __setTestDb(db) {
  testDb = db;
}

export async function query(text, params) {
  if (testDb) return testDb.query(text, params);
  const started = Date.now();
  const res = await getPool().query(text, params);
  const ms = Date.now() - started;
  if (ms > 500) console.warn(`[pg] consulta lenta ${ms}ms: ${text.slice(0, 120)}`);
  return res;
}

/** Ejecuta un callback dentro de una transacción real. Hace rollback ante cualquier error. */
export async function withTransaction(fn) {
  if (testDb) return testDb.transaction(fn);
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Primera fila o null. */
export async function queryOne(text, params) {
  const res = await query(text, params);
  return res.rows[0] ?? null;
}

export async function closePool() {
  if (globalForPg.__mpbPool) {
    await globalForPg.__mpbPool.end();
    globalForPg.__mpbPool = null;
  }
}
