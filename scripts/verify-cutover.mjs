// Fase 1 · paso 7 (§5): verificación de corte. Compara Supabase con el VPS
// antes de apagar Supabase. Solo lee; no modifica ninguna de las dos bases.
//
//   SOURCE_DATABASE_URL='postgresql://...supabase...' \
//   TARGET_DATABASE_URL='postgres://mpb_app:...@127.0.0.1:5432/musicapremium' \
//     node scripts/verify-cutover.mjs
import pg from "pg";

const TABLES = [
  "customers", "customer_contacts", "customer_auth", "platform_accounts", "account_slots",
  "subscriptions", "payments", "events_log", "orders", "stock",
];

// Consultas de negocio (§5.7): deben dar lo mismo en ambos lados.
const CHECKS = {
  "ingresos del mes por moneda":
    `select currency, round(sum(amount)::numeric, 2)::text as total from payments
      where payment_status = 'confirmed' and created_at >= date_trunc('month', now())
      group by currency order by currency`,
  "cupos libres por servicio":
    `select pa.platform_code, count(*)::int from account_slots s
       join platform_accounts pa on pa.id = s.platform_account_id
      where s.status = 'free' group by 1 order by 1`,
  "suscripciones activas":
    `select count(*)::int from subscriptions where subscription_status = 'active'`,
  "próximo vencimiento":
    `select min(renewal_date)::text from subscriptions where subscription_status = 'active' and renewal_date >= current_date`,
};

async function open(url, label) {
  if (!url) throw new Error(`Falta ${label}`);
  const client = new pg.Client({ connectionString: url, application_name: "musicapremium-verify" });
  await client.connect();
  await client.query("set default_transaction_read_only = on");
  return client;
}

const source = await open(process.env.SOURCE_DATABASE_URL, "SOURCE_DATABASE_URL");
const target = await open(process.env.TARGET_DATABASE_URL, "TARGET_DATABASE_URL");
let failures = 0;

const count = async (c, t) => {
  try {
    return (await c.query(`select count(*)::int as n from public.${t}`)).rows[0].n;
  } catch {
    return "no existe";
  }
};

console.log("Tabla                 Supabase      VPS");
for (const table of TABLES) {
  const [a, b] = [await count(source, table), await count(target, table)];
  const ok = a === b;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${table.padEnd(20)} ${String(a).padStart(8)} ${String(b).padStart(8)}`);
}

console.log("");
for (const [label, sql] of Object.entries(CHECKS)) {
  const [a, b] = await Promise.all([source.query(sql), target.query(sql)]);
  const same = JSON.stringify(a.rows) === JSON.stringify(b.rows);
  if (!same) failures++;
  console.log(`${same ? "✓" : "✗"} ${label}`);
  if (!same) console.log(`    Supabase: ${JSON.stringify(a.rows)}\n    VPS:      ${JSON.stringify(b.rows)}`);
}

await source.end();
await target.end();
console.log(failures ? `\n${failures} diferencia(s). No apagues Supabase todavía.` : "\nTodo cuadra. Deja Supabase en solo lectura una o dos semanas (§5.7).");
process.exitCode = failures ? 1 : 0;
