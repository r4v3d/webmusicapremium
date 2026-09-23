import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../test/pgliteDb";
import { createFamilyAccount, createMemberProfile, createOrder, getOrCreateClient } from "./db";
import { applyPayment, classifyAmount, payWithWallet } from "./settle";
import { createIntent, createTopupIntent, expireStaleIntents } from "./paymentIntents";
import { findWalletMismatches, getBalances } from "./wallet";
import { query } from "./pg";

let db;
beforeAll(async () => { db = await createTestDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.reset(); });

let seq = 0;
async function seedStock(n = 1, service = "tidal") {
  const acc = await createFamilyAccount({ service, masterEmail: `master${++seq}@x.com`, password: "mpass" });
  const slots = [];
  for (let i = 1; i <= n; i++) {
    slots.push(await createMemberProfile({
      familyAccountId: acc.id, slotNumber: i, status: "free",
      memberEmail: `m${seq}-${i}@x.com`, memberPassword: `p${i}`, emailType: "customer",
    }));
  }
  return { acc, slots };
}

async function newOrder(overrides = {}) {
  const orderId = overrides.orderId || `MPB-${100000 + ++seq}`;
  await createOrder({
    orderId, fullName: "Ana", email: "ana@x.com", whatsapp: "51999000111",
    service: "tidal", duration: "1 Mes", planId: "tidal-1m",
    amountPen: 6, amountUsdt: 1.79, payCurrency: "PEN", paymentMethod: "manual_yape",
    ...overrides,
  });
  return orderId;
}

const count = async (sql, params) => (await query(sql, params)).rows[0].n;

describe("classifyAmount", () => {
  it("tolera centavos y clasifica excedentes por encima del 10%", () => {
    expect(classifyAmount(6, 5.96, "PEN")).toBe("exact");
    expect(classifyAmount(6, 5.9, "PEN")).toBe("underpaid");
    expect(classifyAmount(6, 6.6, "PEN")).toBe("exact");
    expect(classifyAmount(6, 7, "PEN")).toBe("overpaid");
    expect(classifyAmount(1.79, 1.78, "USDT")).toBe("exact");
    expect(classifyAmount(1.79, 1.77, "USDT")).toBe("underpaid");
  });
});

describe("liquidación", () => {
  it("un Yape confirmado asigna cupo, suscripción y un solo asiento", async () => {
    await seedStock(1);
    const orderId = await newOrder();
    const created = await createIntent({ orderId, providerId: "manual_yape" });
    expect(created.status).toBe("created");
    expect(await count("select count(*)::int n from account_slots where status = 'reserved' and reserved_for_order = $1", [orderId])).toBe(1);

    const r = await applyPayment({ intentId: created.intent.id, provider: "manual_yape", providerTxnId: "OP-1", amount: 6, currency: "PEN", confirmedBy: "admin" });
    expect(r.status).toBe("settled");
    expect(r.credentials.email).toMatch(/^m\d+-1@x.com$/);

    const order = (await query("select * from orders where order_id = $1", [orderId])).rows[0];
    expect(order.status).toBe("paid");
    expect(order.assigned_account).toBe(`${r.credentials.email}:p1`);
    expect(await count("select count(*)::int n from payments where order_id = $1", [orderId])).toBe(1);
    expect(await count("select count(*)::int n from subscriptions where subscription_status = 'active'")).toBe(1);
    expect(await count("select count(*)::int n from account_slots where status = 'active'")).toBe(1);
  });

  it("el mismo evento cinco veces liquida una sola vez", async () => {
    await seedStock(2);
    const orderId = await newOrder();
    const { intent } = await createIntent({ orderId, providerId: "manual_yape" });
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await applyPayment({ intentId: intent.id, provider: "manual_yape", providerTxnId: "OP-9", amount: 6, currency: "PEN" }));
    }
    expect(results.map((r) => r.status)).toEqual(["settled", "duplicate", "duplicate", "duplicate", "duplicate"]);
    expect(await count("select count(*)::int n from payments")).toBe(1);
    expect(await count("select count(*)::int n from subscriptions")).toBe(1);
    expect(await count("select count(*)::int n from account_slots where status = 'active'")).toBe(1);
  });

  it("un pago de menos no entrega y el complemento liquida con dos asientos", async () => {
    await seedStock(1);
    const orderId = await newOrder();
    const { intent } = await createIntent({ orderId, providerId: "manual_yape" });
    const partial = await applyPayment({ intentId: intent.id, provider: "manual_yape", providerTxnId: "OP-A", amount: 4, currency: "PEN" });
    expect(partial).toMatchObject({ status: "underpaid", missing: 2 });
    expect((await query("select status, assigned_account from orders where order_id = $1", [orderId])).rows[0])
      .toEqual({ status: "underpaid", assigned_account: null });

    // El cliente vuelve al checkout: se reutiliza el mismo intento, no se reinicia el acumulado.
    const again = await createIntent({ orderId, providerId: "manual_yape" });
    expect(again.intent.id).toBe(intent.id);

    const rest = await applyPayment({ intentId: intent.id, provider: "manual_yape", providerTxnId: "OP-B", amount: 2, currency: "PEN" });
    expect(rest.status).toBe("settled");
    const pays = (await query("select gross_amount, subscription_id from payments where order_id = $1 order by id", [orderId])).rows;
    expect(pays.map((p) => p.gross_amount)).toEqual([4, 2]);
    expect(new Set(pays.map((p) => p.subscription_id)).size).toBe(1);
    expect(pays[0].subscription_id).not.toBeNull();
  });

  it("un pago de más entrega y abona el excedente al saldo de la misma moneda", async () => {
    await seedStock(1);
    const orderId = await newOrder({ payCurrency: "USDT" });
    const { intent } = await createIntent({ orderId, providerId: "binance_account" });
    expect(intent.note_code).toBe(orderId.replace("-", ""));
    const r = await applyPayment({ intentId: intent.id, provider: "binance_account", providerTxnId: "BN-1", amount: 3.12345, currency: "USDT" });
    expect(r.status).toBe("settled");
    expect(r.excess).toBe(1.333);
    const customerId = r.customerId;
    expect(await getBalances(customerId)).toEqual({ PEN: 0, USDT: 1.333 });
    const pays = (await query("select gross_amount, order_id, provider_txn_id from payments order by id")).rows;
    expect(pays).toEqual([
      { gross_amount: 1.79, order_id: orderId, provider_txn_id: "BN-1" },
      { gross_amount: 1.333, order_id: null, provider_txn_id: "BN-1:excedente" },
    ]);
    expect(await findWalletMismatches()).toEqual([]);
  });

  it("sin stock no se crea el intento y el pedido queda cancelado", async () => {
    const orderId = await newOrder();
    const r = await createIntent({ orderId, providerId: "manual_yape" });
    expect(r.status).toBe("no_stock");
    expect((await query("select status from orders where order_id = $1", [orderId])).rows[0].status).toBe("cancelled");
  });

  it("dos pedidos por el último cupo: uno reserva, el otro recibe sin stock", async () => {
    await seedStock(1);
    const a = await newOrder();
    const b = await newOrder();
    const results = await Promise.all([
      createIntent({ orderId: a, providerId: "manual_yape" }),
      createIntent({ orderId: b, providerId: "manual_yape" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["created", "no_stock"]);
  });

  it("pago confirmado sin stock conserva el cobro y pide intervención", async () => {
    const { slots } = await seedStock(1);
    const orderId = await newOrder();
    const { intent } = await createIntent({ orderId, providerId: "manual_yape" });
    // Alguien ocupa el cupo a mano mientras el cliente paga.
    await query("update account_slots set status = 'active', reserved_for_order = null where id = $1", [slots[0].id]);
    const r = await applyPayment({ intentId: intent.id, provider: "manual_yape", providerTxnId: "OP-X", amount: 6, currency: "PEN" });
    expect(r).toMatchObject({ status: "needs_manual", reason: "no_stock" });
    expect(await count("select count(*)::int n from payments where order_id = $1", [orderId])).toBe(1);
    expect(await count("select count(*)::int n from events_log where event_type = 'out_of_stock'")).toBe(1);
  });

  it("un intento vencido libera la reserva y el pedido expira", async () => {
    await seedStock(1);
    const orderId = await newOrder();
    const { intent } = await createIntent({ orderId, providerId: "manual_yape" });
    await query("update payment_intents set expires_at = now() - interval '1 second' where id = $1", [intent.id]);
    const out = await expireStaleIntents();
    expect(out.orders).toEqual([orderId]);
    expect(await count("select count(*)::int n from account_slots where status = 'free'")).toBe(1);
    // Un Yape que llega tarde igual se puede liquidar si hay stock.
    const late = await applyPayment({ intentId: intent.id, provider: "manual_yape", providerTxnId: "OP-L", amount: 6, currency: "PEN" });
    expect(late.status).toBe("settled");
  });
});

describe("saldo", () => {
  it("recarga libre, compras con saldo y cuadre del libro", async () => {
    await seedStock(4);
    const client = await getOrCreateClient("51999000222", "Beto", "beto@x.com");
    const topup = await createTopupIntent({ customerId: client.id, declaredAmount: 25 });
    const credited = await applyPayment({ intentId: topup.intent.id, provider: "manual_yape", providerTxnId: "OP-T", amount: 25, currency: "PEN" });
    expect(credited).toMatchObject({ status: "credited", balanceAfter: 25 });

    for (let i = 0; i < 4; i++) {
      const orderId = await newOrder({ customerId: client.id });
      const r = await payWithWallet({ orderId, customerId: client.id, currency: "PEN" });
      expect(r.status).toBe("settled");
    }
    expect(await getBalances(client.id)).toEqual({ PEN: 1, USDT: 0 });
    expect(await count("select count(*)::int n from payments where provider = 'wallet_pen' and fee_amount = 0")).toBe(4);
    expect(await findWalletMismatches()).toEqual([]);
  });

  it("sin fondos no cobra, no toma cupo y dice cuánto falta", async () => {
    await seedStock(1);
    const client = await getOrCreateClient("51999000333", "Caro", null);
    const orderId = await newOrder({ customerId: client.id });
    await expect(payWithWallet({ orderId, customerId: client.id, currency: "PEN" }))
      .rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS", missing: 6 });
    expect(await count("select count(*)::int n from account_slots where status = 'free'")).toBe(1);
    expect(await count("select count(*)::int n from payment_intents")).toBe(0);
    expect((await query("select status from orders where order_id = $1", [orderId])).rows[0].status).toBe("pending");
  });

  it("una renovación extiende la suscripción existente sin tomar cupo", async () => {
    await seedStock(2);
    const orderId = await newOrder();
    const { intent } = await createIntent({ orderId, providerId: "manual_yape" });
    const first = await applyPayment({ intentId: intent.id, provider: "manual_yape", providerTxnId: "OP-R1", amount: 6, currency: "PEN" });
    await query("update subscriptions set renewal_date = '2030-01-10' where id = $1", [first.subscriptionId]);

    const renewId = await newOrder({ customerId: first.customerId, renewSubscriptionId: first.subscriptionId, planId: "tidal-2m", duration: "2 Meses", amountPen: 9 });
    const ri = await createIntent({ orderId: renewId, providerId: "manual_yape" });
    const r = await applyPayment({ intentId: ri.intent.id, provider: "manual_yape", providerTxnId: "OP-R2", amount: 9, currency: "PEN" });
    expect(r).toMatchObject({ status: "settled", renewal: true, renewalDate: "2030-03-10" });
    expect(await count("select count(*)::int n from account_slots where status = 'active'")).toBe(1);
    expect(await count("select count(*)::int n from subscriptions")).toBe(1);
  });
});
