// Libro contable (§10, §15). Único lugar que escribe en `payments`.
// Soles y USDT son libros separados: nada aquí convierte ni suma monedas distintas.

export const CURRENCIES = ["PEN", "USDT"];

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/** Decimales con los que se acredita y se muestra cada moneda. */
export function currencyDecimals(currency) {
  return currency === "USDT" ? 3 : 2;
}

/** Normaliza un monto a la precisión de su moneda. USDT se trunca: nunca redondea a favor del cliente. */
export function normalizeAmount(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  if (currency === "USDT") return Math.floor(n * 1000 + 1e-9) / 1000;
  return round2(n);
}

export function computeFee(provider, gross, currency) {
  // TAYPI: 2.50% + S/ 0.20, más IGV sobre la comisión. Solo aplica en soles.
  if (provider === "taypi" && currency === "PEN") return round2((Number(gross) * 0.025 + 0.2) * 1.18);
  // manual_yape: el dinero llega íntegro. binance_account: transferencia interna.
  // wallet_*: la comisión ya se registró al recargar. admin_manual: cobro fuera del sistema.
  return 0;
}

export function formatMoney(amount, currency) {
  const n = Number(amount) || 0;
  return currency === "USDT" ? `${n.toFixed(currencyDecimals("USDT"))} USDT` : `S/ ${n.toFixed(2)}`;
}

/**
 * Inserta un asiento en `payments`. Debe llamarse dentro de una transacción.
 * gross/fee/net viven en la moneda del pago; `amount` se mantiene por compatibilidad con el panel.
 */
export async function insertPayment(tx, {
  customerId = null,
  subscriptionId = null,
  orderId = null,
  intentId = null,
  provider,
  providerTxnId = null,
  grossAmount,
  currency,
  salesChannel = null,
  confirmedBy = "system",
  paymentMethod = null,
  paymentStatus = "confirmed",
  coverageFrom = null,
  coverageTo = null,
  notes = null,
}) {
  if (!CURRENCIES.includes(currency)) throw new Error(`Moneda no soportada: ${currency}`);
  const gross = normalizeAmount(grossAmount, currency);
  const fee = computeFee(provider, gross, currency);
  const net = normalizeAmount(gross - fee, currency);

  const res = await tx.query(
    `insert into payments(
       customer_id, subscription_id, order_id, intent_id, provider, provider_txn_id,
       amount, currency, gross_amount, fee_amount, net_amount,
       payment_method, payment_status, sales_channel, confirmed_by,
       coverage_from, coverage_to, notes, verified_at, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$7,$9,$10,$11,$12,$13,$14,
             coalesce($15::date, current_date), $16::date, $17,
             case when $12 = 'confirmed' then now() end, now())
     returning id`,
    [customerId, subscriptionId, orderId, intentId, provider, providerTxnId,
     gross, currency, fee, net,
     paymentMethod || provider, paymentStatus, salesChannel, confirmedBy,
     coverageFrom, coverageTo, notes]
  );
  return res.rows[0].id;
}
