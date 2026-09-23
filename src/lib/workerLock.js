// Cerrojo de líder para el worker (§16): si algún día corren dos, solo uno
// trabaja por ciclo. pg_try_advisory_lock es por conexión, así que se toma y
// se suelta sobre una conexión dedicada, aparte del pool de la aplicación.
import pg from "pg";
import { closePool as closeAppPool } from "./pg.js";

const LOCK_KEY = "musicapremium:worker";
let lockPool = null;

function getLockPool() {
  lockPool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, application_name: "musicapremium-worker-lock" });
  return lockPool;
}

/** Ejecuta fn solo si este proceso obtiene el cerrojo. Devuelve false si otro lo tiene. */
export async function withLeaderLock(fn) {
  const client = await getLockPool().connect();
  try {
    const res = await client.query("select pg_try_advisory_lock(hashtext($1)) as ok", [LOCK_KEY]);
    if (!res.rows[0].ok) return false;
    try {
      await fn();
    } finally {
      await client.query("select pg_advisory_unlock(hashtext($1))", [LOCK_KEY]).catch(() => {});
    }
    return true;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await closeAppPool().catch(() => {});
  if (lockPool) await lockPool.end().catch(() => {});
  lockPool = null;
}
