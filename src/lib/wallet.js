// Saldo dual (§13): un saldo por moneda, sin conversión entre ellos.
// wallet_ledger es la verdad; wallet_accounts.balance es una caché que se
// escribe siempre en la misma transacción, con la fila bloqueada.
import crypto from "node:crypto";
import { query } from "./pg";
import { CURRENCIES, currencyDecimals, normalizeAmount } from "./ledger";

function assertCurrency(currency) {
  if (!CURRENCIES.includes(currency)) throw new Error(`Moneda no soportada: ${currency}`);
}

export async function debit(tx, { customerId, currency, amount, reason, refType = null, refId = null, createdBy = "system" }) {
  assertCurrency(currency);
  const monto = normalizeAmount(amount, currency);
  if (!(monto > 0)) throw new Error("El débito debe ser mayor que cero.");

  const locked = await tx.query(
    "select balance from wallet_accounts where customer_id = $1 and currency = $2 for update",
    [customerId, currency]
  );
  const balance = Number(locked.rows[0]?.balance ?? 0);
  if (balance + 1e-9 < monto) {
    const err = new Error("insufficient_funds");
    err.code = "INSUFFICIENT_FUNDS";
    err.balance = balance;
    err.missing = Number((monto - balance).toFixed(currencyDecimals(currency)));
    throw err;                              // la transacción hace rollback completo
  }

  const after = Number((balance - monto).toFixed(8));
  await tx.query(
    "update wallet_accounts set balance = $3, updated_at = now() where customer_id = $1 and currency = $2",
    [customerId, currency, after]
  );
  await tx.query(
    `insert into wallet_ledger(customer_id, currency, direction, amount, balance_after, reason, ref_type, ref_id, created_by)
     values ($1,$2,'debit',$3,$4,$5,$6,$7,$8)`,
    [customerId, currency, monto, after, reason, refType, refId == null ? null : String(refId), createdBy]
  );
  return after;
}

export async function credit(tx, { customerId, currency, amount, reason, refType = null, refId = null, createdBy = "system" }) {
  assertCurrency(currency);
  const monto = normalizeAmount(amount, currency);   // USDT truncado a 3 decimales
  if (!(monto > 0)) throw new Error("El crédito debe ser mayor que cero.");

  const res = await tx.query(
    `insert into wallet_accounts(customer_id, currency, balance)
     values ($1,$2,$3)
     on conflict (customer_id, currency)
     do update set balance = wallet_accounts.balance + excluded.balance, updated_at = now()
     returning balance`,
    [customerId, currency, monto]
  );
  const after = Number(res.rows[0].balance);
  await tx.query(
    `insert into wallet_ledger(customer_id, currency, direction, amount, balance_after, reason, ref_type, ref_id, created_by)
     values ($1,$2,'credit',$3,$4,$5,$6,$7,$8)`,
    [customerId, currency, monto, after, reason, refType, refId == null ? null : String(refId), createdBy]
  );
  return after;
}

export async function getBalances(customerId, { tx = null } = {}) {
  const runner = tx || { query };
  const res = await runner.query("select currency, balance from wallet_accounts where customer_id = $1", [customerId]);
  const balances = { PEN: 0, USDT: 0 };
  for (const row of res.rows) balances[row.currency] = Number(row.balance) || 0;
  return balances;
}

export async function getLedger(customerId, { limit = 30 } = {}) {
  const res = await query(
    `select id, currency, direction, amount, balance_after, reason, ref_type, ref_id, created_by, created_at
       from wallet_ledger where customer_id = $1 order by id desc limit $2`,
    [customerId, limit]
  );
  return res.rows.map((r) => ({
    id: r.id,
    currency: r.currency,
    direction: r.direction,
    amount: Number(r.amount),
    balanceAfter: Number(r.balance_after),
    reason: r.reason,
    refType: r.ref_type,
    refId: r.ref_id,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
}

const NOTE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O ni 1/I: se teclea a mano en Binance

export function generateWalletNoteCode() {
  let code = "";
  const bytes = crypto.randomBytes(5);
  for (const b of bytes) code += NOTE_ALPHABET[b % NOTE_ALPHABET.length];
  return `SALDO-${code}`;
}

/** Código permanente e inmutable para recargas USDT de monto libre (§12.1). */
export async function ensureWalletNoteCode(customerId) {
  const existing = await query("select wallet_note_code from customers where id = $1", [customerId]);
  if (!existing.rows[0]) throw new Error("Cliente no encontrado.");
  if (existing.rows[0].wallet_note_code) return existing.rows[0].wallet_note_code;
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateWalletNoteCode();
    try {
      const res = await query(
        "update customers set wallet_note_code = $2 where id = $1 and wallet_note_code is null returning wallet_note_code",
        [customerId, code]
      );
      if (res.rows[0]) return res.rows[0].wallet_note_code;
      const again = await query("select wallet_note_code from customers where id = $1", [customerId]);
      return again.rows[0].wallet_note_code;
    } catch (error) {
      if (error.code !== "23505") throw error; // colisión del índice único: reintenta con otro código
    }
  }
  throw new Error("No se pudo generar un código de recarga único.");
}

/** Descuadres entre la caché y el libro. Cualquier fila es una alerta grave (§7.2). */
export async function findWalletMismatches() {
  const res = await query(
    `select w.customer_id, w.currency, w.balance,
            coalesce(sum(case when l.direction = 'credit' then l.amount else -l.amount end), 0) as ledger_balance
       from wallet_accounts w
       left join wallet_ledger l using (customer_id, currency)
      group by w.customer_id, w.currency, w.balance
     having w.balance <> coalesce(sum(case when l.direction = 'credit' then l.amount else -l.amount end), 0)`
  );
  return res.rows;
}
