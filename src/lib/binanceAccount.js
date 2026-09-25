// USDT por Binance, Vía B (§12): cuenta personal + "Note to Payee", conciliado
// contra GET /sapi/v1/pay/transactions. La API key es de SOLO LECTURA y está
// restringida a la IP del VPS.
import crypto from "node:crypto";

const BASE = process.env.BINANCE_API_BASE || "https://api.binance.com";

export function binanceConfigured() {
  return Boolean(process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET);
}

export function signQuery(queryString, secret) {
  return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

export async function getPayTransactions({ startTime, endTime, limit = 100 } = {}) {
  const params = new URLSearchParams({
    timestamp: Date.now().toString(),
    recvWindow: "10000",
    limit: String(limit),
    ...(startTime ? { startTime: String(startTime) } : {}),
    ...(endTime ? { endTime: String(endTime) } : {}),
  });
  const signature = signQuery(params.toString(), process.env.BINANCE_API_SECRET);
  const res = await fetch(`${BASE}/sapi/v1/pay/transactions?${params}&signature=${signature}`, {
    headers: { "X-MBX-APIKEY": process.env.BINANCE_API_KEY },
    signal: AbortSignal.timeout(12_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.success === false || (json.code && json.code !== "000000")) {
    throw new Error(json?.msg || json?.message || `binance_history_error_${res.status}`);
  }
  return Array.isArray(json.data) ? json.data : [];
}

/** Normaliza la nota: el cliente escribe con espacios, minúsculas o guiones raros. */
export function normalizeNote(note) {
  return String(note || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Trunca a 3 decimales: nunca redondea a favor del cliente. */
export function truncate3(value) {
  return Math.floor(Number(value) * 1000 + 1e-9) / 1000;
}

/** Busca el primer código conocido dentro de la nota ("pago MPB-123456 gracias" también vale). */
export function findCodeInNote(note, knownCodes) {
  const normalized = normalizeNote(note);
  if (!normalized) return null;
  if (knownCodes.has(normalized)) return normalized;
  for (const code of knownCodes) {
    if (code.length >= 6 && normalized.includes(code)) return code;
  }
  return null;
}

const GRACE_MS = 2 * 60 * 60 * 1000;
const EARLY_MS = 5 * 60 * 1000;

/**
 * Decide qué hacer con una transacción del historial de Binance Pay (§12.1).
 * Es pura: recibe los intentos USDT candidatos (por nota normalizada) y los
 * clientes con código de saldo, y devuelve la acción. No toca la base.
 *
 * @returns {{ action: 'ignore'|'unmatched'|'apply_intent'|'topup'|'mismatch', reason?, intent?, customer?, amount? }}
 */
export function matchTransaction(tx, { intentsByNote, customersByNote, alreadyConsumed = false }) {
  if (alreadyConsumed) return { action: "ignore", reason: "consumed" };
  if (String(tx.currency || "").toUpperCase() !== "USDT") return { action: "ignore", reason: "currency" };
  const amount = truncate3(tx.amount);
  if (!(amount > 0)) return { action: "ignore", reason: "outgoing" };

  const codes = new Set([...intentsByNote.keys(), ...customersByNote.keys()]);
  const code = findCodeInNote(tx.note, codes);
  if (!code) return { action: "unmatched", reason: "no_note_match", amount };

  const payerId = tx.payerInfo?.binanceId != null ? String(tx.payerInfo.binanceId) : null;
  const when = Number(tx.transactionTime) || 0;

  const intent = intentsByNote.get(code);
  if (intent) {
    const from = new Date(intent.created_at).getTime() - EARLY_MS;
    const until = new Date(intent.expires_at).getTime() + GRACE_MS;
    if (when && (when < from || when > until)) return { action: "mismatch", reason: "outside_window", intent, amount };
    if (intent.binance_payer_id && payerId && intent.binance_payer_id !== payerId) {
      return { action: "mismatch", reason: "payer_mismatch", intent, amount, payerId };
    }
    return { action: "apply_intent", intent, amount, payerId };
  }

  const customer = customersByNote.get(code);
  if (customer.binance_payer_id && payerId && customer.binance_payer_id !== payerId) {
    return { action: "mismatch", reason: "payer_mismatch", customer, amount, payerId };
  }
  return { action: "topup", customer, amount, payerId };
}

const ORDER_CODE_RE = /MPB\d{6}/g;
const WALLET_CODE_RE = /SALDO[A-Z0-9]{5}/g;

/** Códigos de pedido o de saldo dentro de una nota: "pago mpb-123456!" → ["MPB123456"]. */
export function extractNoteCodes(note) {
  const normalized = normalizeNote(note);
  return [...new Set([...(normalized.match(ORDER_CODE_RE) || []), ...(normalized.match(WALLET_CODE_RE) || [])])];
}

// Un pago reclamado por Order ID debe ser posterior al pedido (5 min de margen
// por relojes) y no más de 24 h después de que venció. En recargas de saldo el
// cliente puede pagar antes de abrir la recarga: ahí se aceptan las últimas 24 h.
export const TOPUP_EARLY_MS = 24 * 60 * 60 * 1000;
const CLAIM_LATE_MS = 24 * 60 * 60 * 1000;

/**
 * Reclamo por Order ID (sin nota obligatoria). El cliente pega el Order ID que
 * le muestra Binance y se valida contra SU intento. Es pura: no toca la base.
 *
 * Controles, en lugar de la nota:
 *  - la transacción no se consumió antes (primero que la reclama, se la lleva)
 *  - es USDT y entrante
 *  - ocurrió después de crear el intento: un pago viejo ajeno no sirve
 *  - si la nota trae el código de OTRO pedido o de otro saldo, era para otro
 * El monto lo clasifica applyPayment (de menos no entrega; de más va al saldo).
 *
 * @param ownCodes códigos normalizados que sí pertenecen a este intento
 * @returns {{ ok: boolean, reason?: string, amount?: number, payerId?: string|null }}
 */
export function decideOrderIdClaim(tx, intent, { alreadyConsumed = false, ownCodes = [], earlyMs = EARLY_MS } = {}) {
  if (alreadyConsumed) return { ok: false, reason: "consumed" };
  if (String(tx.currency || "").toUpperCase() !== "USDT") return { ok: false, reason: "currency" };
  const amount = truncate3(tx.amount);
  if (!(amount > 0)) return { ok: false, reason: "outgoing" };

  const when = Number(tx.transactionTime) || 0;
  const from = new Date(intent.created_at).getTime() - earlyMs;
  const until = new Date(intent.expires_at).getTime() + CLAIM_LATE_MS;
  if (when && when < from) return { ok: false, reason: "before_order", amount };
  if (when && when > until) return { ok: false, reason: "too_late", amount };

  const foreign = extractNoteCodes(tx.note).filter((code) => !ownCodes.includes(code));
  if (foreign.length > 0) return { ok: false, reason: "note_other_order", amount, foreign };

  const payerId = tx.payerInfo?.binanceId != null ? String(tx.payerInfo.binanceId) : null;
  return { ok: true, amount, payerId };
}
