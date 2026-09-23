// Liquidación (§8, §9). Todo ocurre en una transacción o no ocurre.
//
// Los cuatro cerrojos:
//   1. payment_events único por (provider, event_id)          → idempotency.js
//   2. el pedido se bloquea y solo pasa a 'paid' una vez      → settleOrder()
//   3. consumed_provider_txns + índice único en payments      → applyPayment()
//   4. el cupo se toma con FOR UPDATE SKIP LOCKED              → claimSlot()
//
// Regla de oro: ningún endpoint público escribe 'paid'. Solo este módulo.
import { withTransaction } from "./pg";
import { insertPayment, normalizeAmount, currencyDecimals } from "./ledger";
import { resolveSlotCredentials, formatAssignedAccount } from "./credentials";
import { calculateRenewalDate, parseDurationMonths } from "./renewal";
import { findPlan } from "./catalog";
import { credit, debit } from "./wallet";
import { getOrCreateClient, toDateStr } from "./db";
import { WALLET_PROVIDERS } from "./providers";

const TOLERANCE = { PEN: 0.05, USDT: 0.01 };

export function classifyAmount(expected, paid, currency) {
  const tol = TOLERANCE[currency] ?? 0;
  const e = Number(expected);
  const p = Number(paid);
  if (p + tol < e) return "underpaid";
  if (p > e * 1.1 + tol) return "overpaid";
  return "exact";
}

const SETTLEABLE = ["pending", "awaiting_payment", "underpaid", "expired", "cancelled"];

function orderMonths(order) {
  return findPlan(order.service, order.plan_id)?.months || parseDurationMonths(order.duration);
}

async function logTx(tx, entityType, entityId, eventType, newValue, reason, performedBy = "system") {
  await tx.query(
    `insert into events_log(entity_type, entity_id, event_type, new_value, performed_by, reason)
     values ($1,$2,$3,$4,$5,$6)`,
    [entityType, String(entityId), eventType, newValue == null ? null : JSON.stringify(newValue), performedBy, reason]
  );
}

async function ensureCustomer(tx, order) {
  if (order.customer_id) return order.customer_id;
  const client = await getOrCreateClient(order.whatsapp, order.full_name, order.email, { tx });
  await tx.query("update orders set customer_id = $2 where id = $1", [order.id, client.id]);
  order.customer_id = client.id;
  return client.id;
}

async function claimSlot(tx, order) {
  // Primero el cupo reservado para este pedido; si no, cualquiera libre o con reserva vencida.
  const res = await tx.query(
    `with candidato as (
       select s.id
         from account_slots s
         join platform_accounts pa on pa.id = s.platform_account_id
        where pa.platform_code = $2
          and (
            (s.status = 'reserved' and s.reserved_for_order = $3)
            or s.status = 'free'
            or (s.status = 'reserved' and s.reserved_until < now())
          )
        order by (s.status = 'reserved' and s.reserved_for_order = $3) desc, s.updated_at asc, s.id asc
        limit 1
        for update of s skip locked
     )
     update account_slots s
        set status = 'active', customer_id = $1,
            reserved_until = null, reserved_for_order = null, updated_at = now()
       from candidato
      where s.id = candidato.id
      returning s.*`,
    [order.customer_id, order.service, order.order_id]
  );
  return res.rows[0] || null;
}

/** Crea la suscripción sobre el cupo ya tomado y deja la credencial en el pedido. */
async function attachSlot(tx, order, slot, { currency, planAmount, months }) {
  const account = (await tx.query("select * from platform_accounts where id = $1", [slot.platform_account_id])).rows[0];
  const credentials = resolveSlotCredentials(slot, account);
  const today = toDateStr(new Date());
  const renewalDate = toDateStr(calculateRenewalDate(new Date(), months));

  // Un cupo no puede tener dos suscripciones vivas (restos de ediciones antiguas).
  await tx.query(
    `update subscriptions set subscription_status = 'expired', updated_at = now()
      where account_slot_id = $1 and subscription_status in ('active','pending_payment')`,
    [slot.id]
  );
  const sub = await tx.query(
    `insert into subscriptions(
       customer_id, platform_code, platform_account_id, account_slot_id,
       activation_email, activation_email_owner, plan_price, currency,
       start_date, renewal_date, subscription_status, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,current_date,$9::date,'active',now(),now())
     returning id`,
    [order.customer_id, order.service, slot.platform_account_id, slot.id,
     credentials.email, slot.email_type || "admin", planAmount, currency, renewalDate]
  );
  const subscriptionId = sub.rows[0].id;

  // Pagos previos del mismo pedido (parciales, o cobrados sin stock) quedan atados a la suscripción.
  await tx.query("update payments set subscription_id = $2 where order_id = $1 and subscription_id is null", [order.order_id, subscriptionId]);
  await tx.query(
    `update orders
        set account_slot_id = $2, subscription_id = $3, assigned_account = $4,
            next_delivery_at = now(), updated_at = now()
      where id = $1`,
    [order.id, slot.id, subscriptionId, formatAssignedAccount(credentials.email, credentials.password)]
  );
  return { subscriptionId, credentials, renewalDate, today };
}

/**
 * Runbook §22 "Pago confirmado sin stock": tras importar cupos, el admin
 * completa la entrega de un pedido ya pagado. No vuelve a cobrar.
 */
export async function completePaidOrder(orderId, { performedBy = "admin" } = {}) {
  return withTransaction(async (tx) => {
    const res = await tx.query("select * from orders where order_id = $1 for update", [orderId]);
    const order = res.rows[0];
    if (!order) return { ok: false, status: "not_found" };
    if (order.status !== "paid" || order.assigned_account) return { ok: false, status: "not_pending_stock" };
    await ensureCustomer(tx, order);
    const slot = await claimSlot(tx, order);
    if (!slot) return { ok: false, status: "no_stock" };
    const paid = await tx.query(
      "select coalesce(sum(gross_amount), 0) as total from payments where order_id = $1 and payment_status = 'confirmed'",
      [orderId]
    );
    const currency = order.pay_currency || "PEN";
    const planAmount = Number(paid.rows[0].total) || (currency === "USDT" ? order.amount_usdt : order.amount_pen);
    const out = await attachSlot(tx, order, slot, { currency, planAmount, months: orderMonths(order) });
    await logTx(tx, "order", orderId, "fulfilled", { slotId: slot.id, subscriptionId: out.subscriptionId }, "Entrega completada tras reponer stock", performedBy);
    return { ok: true, status: "fulfilled", orderId, ...out };
  });
}

/**
 * Marca el pedido como pagado, asigna cupo, crea/extiende la suscripción y
 * escribe el asiento de ESTE movimiento. Requiere el pedido bloqueado por el llamador.
 */
async function settleOrder(tx, { order, intentId, provider, providerTxnId, grossAmount, currency, confirmedBy, planAmount }) {
  const claimed = await tx.query(
    `update orders
        set status = 'paid', paid_at = now(), pay_currency = $2, updated_at = now(),
            next_delivery_at = now(), delivery_attempts = 0, last_delivery_error = null
      where id = $1 and status = any($3::text[])
      returning *`,
    [order.id, currency, SETTLEABLE]
  );
  if (claimed.rowCount === 0) return { ok: true, duplicate: true, orderId: order.order_id };
  Object.assign(order, claimed.rows[0]);

  const customerId = await ensureCustomer(tx, order);
  const months = orderMonths(order);
  const performedBy = confirmedBy || "system";

  // Renovación: extiende la suscripción existente; no toma cupo nuevo.
  if (order.renew_subscription_id) {
    const subRes = await tx.query("select * from subscriptions where id = $1 for update", [order.renew_subscription_id]);
    const sub = subRes.rows[0];
    if (sub && String(sub.customer_id) === String(customerId)) {
      const today = toDateStr(new Date());
      const base = sub.renewal_date && sub.renewal_date > today ? sub.renewal_date : today;
      const renewalDate = toDateStr(calculateRenewalDate(new Date(`${base}T12:00:00`), months));
      await tx.query(
        `update subscriptions
            set renewal_date = $2::date, subscription_status = 'active', updated_at = now(),
                plan_price = case when $3 = 'PEN' then $4 else plan_price end
          where id = $1`,
        [sub.id, renewalDate, currency, planAmount]
      );
      let credentials = null;
      if (sub.account_slot_id) {
        const slotRes = await tx.query(
          "update account_slots set status = 'active', updated_at = now() where id = $1 and customer_id = $2 returning *",
          [sub.account_slot_id, customerId]
        );
        const slot = slotRes.rows[0];
        if (slot) {
          const account = (await tx.query("select * from platform_accounts where id = $1", [slot.platform_account_id])).rows[0];
          credentials = resolveSlotCredentials(slot, account);
        }
      }
      await tx.query("update payments set subscription_id = $2 where order_id = $1 and subscription_id is null", [order.order_id, sub.id]);
      const paymentId = await insertPayment(tx, {
        customerId, subscriptionId: sub.id, orderId: order.order_id, intentId, provider, providerTxnId,
        grossAmount, currency, salesChannel: order.sales_channel, confirmedBy: performedBy,
        coverageFrom: base, coverageTo: renewalDate, notes: `Renovación +${months} mes(es)`,
      });
      await tx.query(
        `update orders set subscription_id = $2, account_slot_id = $3, assigned_account = $4, updated_at = now() where id = $1`,
        [order.id, sub.id, sub.account_slot_id, credentials ? formatAssignedAccount(credentials.email, credentials.password) : null]
      );
      await logTx(tx, "order", order.order_id, "settled", { provider, providerTxnId, renewal: true, subscriptionId: sub.id, paymentId, renewalDate }, "Renovación confirmada", performedBy);
      return { ok: true, duplicate: false, renewal: true, orderId: order.order_id, customerId, subscriptionId: sub.id, paymentId, renewalDate, credentials };
    }
    // La suscripción ya no existe o no es del cliente: se trata como compra nueva.
    await logTx(tx, "order", order.order_id, "renewal_fallback", { renewSubscriptionId: order.renew_subscription_id }, "Renovación sin suscripción válida: se asigna cupo nuevo", performedBy);
  }

  const slot = await claimSlot(tx, order);
  if (!slot) {
    // Pago válido sin stock: se conserva el cobro y se marca para intervención humana.
    await insertPayment(tx, {
      customerId, orderId: order.order_id, intentId, provider, providerTxnId, grossAmount, currency,
      salesChannel: order.sales_channel, confirmedBy: performedBy, notes: "Pagado sin stock disponible",
    });
    await tx.query("update orders set next_delivery_at = null where id = $1", [order.id]);
    await logTx(tx, "order", order.order_id, "out_of_stock", { service: order.service, provider, providerTxnId }, "Pago confirmado sin stock disponible", performedBy);
    return { ok: true, duplicate: false, needsManual: true, reason: "no_stock", orderId: order.order_id, customerId };
  }

  const { subscriptionId, credentials, renewalDate, today } = await attachSlot(tx, order, slot, { currency, planAmount, months });
  const paymentId = await insertPayment(tx, {
    customerId, subscriptionId, orderId: order.order_id, intentId, provider, providerTxnId,
    grossAmount, currency, salesChannel: order.sales_channel, confirmedBy: performedBy,
    coverageFrom: today, coverageTo: renewalDate,
  });
  await logTx(tx, "order", order.order_id, "settled",
    { provider, providerTxnId, slotId: slot.id, subscriptionId, paymentId, intentId },
    performedBy === "system" ? "Pago confirmado automáticamente" : `Pago confirmado por ${performedBy}`, performedBy);

  return {
    ok: true, duplicate: false, orderId: order.order_id, customerId, slotId: slot.id,
    subscriptionId, paymentId, renewalDate, credentials,
  };
}

/**
 * Aplica un pago YA verificado contra el proveedor (o por el admin contra su app).
 * Idempotente por (provider, providerTxnId). Nunca confía en montos del cliente.
 *
 * Resultados (status): settled | underpaid | credited | duplicate | needs_manual |
 *                      not_found | currency_mismatch | no_customer
 */
export async function applyPayment({ intentId, provider, providerTxnId, amount, currency, confirmedBy = "system", note = null }) {
  return withTransaction(async (tx) => {
    const intentRes = await tx.query("select * from payment_intents where id = $1 for update", [intentId]);
    const intent = intentRes.rows[0];
    if (!intent) return { ok: false, status: "not_found" };
    if (intent.currency !== currency) return { ok: false, status: "currency_mismatch", intentId };

    const monto = normalizeAmount(amount, currency);
    if (!(monto > 0)) return { ok: false, status: "invalid_amount", intentId };

    // Cerrojo 3: una transacción del proveedor se consume una sola vez.
    if (providerTxnId) {
      const consumed = await tx.query(
        `insert into consumed_provider_txns(provider, txn_id, intent_id, customer_id, amount, currency)
         values ($1,$2,$3,$4,$5,$6)
         on conflict do nothing
         returning txn_id`,
        [provider, providerTxnId, intent.id, intent.customer_id, monto, currency]
      );
      if (consumed.rowCount === 0) return { ok: true, status: "duplicate", duplicate: true, intentId };
    }

    const performedBy = confirmedBy || "system";

    // Recarga de saldo: se acredita lo que llegó (monto libre).
    if (intent.purpose === "wallet_topup") {
      if (!intent.customer_id) return { ok: false, status: "no_customer", intentId };
      const balanceAfter = await credit(tx, {
        customerId: intent.customer_id, currency, amount: monto, reason: "topup",
        refType: "intent", refId: intent.id, createdBy: performedBy,
      });
      await insertPayment(tx, {
        customerId: intent.customer_id, intentId: intent.id, provider, providerTxnId,
        grossAmount: monto, currency, salesChannel: intent.sales_channel, confirmedBy: performedBy,
        paymentMethod: "wallet_topup", notes: note || "Recarga de saldo",
      });
      await tx.query(
        `update payment_intents set status = 'paid', paid_at = coalesce(paid_at, now()),
                amount_received = amount_received + $2, confirmed_by = $3, updated_at = now()
          where id = $1`,
        [intent.id, monto, performedBy]
      );
      await logTx(tx, "customer", intent.customer_id, "wallet_topup", { intentId: intent.id, provider, providerTxnId, amount: monto, currency }, "Recarga de saldo acreditada", performedBy);
      return { ok: true, status: "credited", intentId: intent.id, customerId: intent.customer_id, amount: monto, currency, balanceAfter };
    }

    const orderRes = await tx.query("select * from orders where order_id = $1 for update", [intent.order_id]);
    const order = orderRes.rows[0];
    if (!order) return { ok: false, status: "not_found", intentId };

    // El pedido ya estaba liquidado (pagó dos veces, o por dos vías): todo va al saldo.
    if (["paid", "delivered", "refunded"].includes(order.status)) {
      const customerId = await ensureCustomer(tx, order);
      await credit(tx, { customerId, currency, amount: monto, reason: "overpay", refType: "order", refId: order.order_id, createdBy: performedBy });
      await insertPayment(tx, {
        customerId, intentId: intent.id, provider, providerTxnId, grossAmount: monto, currency,
        salesChannel: order.sales_channel, confirmedBy: performedBy, paymentMethod: "wallet_topup",
        notes: `Pago adicional sobre ${order.order_id} ya liquidado: abonado a saldo`,
      });
      await logTx(tx, "order", order.order_id, "extra_payment_credited", { provider, providerTxnId, amount: monto, currency }, "Pago sobre pedido ya liquidado, abonado a saldo", performedBy);
      return { ok: true, status: "credited", duplicatePayment: true, orderId: order.order_id, customerId, amount: monto, currency };
    }

    const expected = Number(intent.amount_expected);
    const total = normalizeAmount(Number(intent.amount_received) + monto, currency);
    await tx.query(
      "update payment_intents set amount_received = $2, updated_at = now() where id = $1",
      [intent.id, total]
    );
    const cls = classifyAmount(expected, total, currency);

    if (cls === "underpaid") {
      const customerId = await ensureCustomer(tx, order);
      await insertPayment(tx, {
        customerId, orderId: order.order_id, intentId: intent.id, provider, providerTxnId,
        grossAmount: monto, currency, salesChannel: order.sales_channel, confirmedBy: performedBy,
        notes: "Pago parcial",
      });
      await tx.query("update payment_intents set status = 'underpaid', confirmed_by = $2, updated_at = now() where id = $1", [intent.id, performedBy]);
      await tx.query("update orders set status = 'underpaid', pay_currency = $2, updated_at = now() where id = $1", [order.id, currency]);
      const missing = Number((expected - total).toFixed(currencyDecimals(currency)));
      await logTx(tx, "order", order.order_id, "underpaid", { provider, providerTxnId, received: total, expected, missing, currency }, "Pago menor al esperado: no se entrega", performedBy);
      return { ok: true, status: "underpaid", orderId: order.order_id, intentId: intent.id, received: total, expected, missing, currency };
    }

    // exact u overpaid: se liquida. El excedente (>10%) va al saldo de la misma moneda.
    const excess = cls === "overpaid" ? normalizeAmount(total - expected, currency) : 0;
    const applied = normalizeAmount(monto - excess, currency);
    const result = await settleOrder(tx, {
      order, intentId: intent.id, provider, providerTxnId,
      grossAmount: applied, currency, confirmedBy: performedBy, planAmount: expected,
    });

    if (excess > 0) {
      await credit(tx, { customerId: result.customerId, currency, amount: excess, reason: "overpay", refType: "order", refId: order.order_id, createdBy: performedBy });
      await insertPayment(tx, {
        customerId: result.customerId, intentId: intent.id, provider,
        providerTxnId: providerTxnId ? `${providerTxnId}:excedente` : null,
        grossAmount: excess, currency, salesChannel: order.sales_channel, confirmedBy: performedBy,
        paymentMethod: "wallet_topup", notes: `Excedente de ${order.order_id} abonado a saldo`,
      });
    }

    await tx.query(
      `update payment_intents set status = $2, paid_at = now(), confirmed_by = $3, updated_at = now() where id = $1`,
      [intent.id, cls === "overpaid" ? "overpaid" : "paid", performedBy]
    );
    await tx.query("update orders set expires_at = null where id = $1", [order.id]);

    return { ...result, status: result.needsManual ? "needs_manual" : "settled", intentId: intent.id, excess, currency };
  });
}

/**
 * Compra con saldo (§13.3): débito + liquidación en la misma transacción.
 * Sin fondos → rollback completo y error INSUFFICIENT_FUNDS con el faltante.
 */
export async function payWithWallet({ orderId, customerId, currency, salesChannel = null }) {
  return withTransaction(async (tx) => {
    const orderRes = await tx.query("select * from orders where order_id = $1 for update", [orderId]);
    const order = orderRes.rows[0];
    if (!order) return { ok: false, status: "not_found" };
    if (!SETTLEABLE.includes(order.status)) return { ok: true, status: "duplicate", duplicate: true, orderId };
    if (order.customer_id && String(order.customer_id) !== String(customerId)) {
      return { ok: false, status: "forbidden" };
    }
    if (!order.customer_id) {
      await tx.query("update orders set customer_id = $2 where id = $1", [order.id, customerId]);
      order.customer_id = customerId;
    }

    const amount = currency === "USDT" ? Number(order.amount_usdt) : Number(order.amount_pen);
    if (!(amount > 0)) return { ok: false, status: "no_price" };
    const provider = WALLET_PROVIDERS[currency];

    const intentRes = await tx.query(
      `insert into payment_intents(order_id, customer_id, purpose, provider, sales_channel, amount_expected,
                                   amount_received, currency, status, idempotency_key, expires_at, paid_at, confirmed_by)
       values ($1,$2,$3,$4,$5,$6,$6,$7,'paid',$8, now(), now(), 'system')
       returning id`,
      [orderId, customerId, order.renew_subscription_id ? "renewal" : "order", provider,
       salesChannel || order.sales_channel, amount, currency, `wallet:${orderId}:${Date.now()}`]
    );
    const intentId = intentRes.rows[0].id;

    await debit(tx, { customerId, currency, amount, reason: "purchase", refType: "order", refId: orderId });
    const result = await settleOrder(tx, {
      order, intentId, provider, providerTxnId: null,
      grossAmount: amount, currency, confirmedBy: "system", planAmount: amount,
    });
    if (result.needsManual) {
      // Sin stock: no se cobra. Lanzar deshace el débito y el intento.
      const err = new Error("out_of_stock");
      err.code = "OUT_OF_STOCK";
      throw err;
    }
    await tx.query("update orders set expires_at = null where id = $1", [order.id]);
    return { ...result, status: "settled", intentId, currency };
  });
}

/**
 * Reembolso (§13.1 regla 8): el dinero vuelve al saldo de la moneda con que se
 * pagó. Libera el cupo, cancela la suscripción (o deshace la renovación) y marca
 * los asientos del pedido como reembolsados. No hay retiros de dinero.
 */
export async function refundOrderToWallet(orderId, { performedBy = "admin", reason = "" } = {}) {
  return withTransaction(async (tx) => {
    const res = await tx.query("select * from orders where order_id = $1 for update", [orderId]);
    const order = res.rows[0];
    if (!order) return { ok: false, status: "not_found" };
    if (!["paid", "delivered", "underpaid"].includes(order.status)) return { ok: false, status: "not_refundable", orderStatus: order.status };

    const customerId = await ensureCustomer(tx, order);
    const pays = await tx.query(
      `select id, currency, gross_amount, coverage_from from payments
        where order_id = $1 and payment_status = 'confirmed' for update`,
      [orderId]
    );
    const byCurrency = {};
    for (const p of pays.rows) byCurrency[p.currency] = (byCurrency[p.currency] || 0) + Number(p.gross_amount);

    for (const [currency, total] of Object.entries(byCurrency)) {
      const amount = normalizeAmount(total, currency);
      if (amount > 0) {
        await credit(tx, { customerId, currency, amount, reason: "refund", refType: "order", refId: orderId, createdBy: performedBy });
      }
    }
    await tx.query("update payments set payment_status = 'refunded', notes = concat_ws(' · ', notes, $2::text) where order_id = $1 and payment_status = 'confirmed'",
      [orderId, `Reembolsado al saldo${reason ? `: ${reason}` : ""}`]);

    if (order.renew_subscription_id && order.subscription_id) {
      const from = pays.rows.map((p) => p.coverage_from).filter(Boolean).sort()[0];
      if (from) await tx.query("update subscriptions set renewal_date = $2::date, updated_at = now() where id = $1", [order.subscription_id, from]);
    } else {
      if (order.subscription_id) {
        await tx.query("update subscriptions set subscription_status = 'cancelled', updated_at = now() where id = $1", [order.subscription_id]);
      }
      if (order.account_slot_id) {
        await tx.query(
          `update account_slots set status = 'free', customer_id = null, updated_at = now()
            where id = $1 and customer_id is not distinct from $2`,
          [order.account_slot_id, customerId]
        );
      }
    }
    await tx.query("update orders set status = 'refunded', next_delivery_at = null, updated_at = now() where id = $1", [order.id]);
    await logTx(tx, "order", orderId, "refunded", { byCurrency, customerId }, reason || "Reembolso al saldo", performedBy);
    return { ok: true, status: "refunded", orderId, customerId, refunded: byCurrency };
  });
}
