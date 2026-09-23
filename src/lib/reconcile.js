// Ciclo del worker de conciliación (§16). Idempotente y con tope de trabajo:
// si se corre dos veces seguidas, la segunda no hace nada.
import { query } from "./pg";
import { releaseExpiredReservations } from "./reserve";
import { expireStaleIntents } from "./paymentIntents";
import { deliverOrder, MAX_DELIVERY_ATTEMPTS } from "./delivery";
import { alertAdmin } from "./notify";
import { binanceConfigured } from "./binanceAccount";
import { hasOpenBinanceIntents, pollTaypi, syncBinance } from "./providerSync";
import { findWalletMismatches } from "./wallet";
import { purgeRateLimits } from "./rateLimitDb";
import { getProvider } from "./providers";
import { formatMoney } from "./ledger";

const MIN = 60 * 1000;

export function createWorkerState() {
  return { lastBinanceAt: 0, binanceFailingSince: null, lastHourly: 0, lastDaily: 0, lastInvalidSigId: null };
}

async function once(key, fn) {
  // Marca de "ya avisado" en settings para no repetir alertas entre reinicios.
  const res = await query(
    `insert into settings(key, value, updated_by) values ($1, to_jsonb(now()), 'worker')
     on conflict (key) do nothing returning key`,
    [key]
  );
  if (res.rowCount > 0) await fn();
}

async function notifyManualQueue() {
  const fresh = await query(
    `update payment_intents set alerted_at = now()
      where provider = 'manual_yape' and status in ('awaiting','underpaid') and alerted_at is null
      returning id, order_id, purpose, amount_expected, customer_reference, status`
  );
  for (const i of fresh.rows) {
    await alertAdmin(i.purpose === "wallet_topup" ? "Recarga Yape por verificar" : `Yape por verificar: ${i.order_id}`, [
      i.amount_expected != null ? `Monto esperado: ${formatMoney(i.amount_expected, "PEN")}` : "Recarga de monto libre",
      i.customer_reference ? `Dato del cliente: ${i.customer_reference}` : null,
      "Verifica en tu app de Yape y confirma desde Cobros → Por verificar.",
    ]);
  }
  const stale = await query(
    `update payment_intents set reminded_at = now()
      where provider = 'manual_yape' and status in ('awaiting','underpaid')
        and reminded_at is null and alerted_at < now() - interval '10 minutes'
      returning id, order_id`
  );
  if (stale.rows.length) {
    await alertAdmin(`${stale.rows.length} Yape siguen por verificar`, stale.rows.map((r) => `· ${r.order_id || `recarga #${r.id}`}`), { level: "warn" });
  }
  return fresh.rows.length + stale.rows.length;
}

async function retryDeliveries() {
  const due = await query(
    `select order_id from orders
      where status = 'paid' and assigned_account is not null
        and next_delivery_at is not null and next_delivery_at <= now()
        and delivery_attempts < $1
      order by next_delivery_at limit 20`,
    [MAX_DELIVERY_ATTEMPTS]
  );
  const results = [];
  for (const row of due.rows) results.push(await deliverOrder(row.order_id).catch((e) => ({ ok: false, error: e.message })));
  return results;
}

async function alertStuckOrders() {
  const stuck = await query(
    `select order_id, service, full_name, whatsapp, assigned_account is null as no_stock
       from orders
      where status = 'paid' and paid_at < now() - interval '10 minutes'
      order by paid_at limit 20`
  );
  for (const o of stuck.rows) {
    await once(`alert:undelivered:${o.order_id}`, () => alertAdmin(
      o.no_stock ? `Pagado SIN STOCK: ${o.order_id}` : `Pagado sin entregar: ${o.order_id}`,
      [`${o.service} · ${o.full_name || ""} ${o.whatsapp || ""}`,
       o.no_stock ? "Importa cupos y usa «Completar entrega», o reembolsa al saldo." : "Revisa la entrega y usa «Reenviar credenciales»."],
      { level: "critical" }
    ));
  }
  return stuck.rows.length;
}

async function alertInvalidSignatures(state) {
  const res = await query(
    `select id, provider, received_at from payment_events
      where signature_valid = false and id > coalesce($1::bigint, 0)
        and received_at > now() - interval '1 hour'
      order by id`,
    [state.lastInvalidSigId]
  );
  if (res.rows.length) {
    state.lastInvalidSigId = res.rows[res.rows.length - 1].id;
    await alertAdmin(`${res.rows.length} webhook(s) con firma inválida`, [
      `Proveedores: ${[...new Set(res.rows.map((r) => r.provider))].join(", ")}`,
      "Revisa el secreto del webhook y que Caddy/Cloudflare no alteren el cuerpo.",
    ], { level: "warn" });
  }
  return res.rows.length;
}

async function binanceStep(state, now) {
  if (!binanceConfigured()) return null;
  const open = await hasOpenBinanceIntents();
  // Con intentos abiertos, cada 15 s; sin ellos, cada 5 min por las recargas de monto libre.
  const interval = open
    ? Number(process.env.WORKER_BINANCE_MIN_INTERVAL_MS || 15_000)
    : Number(process.env.WORKER_BINANCE_IDLE_INTERVAL_MS || 5 * MIN);
  if (now - state.lastBinanceAt < interval) return null;
  state.lastBinanceAt = now;
  try {
    const results = await syncBinance();
    state.binanceFailingSince = null;
    return results.filter((r) => r.action !== "seen");
  } catch (error) {
    state.binanceFailingSince ??= now;
    if (now - state.binanceFailingSince > 30 * MIN) {
      await once(`alert:binance_down:${new Date(state.binanceFailingSince).toISOString().slice(0, 13)}`, () =>
        alertAdmin("Binance no responde hace más de 30 min", [error.message], { level: "critical" }));
    }
    return [{ action: "error", error: error.message }];
  }
}

export async function runReconciliation({ state = createWorkerState(), now = Date.now() } = {}) {
  const summary = {};

  const released = await releaseExpiredReservations();
  if (released.length) summary.releasedSlots = released.length;

  const expired = await expireStaleIntents();
  if (expired.intents.length) summary.expiredIntents = expired.intents.length;
  if (expired.orders.length) summary.expiredOrders = expired.orders;

  if (getProvider("taypi")?.enabled) {
    const taypi = await pollTaypi();
    if (taypi.length) summary.taypi = taypi;
  }

  const binance = await binanceStep(state, now);
  if (binance?.length) summary.binance = binance;

  const deliveries = await retryDeliveries();
  if (deliveries.length) summary.deliveries = deliveries.length;

  const queued = await notifyManualQueue();
  if (queued) summary.manualQueueAlerts = queued;

  const stuck = await alertStuckOrders();
  if (stuck) summary.stuckOrders = stuck;

  const invalid = await alertInvalidSignatures(state);
  if (invalid) summary.invalidSignatures = invalid;

  if (now - state.lastHourly > 60 * MIN) {
    state.lastHourly = now;
    const purged = await purgeRateLimits();
    if (purged) summary.purgedRateLimits = purged;
  }

  if (now - state.lastDaily > 24 * 60 * MIN) {
    state.lastDaily = now;
    const mismatches = await findWalletMismatches();
    if (mismatches.length) {
      summary.walletMismatches = mismatches.length;
      await alertAdmin("DESCUADRE de saldo", mismatches.map((m) =>
        `cliente ${m.customer_id} ${m.currency}: caché ${m.balance} ≠ libro ${m.ledger_balance}`), { level: "critical" });
    }
  }

  summary.changed = Object.keys(summary).length > 0;
  return summary;
}
