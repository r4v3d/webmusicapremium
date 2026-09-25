// Intentos de pago (§6, §11). Un pedido puede tener varios intentos (cambió de
// método, expiró el QR); solo uno está abierto a la vez. Crear el intento
// reserva el cupo: si no hay stock, no se cobra.
import crypto from "node:crypto";
import { query, withTransaction } from "./pg";
import { getProvider, isWalletProvider } from "./providers";
import { reserveSlot, releaseReservation } from "./reserve";
import { normalizeNote } from "./binanceAccount";
import { createPayment as taypiCreatePayment } from "./taypi";
import { payWithWallet } from "./settle";
import { CONFIG } from "../data/config";

const OPEN = ["created", "awaiting"];
const ORDER_OPEN = ["pending", "awaiting_payment", "expired", "underpaid"];

export function intentUi(intent, order = null) {
  if (!intent) return null;
  const provider = getProvider(intent.provider);
  const expected = intent.amount_expected == null ? null : Number(intent.amount_expected);
  const received = Number(intent.amount_received) || 0;
  const payments = CONFIG.payments;
  return {
    id: intent.id,
    orderId: intent.order_id,
    purpose: intent.purpose,
    provider: intent.provider,
    ui: provider?.ui || null,
    label: provider?.label || intent.provider,
    autoConfirm: provider?.autoConfirm ?? false,
    status: intent.status,
    currency: intent.currency,
    amountExpected: expected,
    amountReceived: received,
    missing: expected != null && intent.status === "underpaid" ? Math.max(0, Number((expected - received).toFixed(3))) : null,
    // El cliente escribe el código del pedido tal cual; se compara normalizado.
    noteCode: intent.note_code ? (order?.order_id || intent.order_id || intent.note_code) : null,
    customerReference: intent.customer_reference || "",
    expiresAt: intent.expires_at,
    qrImage: intent.qr_payload || null,
    checkoutUrl: intent.checkout_url || null,
    instructions: provider?.ui === "pay_id_note"
      ? { payId: process.env.BINANCE_PAY_ID || payments.binancePay.payId, nickname: process.env.BINANCE_PAY_NICKNAME || payments.binancePay.nickname, qrImage: payments.binancePay.qrImage }
      : provider?.ui === "static_qr"
      ? { yape: payments.yape, plin: payments.plin, reviewHours: CONFIG.manualReviewHours }
      : null,
  };
}

export async function getIntentById(id) {
  const res = await query("select * from payment_intents where id = $1", [id]);
  return res.rows[0] || null;
}

export async function getLatestIntentForOrder(orderId) {
  const res = await query(
    "select * from payment_intents where order_id = $1 order by id desc limit 1",
    [orderId]
  );
  return res.rows[0] || null;
}

function idempotencyKey() {
  return crypto.randomUUID();
}

/**
 * Crea (o reutiliza) el intento abierto de un pedido con el proveedor elegido.
 * Con saldo, liquida en el acto. Devuelve { ok, status, intent?, settle? }.
 */
export async function createIntent({ orderId, providerId, customerReference = null, salesChannel = null, sessionCustomerId = null }) {
  const provider = getProvider(providerId);
  if (!provider || !provider.enabled) return { ok: false, status: "provider_disabled" };

  if (isWalletProvider(providerId)) {
    if (!sessionCustomerId) return { ok: false, status: "login_required" };
    try {
      const result = await payWithWallet({ orderId, customerId: sessionCustomerId, currency: provider.currency, salesChannel });
      return { ok: result.ok !== false, status: result.status, settle: result };
    } catch (error) {
      if (error.code === "INSUFFICIENT_FUNDS") return { ok: false, status: "insufficient_funds", missing: error.missing, balance: error.balance, currency: provider.currency };
      if (error.code === "OUT_OF_STOCK") return { ok: false, status: "no_stock" };
      throw error;
    }
  }

  const ttlSeconds = provider.intentTtlMinutes * 60;
  const outcome = await withTransaction(async (tx) => {
    const orderRes = await tx.query("select * from orders where order_id = $1 for update", [orderId]);
    const order = orderRes.rows[0];
    if (!order) return { ok: false, status: "not_found" };
    if (!ORDER_OPEN.includes(order.status)) return { ok: false, status: "closed", orderStatus: order.status };

    const amount = provider.currency === "USDT" ? order.amount_usdt : order.amount_pen;
    if (!(Number(amount) > 0)) return { ok: false, status: "no_price" };

    // Un pago parcial se completa sobre el mismo intento: no se reinicia el acumulado.
    if (order.status === "underpaid") {
      const under = await tx.query(
        "select * from payment_intents where order_id = $1 and status = 'underpaid' order by id desc limit 1",
        [orderId]
      );
      if (under.rows[0]) return { ok: true, status: "underpaid", intent: under.rows[0], order };
    }

    const open = await tx.query(
      `select * from payment_intents
        where order_id = $1 and status = any($2::text[]) and expires_at > now()
        order by id desc`,
      [orderId, OPEN]
    );
    const same = open.rows.find((i) => i.provider === providerId);
    if (same) {
      if (customerReference) {
        await tx.query("update payment_intents set customer_reference = $2, updated_at = now() where id = $1", [same.id, customerReference]);
        same.customer_reference = customerReference;
      }
      return { ok: true, status: "reused", intent: same, order };
    }
    if (open.rows.length) {
      await tx.query(
        "update payment_intents set status = 'cancelled', updated_at = now() where order_id = $1 and status = any($2::text[])",
        [orderId, OPEN]
      );
    }

    if (!order.renew_subscription_id) {
      const slotId = await reserveSlot(tx, order.service, orderId, ttlSeconds);
      if (!slotId) {
        await tx.query("update orders set status = 'cancelled', updated_at = now() where id = $1", [order.id]);
        await tx.query(
          `insert into events_log(entity_type, entity_id, event_type, new_value, performed_by, reason)
           values ('order', $1, 'cancelled', $2, 'system', 'Sin stock al crear el intento')`,
          [orderId, JSON.stringify({ reason: "no_stock", service: order.service })]
        );
        return { ok: false, status: "no_stock" };
      }
    }

    // El código del pedido va en "Note to Payee": solo el intento vigente lo lleva.
    let noteCode = null;
    if (provider.ui === "pay_id_note") {
      noteCode = normalizeNote(orderId);
      await tx.query("update payment_intents set note_code = null where note_code = $1", [noteCode]);
    }

    const ins = await tx.query(
      `insert into payment_intents(order_id, customer_id, purpose, provider, sales_channel, amount_expected,
                                   currency, status, note_code, customer_reference, idempotency_key, expires_at, raw_request)
       values ($1,$2,$3,$4,$5,$6,$7,'awaiting',$8,$9,$10, now() + ($11::int * interval '1 second'), $12)
       returning *`,
      [orderId, order.customer_id, order.renew_subscription_id ? "renewal" : "order", providerId,
       salesChannel || order.sales_channel, amount, provider.currency, noteCode, customerReference,
       idempotencyKey(), ttlSeconds, JSON.stringify({ providerId, customerReference })]
    );
    const intent = ins.rows[0];
    if (provider.id === "taypi") {
      await tx.query("update payment_intents set status = 'created' where id = $1", [intent.id]);
      intent.status = "created";
    }
    await tx.query(
      `update orders set status = 'awaiting_payment', pay_currency = $2, payment_method = $3,
              expires_at = $4, updated_at = now()
        where id = $1`,
      [order.id, provider.currency, providerId, intent.expires_at]
    );
    return { ok: true, status: "created", intent, order };
  });

  if (!outcome.ok || provider.id !== "taypi" || outcome.status !== "created") return outcome;

  // TAYPI: se pide el QR fuera de la transacción; el Idempotency-Key cubre reintentos.
  try {
    const data = await taypiCreatePayment({
      amountPen: Number(outcome.intent.amount_expected),
      reference: orderId,
      description: `${CONFIG.appName} ${orderId}`,
      idempotencyKey: outcome.intent.idempotency_key,
    });
    const upd = await query(
      `update payment_intents
          set provider_ref = $2, qr_payload = $3, checkout_url = $4, status = 'awaiting',
              expires_at = coalesce($5::timestamptz, expires_at), raw_response = $6, updated_at = now()
        where id = $1 returning *`,
      [outcome.intent.id, data.payment_id, data.qr_image || null, data.checkout_url || null, data.expires_at || null, JSON.stringify(data)]
    );
    return { ...outcome, intent: upd.rows[0] };
  } catch (error) {
    await query(
      "update payment_intents set status = 'failed', raw_response = $2, updated_at = now() where id = $1",
      [outcome.intent.id, JSON.stringify({ error: error.message, payload: error.payload ?? null })]
    );
    return { ok: false, status: "provider_error", error: error.message };
  }
}

/**
 * Recarga de saldo en soles (§13.1): monto libre. Entra a la cola "Por verificar"
 * y se acredita lo que tú confirmes haber recibido. En USDT no hace falta intento:
 * basta el código permanente del cliente en la nota.
 */
export async function createTopupIntent({ customerId, providerId = "manual_yape", declaredAmount = null, customerReference = null, salesChannel = "web" }) {
  const provider = getProvider(providerId);
  if (!provider || !provider.enabled || provider.currency !== "PEN" || provider.ui === "wallet") {
    return { ok: false, status: "provider_disabled" };
  }
  const declared = Number(declaredAmount);
  if (provider.id === "taypi" && !(declared > 0)) return { ok: false, status: "amount_required" };

  const res = await query(
    `insert into payment_intents(customer_id, purpose, provider, sales_channel, amount_expected, currency,
                                 status, customer_reference, idempotency_key, expires_at, raw_request)
     values ($1,'wallet_topup',$2,$3,$4,'PEN','awaiting',$5,$6, now() + ($7::int * interval '1 minute'), $8)
     returning *`,
    [customerId, providerId, salesChannel, provider.id === "taypi" ? declared : null,
     [declared > 0 ? `Monto declarado: S/ ${declared.toFixed(2)}` : null, customerReference].filter(Boolean).join(" · ") || null,
     idempotencyKey(), provider.intentTtlMinutes, JSON.stringify({ declaredAmount: declared || null })]
  );
  const intent = res.rows[0];
  if (provider.id !== "taypi") return { ok: true, status: "created", intent };

  try {
    const data = await taypiCreatePayment({
      amountPen: declared, reference: `TOPUP-${intent.id}`,
      description: `${CONFIG.appName} recarga`, idempotencyKey: intent.idempotency_key,
    });
    const upd = await query(
      `update payment_intents set provider_ref = $2, qr_payload = $3, checkout_url = $4, raw_response = $5, updated_at = now()
        where id = $1 returning *`,
      [intent.id, data.payment_id, data.qr_image || null, data.checkout_url || null, JSON.stringify(data)]
    );
    return { ok: true, status: "created", intent: upd.rows[0] };
  } catch (error) {
    await query("update payment_intents set status = 'failed', updated_at = now() where id = $1", [intent.id]);
    return { ok: false, status: "provider_error", error: error.message };
  }
}

/** Worker (§16 puntos 1-2): vence intentos y pedidos, libera sus reservas. */
export async function expireStaleIntents() {
  return withTransaction(async (tx) => {
    const expired = await tx.query(
      `update payment_intents set status = 'expired', updated_at = now()
        where status = any($1::text[]) and expires_at < now()
        returning id, order_id, provider`,
      [OPEN]
    );
    const orderIds = [...new Set(expired.rows.map((r) => r.order_id).filter(Boolean))];
    const expiredOrders = [];
    for (const orderId of orderIds) {
      const res = await tx.query(
        `update orders o set status = 'expired', updated_at = now()
          where o.order_id = $1 and o.status = 'awaiting_payment'
            and not exists (select 1 from payment_intents i
                             where i.order_id = o.order_id and i.status = any($2::text[]))
          returning order_id`,
        [orderId, OPEN]
      );
      if (res.rows[0]) {
        expiredOrders.push(orderId);
        await releaseReservation(tx, orderId);
      }
    }
    return { intents: expired.rows, orders: expiredOrders };
  });
}

/**
 * Recarga USDT de monto libre por Order ID: abre (o reutiliza) un intento del
 * cliente. Su hora de creación es el límite: solo valen pagos hechos después.
 */
export async function getOrCreateBinanceTopupIntent({ customerId, salesChannel = "web" }) {
  const open = await query(
    `select * from payment_intents
      where customer_id = $1 and purpose = 'wallet_topup' and provider = 'binance_account'
        and status in ('created','awaiting') and expires_at > now()
      order by id desc limit 1`,
    [customerId]
  );
  if (open.rows[0]) return open.rows[0];
  const res = await query(
    `insert into payment_intents(customer_id, purpose, provider, sales_channel, currency, status, idempotency_key, expires_at)
     values ($1,'wallet_topup','binance_account',$2,'USDT','awaiting',$3, now() + interval '24 hours')
     returning *`,
    [customerId, salesChannel, idempotencyKey()]
  );
  return res.rows[0];
}
