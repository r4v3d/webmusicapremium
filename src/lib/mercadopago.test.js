import crypto from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../test/pgliteDb";
import { createFamilyAccount, createMemberProfile, createOrder } from "./db";
import { createIntent } from "./paymentIntents";
import { defaultProvider, getProvider } from "./providers";
import { handleMercadoPagoPayment, payIntentWithYape, pollMercadoPago } from "./providerSync";
import { describeApiError, intentReference, payerEmailFor, rejectionMessage, verifyWebhookSignature } from "./mercadopago";
import { query } from "./pg";

let db;
beforeAll(async () => { db = await createTestDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.reset();
  vi.stubEnv("MERCADOPAGO_ENABLED", "true");
  vi.stubEnv("MP_PUBLIC_KEY", "APP_USR-publica");
  vi.stubEnv("MP_ACCESS_TOKEN", "APP_USR-secreta");
});
afterEach(() => { vi.unstubAllEnvs(); });

let seq = 0;
async function pedidoConStock() {
  const acc = await createFamilyAccount({ service: "tidal", masterEmail: `master${++seq}@x.com`, password: "mpass" });
  await createMemberProfile({ familyAccountId: acc.id, slotNumber: 1, status: "free", memberEmail: `m${seq}@x.com`, memberPassword: "p1", emailType: "customer" });
  const orderId = `MPB-${200000 + seq}`;
  await createOrder({
    orderId, fullName: "Ana", email: "ana@x.com", whatsapp: "51999000111", service: "tidal", duration: "2 Meses",
    planId: "tidal-2m", amountPen: 9, amountUsdt: 2.69, payCurrency: "PEN", paymentMethod: "mercadopago_yape",
  });
  const { intent } = await createIntent({ orderId, providerId: "mercadopago_yape" });
  const order = (await query("select * from orders where order_id = $1", [orderId])).rows[0];
  return { orderId, intent, order };
}

const pago = (intent, extra = {}) => ({
  id: 74581527758 + ++seq, status: "approved", status_detail: "accredited", transaction_amount: 9, currency_id: "PEN",
  payment_method_id: "yape", external_reference: intentReference(intent.id), ...extra,
});

const estadoPedido = async (orderId) => (await query("select status from orders where order_id = $1", [orderId])).rows[0].status;

describe("proveedor Yape de Mercado Pago", () => {
  it("se ofrece solo con las dos claves y pasa a ser el Yape por defecto", () => {
    expect(getProvider("mercadopago_yape").enabled).toBe(true);
    expect(defaultProvider("PEN").id).toBe("mercadopago_yape");
    vi.stubEnv("MP_ACCESS_TOKEN", "");
    expect(getProvider("mercadopago_yape").enabled).toBe(false);
    expect(defaultProvider("PEN").id).toBe("manual_yape");
  });
});

describe("cobro desde el checkout", () => {
  it("aprobado: liquida el pedido al instante y guarda el id del pago", async () => {
    const { orderId, intent, order } = await pedidoConStock();
    const calls = [];
    const createPayment = async (args) => { calls.push(args); return pago(intent); };
    const r = await payIntentWithYape({ intent, order, yapeToken: "tok_1" }, { createPayment });
    expect(r.status).toBe("settled");
    expect(await estadoPedido(orderId)).toBe("paid");
    expect(calls[0]).toMatchObject({ token: "tok_1", amount: 9, email: "ana@x.com", externalReference: `intent:${intent.id}` });
    expect(calls[0].idempotencyKey).toMatch(/^yape-\d+-[0-9a-f]{32}$/);
    const fila = (await query("select provider_ref, status from payment_intents where id = $1", [intent.id])).rows[0];
    expect(fila.status).toBe("paid");
    expect(fila.provider_ref).toMatch(/^\d+$/);
  });

  it("rechazado: explica el motivo y el pedido sigue abierto para reintentar", async () => {
    const { orderId, intent, order } = await pedidoConStock();
    const r = await payIntentWithYape({ intent, order, yapeToken: "tok_2" }, {
      createPayment: async () => pago(intent, { status: "rejected", status_detail: "cc_rejected_insufficient_amount" }),
    });
    expect(r).toMatchObject({ ok: false, status: "rejected", message: rejectionMessage("cc_rejected_insufficient_amount") });
    expect(await estadoPedido(orderId)).toBe("awaiting_payment");
    // Otro intento con un código nuevo sí se cobra.
    const ok = await payIntentWithYape({ intent, order, yapeToken: "tok_3" }, { createPayment: async () => pago(intent) });
    expect(ok.status).toBe("settled");
  });

  it("el mismo pago aprobado por dos vías (checkout y webhook) se cobra una sola vez", async () => {
    const { intent, order } = await pedidoConStock();
    const p = pago(intent);
    const r1 = await payIntentWithYape({ intent, order, yapeToken: "tok_4" }, { createPayment: async () => p });
    expect(r1.status).toBe("settled");
    const r2 = await handleMercadoPagoPayment(p);
    expect(r2.status).toBe("duplicate");
    expect((await query("select count(*)::int as n from payments where provider_txn_id = $1", [String(p.id)])).rows[0].n).toBe(1);
  });

  it("si Mercado Pago no responde, la consulta de respaldo encuentra el pago aprobado y liquida", async () => {
    const { orderId, intent, order } = await pedidoConStock();
    const caido = async () => { throw Object.assign(new Error("timeout"), { status: undefined }); };
    const r = await payIntentWithYape({ intent, order, yapeToken: "tok_5" }, { createPayment: caido });
    expect(r.status).toBe("error");
    expect(await estadoPedido(orderId)).toBe("awaiting_payment");

    const buscado = [];
    const search = async (ref) => { buscado.push(ref); return [pago(intent)]; };
    const res = await pollMercadoPago({ search });
    expect(buscado).toEqual([`intent:${intent.id}`]);
    expect(res[0].status).toBe("settled");
    expect(await estadoPedido(orderId)).toBe("paid");
    // La siguiente vuelta ya no lo toca.
    expect(await pollMercadoPago({ search })).toEqual([]);
  });

  it("el monto lo decide Mercado Pago: un pago menor deja el pedido como parcial", async () => {
    const { orderId, intent, order } = await pedidoConStock();
    const r = await payIntentWithYape({ intent, order, yapeToken: "tok_6" }, { createPayment: async () => pago(intent, { transaction_amount: 5 }) });
    expect(r.status).toBe("underpaid");
    expect(await estadoPedido(orderId)).toBe("underpaid");
  });

  it("un token inválido (4xx) se explica sin marcar error del sistema", async () => {
    const { intent, order } = await pedidoConStock();
    const r = await payIntentWithYape({ intent, order, yapeToken: "malo" }, {
      createPayment: async () => { throw Object.assign(new Error("invalid token"), { status: 400 }); },
    });
    expect(r).toMatchObject({ ok: false, status: "rejected" });
    expect(r.message).toMatch(/código de aprobación nuevo/);
  });

  it("un pago de otro intento o sin referencia no liquida nada", async () => {
    await pedidoConStock();
    const r = await handleMercadoPagoPayment({ id: 1, status: "approved", transaction_amount: 9, currency_id: "PEN", external_reference: "intent:999999" });
    expect(r.status).toBe("not_found");
  });
});

describe("firma de los webhooks", () => {
  const secret = "clave-webhook";
  const firmar = (dataId, requestId, ts) =>
    crypto.createHmac("sha256", secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex");

  it("acepta la firma correcta (ts en segundos o milisegundos) y rechaza las demás", () => {
    const now = 1_790_000_000_000;
    const tsSeg = String(Math.floor(now / 1000));
    const ok = verifyWebhookSignature({ xSignature: `ts=${tsSeg},v1=${firmar("12345", "req-1", tsSeg)}`, xRequestId: "req-1", dataId: "12345" }, { secret, now });
    expect(ok).toBe(true);
    const tsMs = String(now);
    expect(verifyWebhookSignature({ xSignature: `ts=${tsMs},v1=${firmar("12345", "req-1", tsMs)}`, xRequestId: "req-1", dataId: "12345" }, { secret, now })).toBe(true);
    // Otro pago, otra clave, firma vieja o sin firma.
    expect(verifyWebhookSignature({ xSignature: `ts=${tsSeg},v1=${firmar("12345", "req-1", tsSeg)}`, xRequestId: "req-1", dataId: "99999" }, { secret, now })).toBe(false);
    expect(verifyWebhookSignature({ xSignature: `ts=${tsSeg},v1=${firmar("12345", "req-1", tsSeg)}`, xRequestId: "req-1", dataId: "12345" }, { secret: "otra", now })).toBe(false);
    expect(verifyWebhookSignature({ xSignature: `ts=${tsSeg},v1=${firmar("12345", "req-1", tsSeg)}`, xRequestId: "req-1", dataId: "12345" }, { secret, now: now + 60 * 60 * 1000 })).toBe(false);
    expect(verifyWebhookSignature({ xSignature: null, xRequestId: "req-1", dataId: "12345" }, { secret, now })).toBe(false);
  });

  it("data.id alfanumérico se firma en minúsculas", () => {
    const now = 1_790_000_000_000;
    const ts = String(Math.floor(now / 1000));
    const v1 = firmar("abc123", "r", ts);
    expect(verifyWebhookSignature({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: "r", dataId: "ABC123" }, { secret, now })).toBe(true);
  });
});

describe("diagnóstico de rechazos de la API", () => {
  it("explica los códigos típicos de configuración (2034, 2198) y el de token", () => {
    const err = (payload, status = 400) => Object.assign(new Error(payload.message || "x"), { status, payload });
    expect(describeApiError(err({ message: "Invalid users involved", cause: [{ code: 2034, description: "Invalid users involved" }] })))
      .toMatchObject({ code: "2034", message: "Invalid users involved", hint: expect.stringMatching(/MP_TEST_PAYER_EMAIL/) });
    expect(describeApiError(err({ cause: [{ code: 2198, description: "Invalid test user email" }] })).hint).toMatch(/usuario de prueba/);
    expect(describeApiError(err({ message: "invalid card token" })).hint).toMatch(/mismo ambiente/);
  });

  it("en pruebas, el correo del pagador es el del comprador de prueba", () => {
    expect(payerEmailFor("ana@x.com")).toBe("ana@x.com");
    vi.stubEnv("MP_TEST_PAYER_EMAIL", "test_user_123@testuser.com");
    expect(payerEmailFor("ana@x.com")).toBe("test_user_123@testuser.com");
  });

  it("un 4xx guarda el motivo en el intento y lo devuelve para el admin", async () => {
    const { intent, order } = await pedidoConStock();
    vi.stubEnv("MP_TEST_PAYER_EMAIL", "test_user_9@testuser.com");
    let enviado;
    const r = await payIntentWithYape({ intent, order, yapeToken: "tok" }, {
      createPayment: async (args) => {
        enviado = args;
        throw Object.assign(new Error("Invalid users involved"), { status: 400, payload: { cause: [{ code: 2034, description: "Invalid users involved" }] } });
      },
    });
    expect(enviado.email).toBe("test_user_9@testuser.com");
    expect(r).toMatchObject({ status: "rejected", detail: { code: "2034" } });
    const raw = (await query("select raw_response from payment_intents where id = $1", [intent.id])).rows[0].raw_response;
    expect(raw.mpLastError).toMatchObject({ status: 400, code: "2034", message: "Invalid users involved" });
  });
});
