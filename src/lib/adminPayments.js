// Acciones de cobro del admin (§11.1, §22). El admin verifica contra SU app de
// Yape o su historial de Binance y confirma con un clic: el resto (cupo,
// suscripción, asiento, entrega) lo hace settle.js igual que con un webhook.
import { query, withTransaction } from "./pg";
import { applyPayment } from "./settle";
import { releaseReservation } from "./reserve";
import { truncate3 } from "./binanceAccount";
import { logEvent } from "./db";

export function normalizeReference(reference) {
  return String(reference || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Cola "Por verificar": Yape abiertos, parciales, y vencidos de las últimas 24 h (pagos tardíos). */
export async function listManualQueue() {
  const { rows } = await query(
    `select i.*, o.full_name, o.whatsapp, o.email, o.service, o.duration, o.status as order_status,
            o.renew_subscription_id, c.display_name, c.customer_code
       from payment_intents i
       left join orders o on o.order_id = i.order_id
       left join customers c on c.id = coalesce(i.customer_id, o.customer_id)
      where i.provider = 'manual_yape'
        and (i.status in ('awaiting','created','underpaid')
             or (i.status = 'expired' and i.expires_at > now() - interval '24 hours'
                 and coalesce(o.status, 'expired') not in ('paid','delivered','refunded')))
      order by (i.status = 'expired'), i.created_at asc
      limit 100`
  );
  return rows.map((i) => ({
    intentId: i.id,
    orderId: i.order_id,
    purpose: i.purpose,
    status: i.status,
    orderStatus: i.order_status,
    amountExpected: i.amount_expected == null ? null : Number(i.amount_expected),
    amountReceived: Number(i.amount_received) || 0,
    customerReference: i.customer_reference || "",
    name: i.full_name || i.display_name || "",
    customerCode: i.customer_code || "",
    whatsapp: i.whatsapp || "",
    service: i.service || null,
    duration: i.duration || null,
    isRenewal: Boolean(i.renew_subscription_id),
    createdAt: i.created_at,
    expiresAt: i.expires_at,
  }));
}

async function findOrCreateAdminIntent(orderId) {
  const orderRes = await query("select * from orders where order_id = $1", [orderId]);
  const order = orderRes.rows[0];
  if (!order) return { error: "not_found" };
  const currency = order.pay_currency || "PEN";
  const provider = currency === "USDT" ? "binance_account" : "manual_yape";
  const existing = await query(
    `select * from payment_intents
      where order_id = $1 and currency = $2 and status not in ('paid','overpaid')
      order by (status = 'underpaid') desc, id desc limit 1`,
    [orderId, currency]
  );
  if (existing.rows[0]) return { intent: existing.rows[0], order };
  const amount = currency === "USDT" ? order.amount_usdt : order.amount_pen;
  if (!(Number(amount) > 0)) return { error: "no_price" };
  const ins = await query(
    `insert into payment_intents(order_id, customer_id, purpose, provider, sales_channel, amount_expected, currency,
                                 status, idempotency_key, expires_at, confirmed_by, raw_request)
     values ($1,$2,$3,$4,$5,$6,$7,'awaiting', gen_random_uuid()::text, now() + interval '30 minutes', 'admin', $8)
     returning *`,
    [orderId, order.customer_id, order.renew_subscription_id ? "renewal" : "order", provider, order.sales_channel,
     amount, currency, JSON.stringify({ createdBy: "admin" })]
  );
  return { intent: ins.rows[0], order };
}

/**
 * Confirmar un pago verificado a mano. `reference` es el Nº de operación de
 * Yape/Plin (u Order ID de Binance): se usa como provider_txn_id, así el mismo
 * pago no puede confirmar dos pedidos y un doble clic no liquida dos veces.
 */
export async function adminConfirmPayment({ intentId = null, orderId = null, amount, reference, performedBy = "admin" }) {
  const ref = normalizeReference(reference);
  if (ref.length < 4) return { ok: false, status: "reference_required" };

  let intent = null;
  if (intentId) {
    const res = await query("select * from payment_intents where id = $1", [intentId]);
    intent = res.rows[0] || null;
  } else if (orderId) {
    const found = await findOrCreateAdminIntent(orderId);
    if (found.error) return { ok: false, status: found.error };
    intent = found.intent;
  }
  if (!intent) return { ok: false, status: "not_found" };

  const currency = intent.currency;
  const provider = currency === "USDT" ? "binance_account" : intent.provider === "taypi" ? "manual_yape" : intent.provider;
  const monto = currency === "USDT" ? truncate3(amount) : Number(amount);
  if (!(monto > 0)) return { ok: false, status: "invalid_amount" };

  const result = await applyPayment({
    intentId: intent.id,
    provider,
    providerTxnId: currency === "USDT" ? ref : `op:${ref}`,
    amount: monto,
    currency,
    confirmedBy: performedBy,
  });
  if (result.status === "duplicate") {
    await logEvent("payment_intent", intent.id, "duplicate_reference", null, { reference: ref }, "Referencia ya usada en otro pago", { performedBy });
  }
  return { ...result, intentId: intent.id, orderId: intent.order_id };
}

/** "No llegó": cierra el intento, libera la reserva y deja el pedido vencido. */
export async function adminDismissIntent(intentId, { performedBy = "admin", reason = "" } = {}) {
  return withTransaction(async (tx) => {
    const res = await tx.query("select * from payment_intents where id = $1 for update", [intentId]);
    const intent = res.rows[0];
    if (!intent) return { ok: false, status: "not_found" };
    if (["paid", "overpaid"].includes(intent.status)) return { ok: false, status: "already_paid" };
    if (Number(intent.amount_received) > 0) return { ok: false, status: "has_partial_payment" };

    await tx.query("update payment_intents set status = 'cancelled', confirmed_by = $2, updated_at = now() where id = $1", [intent.id, performedBy]);
    if (intent.order_id) {
      await tx.query(
        "update orders set status = 'expired', updated_at = now() where order_id = $1 and status in ('pending','awaiting_payment')",
        [intent.order_id]
      );
      await releaseReservation(tx, intent.order_id);
    }
    await logEvent("payment_intent", intent.id, "dismissed", null, { orderId: intent.order_id }, reason || "El pago no llegó", { tx, performedBy });
    return { ok: true, status: "dismissed", orderId: intent.order_id };
  });
}

/** Conciliación (§15.3): aplica a un pedido una transacción de Binance que el worker no pudo emparejar. */
export async function adminApplyEvent({ eventId, orderId, performedBy = "admin" }) {
  const evRes = await query("select * from payment_events where id = $1", [eventId]);
  const ev = evRes.rows[0];
  if (!ev || ev.provider !== "binance_account") return { ok: false, status: "not_found" };
  if (["settled", "credited", "underpaid", "duplicate"].includes(ev.process_result)) return { ok: false, status: "already_processed" };
  const amount = truncate3(ev.payload?.amount);
  if (String(ev.payload?.currency || "").toUpperCase() !== "USDT" || !(amount > 0)) return { ok: false, status: "invalid_payload" };

  const result = await adminConfirmPayment({ orderId, amount, reference: ev.event_id, performedBy });
  await query(
    "update payment_events set process_result = $2, processed_at = now(), error_detail = $3, intent_id = coalesce($4, intent_id) where id = $1",
    [eventId, result.status, `aplicado a mano por ${performedBy} a ${orderId}`, result.intentId ?? null]
  );
  return result;
}

