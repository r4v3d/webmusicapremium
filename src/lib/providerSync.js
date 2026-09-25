// Conciliación contra proveedores (§11.5, §12.2). La usan el worker, el
// webhook de TAYPI y el reclamo asistido de Binance: una sola lógica, varios
// disparadores. Nada de aquí confía en datos del cliente.
import { query } from "./pg";
import { recordEvent, markEvent } from "./idempotency";
import { applyPayment } from "./settle";
import { TOPUP_EARLY_MS, decideOrderIdClaim, extractNoteCodes, getPayTransactions, matchTransaction, normalizeNote, truncate3 } from "./binanceAccount";
import { getPayment as taypiGetPayment } from "./taypi";
import { alertAdmin, notifyCustomer } from "./notify";

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
