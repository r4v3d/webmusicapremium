// npm run db:migrate  (§5.6)
//
// Aplica en orden los archivos de db/migrations que aún no estén en
// schema_migrations, cada uno en su propia transacción. deploy.sh lo ejecuta
// con DATABASE_URL = DATABASE_MIGRATION_URL (rol mpb_migrator), nunca con el
// rol de la aplicación.
//
//   npm run db:migrate            aplica lo pendiente
//   npm run db:migrate -- --status  lista aplicadas y pendientes sin tocar nada
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const DIR = path.resolve("db/migrations");
const statusOnly = process.argv.includes("--status");
const connectionString = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error("Falta DATABASE_URL (o DATABASE_MIGRATION_URL).");
  process.exit(1);
}

const client = new pg.Client({ connectionString, application_name: "musicapremium-migrate" });
await client.connect();

try {
  await client.query(`
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )`);

  // Dos despliegues simultáneos no deben migrar a la vez.
  await client.query("select pg_advisory_lock(hashtext('musicapremium:migrate'))");

  const files = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await client.query("select name from schema_migrations");
  const applied = new Set(rows.map((r) => r.name));
  const pending = files.filter((f) => !applied.has(f));

  if (statusOnly) {
    for (const f of files) console.log(`${applied.has(f) ? "✓" : "·"} ${f}`);
    console.log(pending.length ? `${pending.length} pendiente(s).` : "Migraciones al día.");
  } else {
    for (const file of pending) {
      const sql = await readFile(path.join(DIR, file), "utf8");
      console.log(`→ aplicando ${file}`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations(name) values ($1)", [file]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw new Error(`Falló ${file}: ${error.message}`);
      }
    }
    console.log(pending.length ? `${pending.length} migración(es) aplicada(s).` : "Migraciones al día.");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
