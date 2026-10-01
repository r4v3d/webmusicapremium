import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../test/pgliteDb";
import { createFamilyAccount, createMemberProfile, createOrder, createClient } from "./db";
import { createIntent, createTopupIntent } from "./paymentIntents";
import { defaultProvider, getProvider, topupProvider } from "./providers";
import {
  adminForceApprove, claimYapeIntent, handleYapeAdminCallback, ingestNotification, parseAmount,
  parseYapeNotification, yapeNotifyStep,
} from "./yapeNotify";
import { query } from "./pg";
import { POST as webhook } from "../app/api/webhooks/yape-notify/route";
import { handleTelegramUpdate } from "./telegramBot";

let db;
beforeAll(async () => { db = await createTestDb(); });
afterAll(async () => { await db.close(); });

let telegram;
beforeEach(async () => {
  await db.reset();
  await query("insert into yape_device(id) values (1) on conflict do nothing");
  vi.stubEnv("YAPE_NOTIFY_ENABLED", "true");
  vi.stubEnv("YAPE_NOTIFY_SECRET", "secreto-telefono");
  vi.stubEnv("FLOW_ENABLED", "false");
  vi.stubEnv("MERCADOPAGO_ENABLED", "false");
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token");
  vi.stubEnv("TELEGRAM_ADMIN_CHAT_ID", "777");
  vi.stubEnv("TELEGRAM_ADMIN_USER_IDS", "");
  vi.stubEnv("ADMIN_ALERT_EMAIL", "");
  // Telegram falso: guarda los mensajes enviados.
  telegram = [];
  vi.stubGlobal("fetch", async (url, init) => {
    if (String(url).includes("api.telegram.org")) {
      telegram.push({ method: String(url).split("/").pop(), body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

let seq = 0;
async function pedido({ precio = 6 } = {}) {
  const acc = await createFamilyAccount({ service: "tidal", masterEmail: `master${++seq}@x.com`, password: "mpass" });
  await createMemberProfile({ familyAccountId: acc.id, slotNumber: 1, status: "free", memberEmail: `m${seq}@x.com`, memberPassword: "p1", emailType: "customer" });
  const orderId = `MPB-${400000 + seq}`;
  await createOrder({
    orderId, fullName: "Ana", email: "ana@x.com", whatsapp: `5199900${String(seq).padStart(4, "0")}`, service: "tidal", duration: "1 Mes",
    planId: "tidal-1m", amountPen: precio, amountUsdt: 1.79, payCurrency: "PEN", paymentMethod: "yape_notify",
  });
  const { intent } = await createIntent({ orderId, providerId: "yape_notify" });
  return { orderId, intent };
}

const aviso = (monto, { nombre = "JUAN PEREZ", codigo = "123" } = {}) => ({
  title: "Confirmación de Pago",
  text: `Yape! ${nombre} te envió un pago por S/ ${monto}.${codigo ? ` El cód. de seguridad es: ${codigo}` : ""}`,
});

const estado = async (orderId) => (await query("select status from orders where order_id = $1", [orderId])).rows[0].status;
const atrasar = (minutos) => query(`update yape_notifications set received_at = received_at - interval '${minutos} minutes'`);

describe("lectura de la notificación", () => {
  it("lee monto, nombre y código del formato habitual", () => {
    expect(parseYapeNotification(aviso("5.99"))).toEqual({ kind: "payment", amount: 5.99, securityCode: "123", senderName: "JUAN PEREZ" });
    expect(parseYapeNotification({ text: "¡Yape! Juan P. te yapeó S/ 12,50" })).toMatchObject({ amount: 12.5, senderName: "Juan P.", securityCode: null });
    expect(parseYapeNotification({ title: "Yape", text: "MARIA LOPEZ te envió un pago por S/ 1,234.50. El código de seguridad es: 907" }))
      .toMatchObject({ amount: 1234.5, securityCode: "907" });
  });

  it("lee la notificación real de Yape (nombre abreviado con *)", () => {
    expect(parseYapeNotification({ title: "Confirmación de Pago", text: "Clemer Per* te envió un pago por S/ 25. El cód. de seguridad es: 805" }))
      .toEqual({ kind: "payment", amount: 25, securityCode: "805", senderName: "Clemer Per*" });
    expect(parseYapeNotification({ title: "Confirmación de Pago", text: "Jose Orb* te envió un pago por S/ 9. El cód. de seguridad es: 021" }))
      .toMatchObject({ amount: 9, securityCode: "021" });
  });

  it("ignora pagos propios y avisos que no son pagos", () => {
    expect(parseYapeNotification({ text: "Yapeaste S/ 20 a JUAN PEREZ" }).kind).toBe("other");
    expect(parseYapeNotification({ text: "¡Gana S/ 50 con tus compras!" }).kind).toBe("other");
  });

  it("normaliza montos con coma o punto", () => {
    expect(parseAmount("6")).toBe(6);
    expect(parseAmount("6,5")).toBe(6.5);
    expect(parseAmount("1.234,50")).toBe(1234.5);
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("Yape directo", () => {
  it("es el método por defecto en soles y en recargas; sin secreto no se ofrece", () => {
    expect(defaultProvider("PEN").id).toBe("yape_notify");
    expect(topupProvider().id).toBe("yape_notify");
    vi.stubEnv("YAPE_NOTIFY_SECRET", "");
    expect(getProvider("yape_notify").enabled).toBe(false);
  });

  it("cobra el precio exacto de la tabla a todos, sin descontar céntimos", async () => {
    const a = await pedido();
    const b = await pedido();
    const c = await pedido({ precio: 25 });
    expect([a, b, c].map((p) => Number(p.intent.amount_expected))).toEqual([6, 6, 25]);
  });

  it("con YAPE_NOTIFY_MAX_CENTS se puede volver al monto único", async () => {
    vi.stubEnv("YAPE_NOTIFY_MAX_CENTS", "30");
    const a = await pedido();
    const b = await pedido();
    expect([a, b].map((p) => Number(p.intent.amount_expected))).toEqual([6, 5.99]);
  });

  it("varios yapeos del mismo monto a la vez: cada uno paga su pedido por su código", async () => {
    const a = await pedido();
    const b = await pedido();
    const c = await pedido();
    // Los tres pagan S/ 6 casi al mismo tiempo; cada uno escribe el código de su constancia.
    await ingestNotification(aviso("6", { nombre: "Carla Q*", codigo: "333" }));
    await ingestNotification(aviso("6", { nombre: "Ana M*", codigo: "111" }));
    await ingestNotification(aviso("6", { nombre: "Beto R*", codigo: "222" }));
    expect((await claimYapeIntent({ intentId: b.intent.id, code: "222" })).status).toBe("settled");
    expect((await claimYapeIntent({ intentId: a.intent.id, code: "111" })).status).toBe("settled");
    expect((await claimYapeIntent({ intentId: c.intent.id, code: "333" })).status).toBe("settled");
    const asignados = await query("select n.security_code, i.order_id from yape_notifications n join payment_intents i on i.id = n.intent_id order by n.security_code");
    expect(asignados.rows).toEqual([
      { security_code: "111", order_id: a.orderId },
      { security_code: "222", order_id: b.orderId },
      { security_code: "333", order_id: c.orderId },
    ]);
  });

  it("sin el código del cliente no se paga solo, aunque el monto coincida", async () => {
    const p = await pedido();
    const r = await ingestNotification(aviso("6"));
    expect(r.status).toBe("unmatched");
    expect(await estado(p.orderId)).toBe("awaiting_payment");
    // El cliente escribe el código después: ahí se confirma.
    expect((await claimYapeIntent({ intentId: p.intent.id, code: "123" })).status).toBe("settled");
    expect(await estado(p.orderId)).toBe("paid");
    // El teléfono reintenta el mismo aviso: no se guarda dos veces.
    expect((await ingestNotification(aviso("6"))).status).toBe("duplicate_delivery");
  });

  it("si el cliente escribe primero el código, el pago se confirma apenas llega el aviso", async () => {
    const p = await pedido();
    expect((await claimYapeIntent({ intentId: p.intent.id, code: "123" })).status).toBe("waiting");
    const r = await ingestNotification(aviso("6"));
    expect(r).toMatchObject({ status: "settled", orderId: p.orderId });
  });

  it("código equivocado: no paga; al corregirlo se confirma", async () => {
    const p = await pedido();
    await ingestNotification(aviso("6", { codigo: "222" }));
    expect((await claimYapeIntent({ intentId: p.intent.id, code: "111" })).status).toBe("waiting");
    expect(await estado(p.orderId)).toBe("awaiting_payment");
    // Lo corrige y se confirma.
    expect((await claimYapeIntent({ intentId: p.intent.id, code: "222" })).status).toBe("settled");
  });

  it("un código ya usado no sirve para otro pedido", async () => {
    const a = await pedido();
    await ingestNotification(aviso("6", { codigo: "805" }));
    expect((await claimYapeIntent({ intentId: a.intent.id, code: "805" })).status).toBe("settled");
    const b = await pedido();
    // Otro pedido del mismo precio intenta reutilizar el código 805: no paga y se avisa al admin.
    expect((await claimYapeIntent({ intentId: b.intent.id, code: "805" })).status).toBe("code_used");
    expect(await estado(b.orderId)).toBe("awaiting_payment");
    expect(telegram.some((m) => m.method === "sendMessage" && m.body.text.includes("Código de Yape ya usado"))).toBe(true);
    const usados = await query("select count(*)::int as n from consumed_provider_txns where provider = 'yape_notify'");
    expect(usados.rows[0].n).toBe(1);
  });

  it("dos yapeos con el mismo nombre, monto y código: el segundo nunca paga solo, va a revisión", async () => {
    const a = await pedido();
    await claimYapeIntent({ intentId: a.intent.id, code: "123" });
    expect((await ingestNotification(aviso("6"))).status).toBe("settled");
    await atrasar(5);
    const nuevo = await pedido();
    await claimYapeIntent({ intentId: nuevo.intent.id, code: "123" });
    const r = await ingestNotification({ ...aviso("6"), notificationId: "otro-envio" });
    expect(r.status).toBe("review");
    await yapeNotifyStep();
    const msg = telegram.find((m) => m.method === "sendMessage" && m.body.text.includes("mismo nombre, monto y código"));
    expect(msg).toBeTruthy();
    expect(await estado(nuevo.orderId)).toBe("awaiting_payment");
  });

  it("dos pedidos del mismo monto escriben el mismo código: no se adivina, va a revisión", async () => {
    const a = await pedido();
    const b = await pedido();
    await claimYapeIntent({ intentId: a.intent.id, code: "444" });
    await claimYapeIntent({ intentId: b.intent.id, code: "444" });
    expect((await ingestNotification(aviso("6", { codigo: "444" }))).status).toBe("review");
    expect(await estado(a.orderId)).toBe("awaiting_payment");
    expect(await estado(b.orderId)).toBe("awaiting_payment");
  });

  it("mismo código en pedidos de distinto precio: decide el monto", async () => {
    const a = await pedido();
    const b = await pedido({ precio: 9 });
    await claimYapeIntent({ intentId: a.intent.id, code: "444" });
    await claimYapeIntent({ intentId: b.intent.id, code: "444" });
    expect((await ingestNotification(aviso("9", { codigo: "444" }))).orderId).toBe(b.orderId);
    expect(await estado(a.orderId)).toBe("awaiting_payment");
  });

  it("un yapeo anterior al pedido no lo paga", async () => {
    await ingestNotification(aviso("6.00", { codigo: "555" }));
    await atrasar(3);
    const p = await pedido();
    const r = await claimYapeIntent({ intentId: p.intent.id, code: "555" });
    expect(r.status).toBe("waiting");
    expect(await estado(p.orderId)).toBe("awaiting_payment");
  });

  it("aviso sin código (pagó desde Plin u otro banco): nunca paga solo, va a revisión", async () => {
    const p = await pedido();
    await query("update payment_intents set created_at = created_at - interval '15 minutes' where id = $1", [p.intent.id]);
    expect((await ingestNotification(aviso("6", { codigo: null }))).status).toBe("unmatched");
    expect((await claimYapeIntent({ intentId: p.intent.id })).status).toBe("waiting_manual");
    await atrasar(11);
    const step = await yapeNotifyStep();
    expect(step.strayReviews).toBe(1);
    expect(await estado(p.orderId)).toBe("awaiting_payment");
  });

  it("un monto distinto (pagó de menos) no se asigna solo y se avisa para revisar", async () => {
    const p = await pedido();
    await query("update payment_intents set created_at = created_at - interval '15 minutes' where id = $1", [p.intent.id]);
    const r = await ingestNotification(aviso("5.00"));
    expect(r.status).toBe("unmatched");
    // Se esperan unos minutos a que el cliente escriba su código antes de avisar al admin.
    await atrasar(2);
    expect((await yapeNotifyStep()).strayReviews).toBeUndefined();
    await atrasar(10);
    expect((await yapeNotifyStep()).strayReviews).toBe(1);
    expect(await estado(p.orderId)).toBe("awaiting_payment");
  });

  it("«Ya pagué» sin aviso manda a revisión manual tras unos minutos", async () => {
    const p = await pedido();
    await claimYapeIntent({ intentId: p.intent.id, code: "321" });
    await query("update payment_intents set payer_claimed_at = now() - interval '3 minutes' where id = $1", [p.intent.id]);
    const step = await yapeNotifyStep();
    expect(step.intentReviews).toBe(1);
    const msg = telegram.find((m) => m.method === "sendMessage" && m.body.text.includes(p.orderId));
    expect(msg.body.text).toContain("No llegó ningún aviso");
    // Una sola vez.
    expect((await yapeNotifyStep()).intentReviews).toBeUndefined();
  });

  it("sin exigir código (YAPE_NOTIFY_REQUIRE_CODE=false) basta el monto exacto", async () => {
    vi.stubEnv("YAPE_NOTIFY_REQUIRE_CODE", "false");
    const p = await pedido();
    expect((await ingestNotification(aviso("6"))).status).toBe("settled");
    expect(await estado(p.orderId)).toBe("paid");
  });

  it("botones de Telegram: solo el admin; un aviso asignado no paga un segundo pedido", async () => {
    const a = await pedido();
    const b = await pedido();
    await ingestNotification(aviso("4.00"));
    const notifId = (await query("select id from yape_notifications order by id desc limit 1")).rows[0].id;

    const intruso = await handleYapeAdminCallback({ data: `yn:ok:${a.intent.id}:${notifId}`, chatId: 999, from: { id: 999 } });
    expect(intruso.toast).toBe("No autorizado.");
    expect(await estado(a.orderId)).toBe("awaiting_payment");

    const ok = await handleYapeAdminCallback({ data: `yn:ok:${a.intent.id}:${notifId}`, chatId: 777, messageId: 5, from: { id: 1, username: "dueño" } });
    expect(ok.text).toContain("Falta"); // pagó S/ 4 de S/ 6: no se entrega
    const otra = await handleYapeAdminCallback({ data: `yn:ok:${b.intent.id}:${notifId}`, chatId: 777, messageId: 6, from: { id: 1 } });
    expect(otra.text).toContain("ya pagó otro pedido");
    expect(await estado(b.orderId)).toBe("awaiting_payment");
  });

  it("el bot de Telegram atiende los botones del admin (también en un grupo)", async () => {
    const p = await pedido();
    vi.stubEnv("TELEGRAM_ADMIN_CHAT_ID", "-100777");
    await handleTelegramUpdate({
      update_id: 1,
      callback_query: { id: "cb1", from: { id: 5, username: "dueño" }, data: `yn:fz2:${p.intent.id}`, message: { message_id: 9, chat: { id: -100777, type: "supergroup" } } },
    });
    expect(await estado(p.orderId)).toBe("paid");
    expect(telegram.some((m) => m.method === "answerCallbackQuery")).toBe(true);
  });

  it("aprobar sin aviso funciona una sola vez", async () => {
    const p = await pedido();
    const r1 = await adminForceApprove({ intentId: p.intent.id, by: "telegram:@dueño" });
    expect(r1.status).toBe("settled");
    const r2 = await adminForceApprove({ intentId: p.intent.id, by: "telegram:@dueño" });
    expect(["paid", "duplicate"]).toContain(r2.status);
    const pagos = await query("select count(*)::int as n from payments where order_id = $1", [p.orderId]);
    expect(pagos.rows[0].n).toBe(1);
  });

  it("recarga de saldo: monto exacto + código y se acredita", async () => {
    const client = await createClient({ nickname: "Bea" });
    const r = await createTopupIntent({ customerId: client.id, providerId: "yape_notify", declaredAmount: 20 });
    expect(Number(r.intent.amount_expected)).toBe(20);
    await claimYapeIntent({ intentId: r.intent.id, code: "123" });
    const res = await ingestNotification(aviso("20"));
    expect(res.status).toBe("credited");
    const bal = await query("select coalesce(sum(amount),0)::float8 as s from wallet_ledger where customer_id = $1", [client.id]);
    expect(bal.rows[0].s).toBe(20);
  });
});

describe("endpoint del teléfono", () => {
  const req = (body, secret = "secreto-telefono") => new Request("http://x/api/webhooks/yape-notify", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
    body: JSON.stringify(body),
  });

  it("sin el secreto no acepta nada (nadie puede inventar un pago)", async () => {
    const p = await pedido();
    expect((await webhook(req(aviso("6.00"), "otro"))).status).toBe(403);
    expect((await webhook(req(aviso("6.00"), null))).status).toBe(403);
    expect(await estado(p.orderId)).toBe("awaiting_payment");
  });

  it("con el secreto paga, responde al ping e ignora otras apps", async () => {
    const p = await pedido();
    await claimYapeIntent({ intentId: p.intent.id, code: "123" });
    expect(await (await webhook(req({ ping: true }))).json()).toMatchObject({ status: "pong" });
    expect(await (await webhook(req({ ...aviso("6.00"), app: "com.whatsapp" }))).json()).toMatchObject({ status: "ignored_app" });
    const res = await webhook(req({ ...aviso("6.00"), app: "com.bcp.innovacxion.yapeapp" }));
    expect(await res.json()).toMatchObject({ ok: true, status: "settled", orderId: p.orderId });
    const dev = await query("select last_seen_at from yape_device where id = 1");
    expect(dev.rows[0].last_seen_at).not.toBeNull();
  });
});
