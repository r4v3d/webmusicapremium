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
