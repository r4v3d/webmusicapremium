// Conciliación contra proveedores (§11.5, §12.2). La usan el worker, el
// webhook de TAYPI y el reclamo asistido de Binance: una sola lógica, varios
// disparadores. Nada de aquí confía en datos del cliente.
import { query } from "./pg";
import { recordEvent, markEvent } from "./idempotency";
import { applyPayment } from "./settle";
import { TOPUP_EARLY_MS, decideOrderIdClaim, extractNoteCodes, getPayTransactions, matchTransaction, normalizeNote, truncate3 } from "./binanceAccount";
import { getPayment as taypiGetPayment } from "./taypi";
import { alertAdmin, notifyCustomer } from "./notify";
import crypto from "node:crypto";
import {
  createYapePayment as mpCreateYapePayment, describeApiError as mpDescribeApiError, payerEmailFor as mpPayerEmailFor,
  intentIdFromReference as mpIntentIdFromReference,
  intentReference as mpIntentReference, rejectionMessage as mpRejectionMessage,
  searchPaymentsByReference as mpSearchPaymentsByReference,
} from "./mercadopago";
import { CONFIG } from "../data/config";
import { FLOW_STATUS, getFlowStatus as flowGetStatus, intentIdFromCommerceOrder as flowIntentIdFromCommerceOrder } from "./flow";

const CONFIG_APP_NAME = () => CONFIG.appName;

export { extractNoteCodes };

async function loadCandidates(codes) {
  const intentsByNote = new Map();
  const customersByNote = new Map();
  if (codes.length === 0) return { intentsByNote, customersByNote };

  // Intentos USDT con esa nota: abiertos, parciales o vencidos hace menos de 2 h.
  const intents = await query(
    `select i.*, c.binance_payer_id
       from payment_intents i left join customers c on c.id = i.customer_id
      where i.provider = 'binance_account' and i.note_code = any($1::text[])
        and (i.status in ('created','awaiting','underpaid')
             or (i.status in ('expired','cancelled') and i.expires_at > now() - interval '2 hours'))`,
    [codes]
  );
  for (const row of intents.rows) intentsByNote.set(row.note_code, row);

  const customers = await query(
    `select id, wallet_note_code, binance_payer_id from customers
      where wallet_note_code is not null
        and upper(regexp_replace(wallet_note_code, '[^A-Za-z0-9]', '', 'g')) = any($1::text[])`,
    [codes]
  );
  for (const row of customers.rows) customersByNote.set(normalizeNote(row.wallet_note_code), row);
  return { intentsByNote, customersByNote };
}

async function bindPayer(customerId, payerId) {
  if (!customerId || !payerId) return;
  await query("update customers set binance_payer_id = $2 where id = $1 and binance_payer_id is null", [customerId, payerId]);
}

/**
 * Procesa transacciones del historial de Binance Pay. Idempotente: cada
 * transactionId se registra una vez en payment_events y se consume una vez.
 * `claimIntentId`: el cliente pegó el Order ID desde su checkout (atajo §12.2).
 */
export async function processBinanceTransactions(txs, { claimIntentId = null } = {}) {
  const codes = [...new Set(txs.flatMap((t) => extractNoteCodes(t.note)))];
  const { intentsByNote, customersByNote } = await loadCandidates(codes);
  const results = [];

  for (const tx of txs) {
    const txnId = String(tx.transactionId || tx.orderId || "");
    if (!txnId) continue;

    const ev = await recordEvent({ provider: "binance_account", eventId: txnId, eventType: "pay_transaction", payload: tx, signatureValid: true });
    if (ev.duplicate && ev.previousResult && ev.previousResult !== "error" && !(claimIntentId && ev.previousResult === "unmatched")) {
      results.push({ txnId, action: "seen", result: ev.previousResult });
      continue;
    }

    const consumed = await query("select 1 from consumed_provider_txns where provider = 'binance_account' and txn_id = $1", [txnId]);
    const decision = matchTransaction(tx, { intentsByNote, customersByNote, alreadyConsumed: consumed.rowCount > 0 });

    try {
      if (decision.action === "apply_intent") {
        await bindPayer(decision.intent.customer_id, decision.payerId);
        const r = await applyPayment({
          intentId: decision.intent.id, provider: "binance_account", providerTxnId: txnId,
          amount: decision.amount, currency: "USDT",
        });
        if (r.customerId) await bindPayer(r.customerId, decision.payerId);
        await markEvent(ev.eventRowId, r.status, { intentId: decision.intent.id });
        results.push({ txnId, action: "apply_intent", ...r });
      } else if (decision.action === "topup") {
        const intent = await query(
          `insert into payment_intents(customer_id, purpose, provider, sales_channel, currency, status, idempotency_key, expires_at, note_code)
           values ($1,'wallet_topup','binance_account','binance','USDT','awaiting',$2, now(), null)
           on conflict (idempotency_key) do update set updated_at = now()
           returning id`,
          [decision.customer.id, `binance-topup:${txnId}`]
        );
        await bindPayer(decision.customer.id, decision.payerId);
        const r = await applyPayment({
          intentId: intent.rows[0].id, provider: "binance_account", providerTxnId: txnId,
          amount: decision.amount, currency: "USDT", note: `Recarga USDT con código ${decision.customer.wallet_note_code}`,
        });
        await markEvent(ev.eventRowId, r.status, { intentId: intent.rows[0].id });
        if (r.status === "credited") {
          await notifyCustomer(r.customerId, `✅ Recarga acreditada: <b>${r.amount.toFixed(3)} USDT</b>. Saldo USDT: <b>${Number(r.balanceAfter).toFixed(3)}</b>`);
        }
        results.push({ txnId, action: "topup", ...r });
      } else if (decision.action === "mismatch") {
        await markEvent(ev.eventRowId, "mismatch", { detail: decision.reason, intentId: decision.intent?.id ?? null });
        results.push({ txnId, action: "mismatch", reason: decision.reason });
        await alertAdmin("Pago USDT para revisar", [
          `Motivo: ${decision.reason}`, `Transacción: ${txnId}`, `Monto: ${truncate3(tx.amount)} USDT`,
          `Nota: ${tx.note || "(vacía)"}`, "Revísalo en Conciliación y aplícalo a mano si corresponde.",
        ], { level: "warn" });
      } else if (decision.action === "unmatched") {
        // Sin nota reconocible. Si vino de un reclamo, queda atado al intento para revisión humana.
        const result = claimIntentId ? "claimed_without_note" : "unmatched";
        await markEvent(ev.eventRowId, result, { detail: tx.note ? `nota: ${tx.note}` : "sin nota", intentId: claimIntentId });
        results.push({ txnId, action: result });
        if (claimIntentId) {
          await alertAdmin("Reclamo USDT sin nota", [
            `Transacción ${txnId} por ${truncate3(tx.amount)} USDT, reclamada desde el intento ${claimIntentId}.`,
            "La nota no coincide: verifica monto y hora y aplícalo desde Conciliación.",
          ], { level: "warn" });
        }
      } else {
        await markEvent(ev.eventRowId, "ignored", { detail: decision.reason });
        results.push({ txnId, action: "ignored", reason: decision.reason });
      }
    } catch (error) {
      await markEvent(ev.eventRowId, "error", { detail: error.message });
      results.push({ txnId, action: "error", error: error.message });
    }
  }
  return results;
}

export async function hasOpenBinanceIntents() {
  const res = await query(
    `select 1 from payment_intents
      where provider = 'binance_account' and note_code is not null
        and (status in ('created','awaiting','underpaid')
             or (status in ('expired','cancelled') and expires_at > now() - interval '2 hours'))
      limit 1`
  );
  return res.rowCount > 0;
}

export async function syncBinance({ lookbackMs = 2 * 60 * 60 * 1000, claimIntentId = null } = {}) {
  const txs = await getPayTransactions({ startTime: Date.now() - lookbackMs, limit: 100 });
  return processBinanceTransactions(txs, { claimIntentId });
}

/**
 * Evento de TAYPI (webhook o consulta de respaldo). El monto pagado se
 * compara contra amount_expected del intento: el evento nunca fija el precio.
 */
export async function handleTaypiPayment(payment, { eventRowId = null } = {}) {
  const intentRes = await query("select * from payment_intents where provider = 'taypi' and provider_ref = $1", [payment.payment_id]);
  const intent = intentRes.rows[0];
  if (!intent) {
    await markEvent(eventRowId, "mismatch", { detail: "intent_not_found" });
    return { ok: false, status: "not_found" };
  }
  const status = String(payment.status || "").toLowerCase();
  if (status === "completed") {
    const r = await applyPayment({
      intentId: intent.id, provider: "taypi", providerTxnId: String(payment.payment_id),
      amount: Number(payment.amount), currency: String(payment.currency || "PEN").toUpperCase(),
    });
    await markEvent(eventRowId, r.status, { intentId: intent.id });
    return r;
  }
  if (["expired", "cancelled", "failed", "rejected"].includes(status)) {
    await query(
      `update payment_intents set status = case when $2 = 'expired' then 'expired' when $2 = 'cancelled' then 'cancelled' else 'failed' end,
              updated_at = now()
        where id = $1 and status in ('created','awaiting')`,
      [intent.id, status]
    );
    await markEvent(eventRowId, "ignored", { detail: status, intentId: intent.id });
    return { ok: true, status: "closed" };
  }
  await markEvent(eventRowId, "ignored", { detail: status, intentId: intent.id });
  return { ok: true, status: "ignored" };
}

/** Respaldo de webhooks perdidos: consulta los intentos TAYPI abiertos de menos de 24 h. */
export async function pollTaypi() {
  const open = await query(
    `select * from payment_intents
      where provider = 'taypi' and provider_ref is not null
        and status in ('created','awaiting') and created_at > now() - interval '24 hours'
      order by id limit 40`
  );
  const results = [];
  for (const intent of open.rows) {
    try {
      const payment = await taypiGetPayment(intent.provider_ref);
      const status = String(payment.status || "").toLowerCase();
      if (status === "completed" || ["expired", "cancelled", "failed", "rejected"].includes(status)) {
        const ev = await recordEvent({ provider: "taypi", eventId: `${intent.provider_ref}:${status}`, eventType: "poll", payload: payment, signatureValid: true });
        if (ev.duplicate) continue;
        results.push({ intentId: intent.id, ...(await handleTaypiPayment({ ...payment, payment_id: intent.provider_ref }, { eventRowId: ev.eventRowId })) });
      }
    } catch (error) {
      results.push({ intentId: intent.id, status: "error", error: error.message });
    }
  }
  return results;
}

async function ownCodesFor(intent) {
  const codes = [];
  if (intent.order_id) codes.push(normalizeNote(intent.order_id));
  if (intent.customer_id) {
    const res = await query("select wallet_note_code from customers where id = $1", [intent.customer_id]);
    if (res.rows[0]?.wallet_note_code) codes.push(normalizeNote(res.rows[0].wallet_note_code));
  }
  return codes;
}

/**
 * Reclamo por Order ID (lo único obligatorio para el cliente). Busca la
 * transacción en el historial de Binance Pay y la aplica al intento del propio
 * cliente: un pedido o una recarga de saldo. La nota ya no es necesaria.
 *
 * Resultados (status): settled | underpaid | credited | duplicate | needs_manual |
 *   not_found (Binance aún no la muestra) | rejected (con `reason`)
 */
export async function claimBinanceByOrderId({ intentId, binanceOrderId, fetchTransactions = getPayTransactions }) {
  const txnId = String(binanceOrderId || "").replace(/\D/g, "");
  if (txnId.length < 8) return { ok: false, status: "invalid_order_id" };

  const intentRes = await query("select * from payment_intents where id = $1", [intentId]);
  const intent = intentRes.rows[0];
  if (!intent || intent.provider !== "binance_account" || intent.currency !== "USDT") return { ok: false, status: "intent_not_found" };

  const earlyMs = intent.purpose === "wallet_topup" ? TOPUP_EARLY_MS : 5 * 60 * 1000;
  const since = new Date(intent.created_at).getTime() - earlyMs;
  const txs = await fetchTransactions({ startTime: since, limit: 100 });
  const tx = txs.find((t) => String(t.transactionId) === txnId || String(t.orderId || "") === txnId);
  if (!tx) return { ok: false, status: "not_found" };

  // El id canónico es transactionId: el mismo que usan el worker y la conciliación.
  const canonicalId = String(tx.transactionId || tx.orderId);
  const ev = await recordEvent({ provider: "binance_account", eventId: canonicalId, eventType: "order_id_claim", payload: tx, signatureValid: true });
  const consumed = await query("select 1 from consumed_provider_txns where provider = 'binance_account' and txn_id = $1", [canonicalId]);

  const decision = decideOrderIdClaim(tx, intent, { alreadyConsumed: consumed.rowCount > 0, ownCodes: await ownCodesFor(intent), earlyMs });
  if (!decision.ok) {
    if (decision.reason === "consumed") return { ok: true, status: "duplicate", duplicate: true };
    await markEvent(ev.eventRowId, "mismatch", { detail: `reclamo por Order ID: ${decision.reason}`, intentId: intent.id });
    if (decision.reason === "note_other_order") {
      await alertAdmin("Reclamo USDT con nota de otro pedido", [
        `Order ID ${canonicalId} (${decision.amount} USDT) reclamado desde el intento ${intent.id}`,
        `La nota menciona: ${decision.foreign.join(", ")}. Revísalo en Conciliación.`,
      ], { level: "warn" });
    }
    return { ok: false, status: "rejected", reason: decision.reason };
  }

  if (decision.payerId && intent.customer_id) {
    await query("update customers set binance_payer_id = $2 where id = $1 and binance_payer_id is null", [intent.customer_id, decision.payerId]);
  }
  const r = await applyPayment({
    intentId: intent.id, provider: "binance_account", providerTxnId: canonicalId,
    amount: decision.amount, currency: "USDT",
    note: intent.purpose === "wallet_topup" ? "Recarga USDT por Order ID" : null,
  });
  await markEvent(ev.eventRowId, r.status, { intentId: intent.id });
  if (r.status === "credited" && intent.purpose === "wallet_topup") {
    await notifyCustomer(r.customerId, `✅ Recarga acreditada: <b>${Number(r.amount).toFixed(3)} USDT</b>.`);
  }
  return { ...r, intentId: intent.id };
}

// --- Mercado Pago · Yape ---

const MP_PROVIDER = "mercadopago_yape";

/** Resultado de un evento que ya no hay que reprocesar (sin resultado o con error sí se reintenta). */
export function mpAlreadyApplied(previousResult) {
  return Boolean(previousResult) && previousResult !== "error";
}

/**
 * Un pago de Mercado Pago ya consultado a su API (nunca el cuerpo del webhook).
 * Aprobado → se liquida el intento de su external_reference. El monto es el que
 * dice Mercado Pago, y applyPayment lo compara contra lo esperado.
 */
export async function handleMercadoPagoPayment(payment, { eventRowId = null } = {}) {
  const intentId = mpIntentIdFromReference(payment?.external_reference);
  const intentRes = intentId
    ? await query("select * from payment_intents where id = $1 and provider = $2", [intentId, MP_PROVIDER])
    : { rows: [] };
  const intent = intentRes.rows[0];
  if (!intent) {
    await markEvent(eventRowId, "mismatch", { detail: `sin intento para ${payment?.external_reference || "(sin referencia)"}` });
    return { ok: false, status: "not_found" };
  }
  const status = String(payment.status || "").toLowerCase();
  if (status === "approved") {
    await query(
      "update payment_intents set provider_ref = $2, updated_at = now() where id = $1 and provider_ref is distinct from $2",
      [intent.id, String(payment.id)]
    );
    const r = await applyPayment({
      intentId: intent.id, provider: MP_PROVIDER, providerTxnId: String(payment.id),
      amount: Number(payment.transaction_amount), currency: String(payment.currency_id || "PEN").toUpperCase(),
    });
    await markEvent(eventRowId, r.status, { intentId: intent.id });
    return r;
  }
  if (["refunded", "charged_back"].includes(status)) {
    await markEvent(eventRowId, "mismatch", { detail: `pago ${status}`, intentId: intent.id });
    await alertAdmin(`Mercado Pago: pago ${status === "refunded" ? "devuelto" : "desconocido por el cliente (contracargo)"}`, [
      `Pedido ${intent.order_id || "(recarga)"} · pago ${payment.id} · S/ ${Number(payment.transaction_amount).toFixed(2)}`,
      "Revisa si corresponde quitar el acceso al cliente.",
    ], { level: "warn" });
    return { ok: true, status: "flagged" };
  }
  // Rechazado, pendiente o cancelado: el intento sigue abierto para otro intento del cliente.
  await markEvent(eventRowId, "ignored", { detail: `${status}${payment.status_detail ? ` (${payment.status_detail})` : ""}`, intentId: intent.id });
  return { ok: true, status: "ignored", paymentStatus: status, statusDetail: payment.status_detail || null };
}

/**
 * Cobro desde el checkout: token de Yape creado en el navegador → pago en
 * Mercado Pago → si se aprueba, se liquida al instante.
 * Resultados: settled | underpaid | duplicate | rejected (con message) | pending | closed | error
 */
export async function payIntentWithYape({ intent, order, yapeToken }, { createPayment = mpCreateYapePayment } = {}) {
  if (!intent || intent.provider !== MP_PROVIDER) return { ok: false, status: "not_found" };
  if (!["created", "awaiting", "underpaid"].includes(intent.status)) return { ok: false, status: "closed" };
  const amount = intent.status === "underpaid"
    ? Math.max(0, Number(intent.amount_expected) - Number(intent.amount_received || 0))
    : Number(intent.amount_expected);
  if (!(amount > 0)) return { ok: false, status: "closed" };

  // Marca de intento: la consulta de respaldo solo revisa intentos que llegaron a cobrarse.
  await query("update payment_intents set raw_response = coalesce(raw_response, '{}'::jsonb) || $2::jsonb, updated_at = now() where id = $1",
    [intent.id, JSON.stringify({ mpLastAttemptAt: new Date().toISOString() })]);

  let payment;
  try {
    payment = await createPayment({
      token: yapeToken,
      amount,
      description: `${CONFIG_APP_NAME()} ${intent.order_id || "recarga"}`,
      email: mpPayerEmailFor(order?.email || `pedido-${intent.order_id || intent.id}@cheapmusic.best`),
      externalReference: mpIntentReference(intent.id),
      idempotencyKey: `yape-${intent.id}-${crypto.createHash("sha256").update(String(yapeToken)).digest("hex").slice(0, 32)}`,
      metadata: { intent_id: String(intent.id), order_id: intent.order_id || null },
    });
  } catch (error) {
    // 4xx: token vencido, datos mal escritos o configuración. 5xx/timeout: la consulta de respaldo lo resuelve.
    if (error.status && error.status < 500) {
      const detail = mpDescribeApiError(error);
      console.error("[mercadopago] pago rechazado por la API:", error.status, detail.code, detail.message);
      await query(
        "update payment_intents set raw_response = coalesce(raw_response, '{}'::jsonb) || $2::jsonb, updated_at = now() where id = $1",
        [intent.id, JSON.stringify({ mpLastError: { at: new Date().toISOString(), status: error.status, ...detail } })]
      );
      return {
        ok: false, status: "rejected", detail,
        message: "No se pudo procesar el pago con esos datos. Genera un código de aprobación nuevo en tu app de Yape e inténtalo otra vez.",
      };
    }
    console.error("[mercadopago] crear pago:", error.message);
    return { ok: false, status: "error", message: "Mercado Pago no respondió. Si Yape te descontó, espera un minuto: lo confirmamos solos." };
  }

  const ev = await recordEvent({
    provider: "mercadopago", eventId: `${payment.id}:${payment.status}`, eventType: "checkout",
    payload: payment, signatureValid: true, intentId: intent.id,
  });
  if (payment.status === "approved") {
    // applyPayment es idempotente: aunque el evento ya exista, se reintenta si no quedó liquidado.
    if (ev.duplicate && mpAlreadyApplied(ev.previousResult)) return { ok: true, status: "duplicate", orderId: intent.order_id };
    return handleMercadoPagoPayment(payment, { eventRowId: ev.eventRowId });
  }
  if (!ev.duplicate) await markEvent(ev.eventRowId, "ignored", { detail: `${payment.status} (${payment.status_detail || ""})`, intentId: intent.id });
  if (payment.status === "rejected") {
    return { ok: false, status: "rejected", message: mpRejectionMessage(payment.status_detail), statusDetail: payment.status_detail };
  }
  return { ok: false, status: "pending", message: "Tu pago se está procesando. Esta página se actualizará sola." };
}

/**
 * Respaldo del webhook: intentos de Yape que llegaron a cobrarse en las últimas
 * 24 h y siguen abiertos. Se buscan sus pagos por external_reference.
 */
export async function pollMercadoPago({ search = mpSearchPaymentsByReference, intentId = null } = {}) {
  const open = await query(
    `select * from payment_intents
      where provider = $1 and status in ('created','awaiting','underpaid')
        and raw_response ? 'mpLastAttemptAt' and created_at > now() - interval '24 hours'
        and ($2::bigint is null or id = $2::bigint)
      order by id limit 40`,
    [MP_PROVIDER, intentId]
  );
  const results = [];
  for (const intent of open.rows) {
    try {
      const payments = await search(mpIntentReference(intent.id));
      for (const payment of payments.filter((p) => p.status === "approved")) {
        const ev = await recordEvent({ provider: "mercadopago", eventId: `${payment.id}:approved`, eventType: "poll", payload: payment, signatureValid: true, intentId: intent.id });
        if (ev.duplicate && mpAlreadyApplied(ev.previousResult)) continue;
        results.push({ intentId: intent.id, ...(await handleMercadoPagoPayment(payment, { eventRowId: ev.eventRowId })) });
      }
    } catch (error) {
      results.push({ intentId: intent.id, status: "error", error: error.message });
    }
  }
  return results;
}

// --- Flow · QR interoperable ---

const FLOW_PROVIDER = "flow_qr";

/**
 * Estado de Flow ya consultado con payment/getStatus (nunca el aviso en sí).
 * 2 = pagada → se liquida el intento de su commerceOrder («intent-N») con el
 * monto que informa Flow. 3/4 = rechazada/anulada → el intento se cierra y el
 * cliente puede pedir un QR nuevo.
 */
export async function handleFlowStatus(status, { eventRowId = null } = {}) {
  const intentId = flowIntentIdFromCommerceOrder(status?.commerceOrder);
  const intentRes = intentId
    ? await query("select * from payment_intents where id = $1 and provider = $2", [intentId, FLOW_PROVIDER])
    : { rows: [] };
  const intent = intentRes.rows[0];
  if (!intent) {
    await markEvent(eventRowId, "mismatch", { detail: `sin intento para ${status?.commerceOrder || "(sin commerceOrder)"}` });
    return { ok: false, status: "not_found" };
  }
  const code = Number(status.status);
  if (code === FLOW_STATUS.PAID) {
    const paid = status.paymentData || {};
    const r = await applyPayment({
      intentId: intent.id, provider: FLOW_PROVIDER, providerTxnId: String(status.flowOrder),
      amount: Number(paid.amount ?? status.amount),
      currency: String(paid.currency || status.currency || "PEN").toUpperCase(),
    });
    await markEvent(eventRowId, r.status, { intentId: intent.id });
    return r;
  }
  if (code === FLOW_STATUS.REJECTED || code === FLOW_STATUS.CANCELLED) {
    await query(
      `update payment_intents set status = $2, updated_at = now()
        where id = $1 and status in ('created','awaiting')`,
      [intent.id, code === FLOW_STATUS.CANCELLED ? "cancelled" : "failed"]
    );
    await markEvent(eventRowId, "ignored", { detail: code === FLOW_STATUS.CANCELLED ? "anulada" : "rechazada", intentId: intent.id });
    return { ok: true, status: "closed" };
  }
  await markEvent(eventRowId, "ignored", { detail: "pendiente", intentId: intent.id });
  return { ok: true, status: "pending" };
}

/** Consulta a Flow un intento y lo procesa (webhook, regreso del cliente, respaldo). */
export async function syncFlowIntentByToken(token, { getStatus = flowGetStatus, eventType = "poll" } = {}) {
  const status = await getStatus(token);
  const ev = await recordEvent({
    provider: "flow", eventId: `${status.flowOrder}:${status.status}`, eventType,
    payload: status, signatureValid: true,
  });
  if (ev.duplicate && mpAlreadyApplied(ev.previousResult)) return { ok: true, status: "duplicate" };
  return handleFlowStatus(status, { eventRowId: ev.eventRowId });
}

/** Respaldo: intentos de Flow abiertos de las últimas 24 h. */
export async function pollFlow({ getStatus = flowGetStatus, intentId = null } = {}) {
  const open = await query(
    `select * from payment_intents
      where provider = $1 and provider_ref is not null and status in ('created','awaiting','underpaid')
        and created_at > now() - interval '24 hours'
        and ($2::bigint is null or id = $2::bigint)
      order by id limit 40`,
    [FLOW_PROVIDER, intentId]
  );
  const results = [];
  for (const intent of open.rows) {
    try {
      results.push({ intentId: intent.id, ...(await syncFlowIntentByToken(intent.provider_ref, { getStatus })) });
    } catch (error) {
      results.push({ intentId: intent.id, status: "error", error: error.message });
    }
  }
  return results;
}
