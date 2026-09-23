import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../test/pgliteDb";
import { createFamilyAccount, createMemberProfile, createOrder, getOrCreateClient } from "./db";
import { adminApplyEvent, adminConfirmPayment, adminDismissIntent, listManualQueue } from "./adminPayments";
import { createIntent } from "./paymentIntents";
import { completePaidOrder, refundOrderToWallet } from "./settle";
import { processBinanceTransactions } from "./providerSync";
import { ensureWalletNoteCode, findWalletMismatches, getBalances } from "./wallet";
import { query } from "./pg";

let db;
beforeAll(async () => { db = await createTestDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.reset(); });

let seq = 0;
async function seedStock(n = 1) {
  const acc = await createFamilyAccount({ service: "tidal", masterEmail: `m${++seq}@x.com`, password: "mp" });
  for (let i = 1; i <= n; i++) {
    await createMemberProfile({ familyAccountId: acc.id, slotNumber: i, status: "free", memberEmail: `s${seq}${i}@x.com`, memberPassword: "p", emailType: "customer" });
  }
}
async function newOrder(extra = {}) {
  const orderId = `MPB-${200000 + ++seq}`;
  await createOrder({ orderId, fullName: "Ana", email: "ana@x.com", whatsapp: "51999000111", service: "tidal", duration: "1 Mes", planId: "tidal-1m", amountPen: 6, amountUsdt: 1.79, payCurrency: "PEN", ...extra });
  return orderId;
}
const n = async (sql, p) => (await query(sql, p)).rows[0].n;
const at = (offsetMin = 0) => Date.now() + offsetMin * 60_000;

describe("cola Por verificar", () => {
  it("confirmar exige número de operación y un doble clic liquida una sola vez", async () => {
    await seedStock(2);
    const orderId = await newOrder();
    const { intent } = await createIntent({ orderId, providerId: "manual_yape", customerReference: "yapeó Ana P." });
    expect((await listManualQueue()).map((q) => q.customerReference)).toEqual(["yapeó Ana P."]);

    expect((await adminConfirmPayment({ intentId: intent.id, amount: 6, reference: "12" })).status).toBe("reference_required");
    const [a, b] = await Promise.all([
      adminConfirmPayment({ intentId: intent.id, amount: 6, reference: "OP 1234 5678" }),
      adminConfirmPayment({ intentId: intent.id, amount: 6, reference: "op12345678" }),
    ]);
    expect([a.status, b.status].sort()).toEqual(["duplicate", "settled"]);
    expect(await n("select count(*)::int n from payments")).toBe(1);
    expect(await listManualQueue()).toEqual([]);
  });

  it("el mismo número de operación no confirma dos pedidos", async () => {
    await seedStock(2);
    const o1 = await newOrder();
    const o2 = await newOrder();
    await adminConfirmPayment({ orderId: o1, amount: 6, reference: "99887766" });
    const r = await adminConfirmPayment({ orderId: o2, amount: 6, reference: "99887766" });
    expect(r.status).toBe("duplicate");
    expect((await query("select status from orders where order_id = $1", [o2])).rows[0].status).toBe("pending");
  });

  it("'No llegó' libera el cupo y vence el pedido", async () => {
    await seedStock(1);
    const orderId = await newOrder();
    const { intent } = await createIntent({ orderId, providerId: "manual_yape" });
    const r = await adminDismissIntent(intent.id);
    expect(r.status).toBe("dismissed");
    expect(await n("select count(*)::int n from account_slots where status = 'free'")).toBe(1);
    expect((await query("select status from orders where order_id = $1", [orderId])).rows[0].status).toBe("expired");
  });
});

describe("sin stock, reembolso y conciliación", () => {
  it("pagado sin stock se completa al reponer cupos, sin volver a cobrar", async () => {
    const orderId = await newOrder();
    const r = await adminConfirmPayment({ orderId, amount: 6, reference: "55554444" });
    expect(r.status).toBe("needs_manual");
    expect((await completePaidOrder(orderId)).status).toBe("no_stock");
    await seedStock(1);
    const done = await completePaidOrder(orderId);
    expect(done.status).toBe("fulfilled");
    expect(await n("select count(*)::int n from payments where order_id = $1", [orderId])).toBe(1);
    expect(await n("select count(*)::int n from payments where order_id = $1 and subscription_id is not null", [orderId])).toBe(1);
  });

  it("el reembolso devuelve al saldo, libera el cupo y cancela la suscripción", async () => {
    await seedStock(1);
    const orderId = await newOrder();
    const r = await adminConfirmPayment({ orderId, amount: 6, reference: "11112222" });
    const refund = await refundOrderToWallet(orderId, { reason: "cuenta caída" });
    expect(refund).toMatchObject({ status: "refunded", refunded: { PEN: 6 } });
    expect(await getBalances(r.customerId)).toEqual({ PEN: 6, USDT: 0 });
    expect(await n("select count(*)::int n from account_slots where status = 'free'")).toBe(1);
    expect(await n("select count(*)::int n from subscriptions where subscription_status = 'cancelled'")).toBe(1);
    expect(await findWalletMismatches()).toEqual([]);
    expect((await refundOrderToWallet(orderId)).status).toBe("not_refundable");
  });

  it("Binance: nota correcta liquida, un Order ID no se usa dos veces, sin nota va a conciliación", async () => {
    await seedStock(2);
    const orderId = await newOrder({ payCurrency: "USDT" });
    await createIntent({ orderId, providerId: "binance_account" });

    const tx1 = { transactionId: "4532291555750297601", currency: "USDT", amount: "1.79", note: orderId.toLowerCase(), transactionTime: at(1), payerInfo: { binanceId: 777 } };
    const [r1] = await processBinanceTransactions([tx1]);
    expect(r1).toMatchObject({ action: "apply_intent", status: "settled" });

    // El mismo movimiento vuelve a aparecer en el historial (ciclo siguiente): se ignora.
    const [again] = await processBinanceTransactions([tx1]);
    expect(again.action).toBe("seen");

    const other = await newOrder({ payCurrency: "USDT" });
    const { intent } = await createIntent({ orderId: other, providerId: "binance_account" });
    const txNoNote = { transactionId: "4532291555750297602", currency: "USDT", amount: "1.79", note: "", transactionTime: at(1) };
    const [r2] = await processBinanceTransactions([txNoNote], { claimIntentId: intent.id });
    expect(r2.action).toBe("claimed_without_note");
    expect((await query("select status from orders where order_id = $1", [other])).rows[0].status).toBe("awaiting_payment");

    const ev = (await query("select id from payment_events where event_id = $1", [txNoNote.transactionId])).rows[0];
    const applied = await adminApplyEvent({ eventId: ev.id, orderId: other });
    expect(applied.status).toBe("settled");
    expect((await adminApplyEvent({ eventId: ev.id, orderId: other })).status).toBe("already_processed");
    expect(await n("select count(*)::int n from payments where provider = 'binance_account'")).toBe(2);
  });

  it("Binance: código de saldo acredita monto libre truncado a 3 decimales", async () => {
    const client = await getOrCreateClient("51999000444", "Dani", null);
    const code = await ensureWalletNoteCode(client.id);
    const [r] = await processBinanceTransactions([{ transactionId: "4532291555750297603", currency: "USDT", amount: "3.40059", note: code, transactionTime: at() }]);
    expect(r).toMatchObject({ action: "topup", status: "credited", amount: 3.4 });
    expect(await getBalances(client.id)).toEqual({ PEN: 0, USDT: 3.4 });
    expect(await findWalletMismatches()).toEqual([]);
  });
});
