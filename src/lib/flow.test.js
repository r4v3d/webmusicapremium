import crypto from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../test/pgliteDb";
import { createFamilyAccount, createMemberProfile, createOrder } from "./db";
import { createIntent } from "./paymentIntents";
import { availableProviders, defaultProvider, getProvider } from "./providers";
import { handleFlowStatus, pollFlow, syncFlowIntentByToken } from "./providerSync";
import { flowCommerceOrder, signParams } from "./flow";
import { query } from "./pg";

let db;
beforeAll(async () => { db = await createTestDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.reset();
  vi.stubEnv("FLOW_ENABLED", "true");
  vi.stubEnv("FLOW_API_KEY", "API-KEY-1");
  vi.stubEnv("FLOW_SECRET_KEY", "secreto-flow");
  vi.stubEnv("SITE_URL", "https://cheapmusic.best");
  vi.stubEnv("MERCADOPAGO_ENABLED", "false");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

let seq = 0;
async function pedido() {
  const acc = await createFamilyAccount({ service: "tidal", masterEmail: `master${++seq}@x.com`, password: "mpass" });
  await createMemberProfile({ familyAccountId: acc.id, slotNumber: 1, status: "free", memberEmail: `m${seq}@x.com`, memberPassword: "p1", emailType: "customer" });
  const orderId = `MPB-${300000 + seq}`;
  await createOrder({
    orderId, fullName: "Ana", email: "ana@x.com", whatsapp: "51999000111", service: "tidal", duration: "1 Mes",
    planId: "tidal-1m", amountPen: 6, amountUsdt: 1.79, payCurrency: "PEN", paymentMethod: "flow_qr",
  });
  return orderId;
}

/** Flow falso: guarda lo que se le pidió y responde como la API real. */
let ultimoCommerceOrder = null;
function flowFalso({ estado = 1, monto = 6 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const isGet = !init?.body;
    const params = isGet ? Object.fromEntries(new URL(url).searchParams) : Object.fromEntries(new URLSearchParams(init.body));
    calls.push({ url: url.split("?")[0], params });
    if (url.includes("/payment/create")) {
      ultimoCommerceOrder = params.commerceOrder;
      return new Response(JSON.stringify({ url: "https://www.flow.cl/app/web/pay.php", token: `TOK${seq}`, flowOrder: 9000 + seq }), { status: 200 });
    }
    if (url.includes("/payment/getStatus")) {
      const commerceOrder = ultimoCommerceOrder;
      return new Response(JSON.stringify({
        flowOrder: 9000 + seq, commerceOrder, status: estado, amount: 6, currency: "PEN",
        paymentData: estado === 2 ? { amount: monto, currency: "PEN", media: "QR" } : {},
      }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  };
  vi.stubGlobal("fetch", fetchImpl);
  return calls;
}

describe("firma de Flow", () => {
  it("ordena los parámetros y firma «nombrevalor…» con HMAC-SHA256 (ejemplo de la documentación)", () => {
    const params = { currency: "CLP", apiKey: "XXXX-XXXX-XXXX", amount: 5000 };
    const esperado = crypto.createHmac("sha256", "k").update("amount5000apiKeyXXXX-XXXX-XXXXcurrencyCLP").digest("hex");
    expect(signParams(params, "k")).toBe(esperado);
    expect(signParams({ ...params, s: "ignorado" }, "k")).toBe(esperado);
  });
});

describe("proveedor QR de Flow", () => {
  it("se ofrece solo con sus claves; se enciende y apaga independiente de Mercado Pago", () => {
    expect(getProvider("flow_qr").enabled).toBe(true);
    expect(defaultProvider("PEN").id).toBe("flow_qr");
    vi.stubEnv("FLOW_SECRET_KEY", "");
    expect(getProvider("flow_qr").enabled).toBe(false);
    vi.stubEnv("FLOW_SECRET_KEY", "secreto-flow");
    vi.stubEnv("MERCADOPAGO_ENABLED", "true");
    vi.stubEnv("MP_PUBLIC_KEY", "pk");
    vi.stubEnv("MP_ACCESS_TOKEN", "at");
    expect(availableProviders("PEN").map((p) => p.id)).toEqual(expect.arrayContaining(["flow_qr", "mercadopago_yape"]));
  });

  it("al elegir QR crea el pago en Flow (método 169, PEN, URLs de la tienda) y guarda el enlace de pago", async () => {
    const orderId = await pedido();
    const calls = flowFalso();
    const r = await createIntent({ orderId, providerId: "flow_qr" });
    expect(r.ok).toBe(true);
    expect(r.intent).toMatchObject({ status: "awaiting", provider_ref: `TOK${seq}` });
    expect(r.intent.checkout_url).toBe(`https://www.flow.cl/app/web/pay.php?token=TOK${seq}`);
    const p = calls[0].params;
    expect(p).toMatchObject({
      commerceOrder: flowCommerceOrder(r.intent.id), currency: "PEN", amount: "6.00", email: "ana@x.com", paymentMethod: "169",
      urlConfirmation: "https://cheapmusic.best/api/webhooks/flow", urlReturn: "https://cheapmusic.best/api/payments/flow/return",
      apiKey: "API-KEY-1",
    });
    const { s, ...sinFirma } = p;
    expect(s).toBe(signParams(sinFirma, "secreto-flow"));
  });

  it("pagada (2) liquida el pedido una sola vez; pendiente (1) no hace nada", async () => {
    const orderId = await pedido();
    flowFalso({ estado: 1 });
    const { intent } = await createIntent({ orderId, providerId: "flow_qr" });
    expect((await syncFlowIntentByToken(intent.provider_ref)).status).toBe("pending");
    expect((await query("select status from orders where order_id = $1", [orderId])).rows[0].status).toBe("awaiting_payment");

    flowFalso({ estado: 2 });
    const r = await syncFlowIntentByToken(intent.provider_ref, { eventType: "confirmation" });
    expect(r.status).toBe("settled");
    expect((await query("select status from orders where order_id = $1", [orderId])).rows[0].status).toBe("paid");
    // El regreso del cliente y el respaldo del worker no lo cobran dos veces.
    expect((await syncFlowIntentByToken(intent.provider_ref, { eventType: "return" })).status).toBe("duplicate");
    expect(await pollFlow()).toEqual([]);
  });

  it("rechazada (3) cierra el intento para pedir un QR nuevo; un monto menor queda como parcial", async () => {
    const orderId = await pedido();
    flowFalso({ estado: 3 });
    const { intent } = await createIntent({ orderId, providerId: "flow_qr" });
    expect((await syncFlowIntentByToken(intent.provider_ref)).status).toBe("closed");
    expect((await query("select status from payment_intents where id = $1", [intent.id])).rows[0].status).toBe("failed");

    const otro = await pedido();
    flowFalso({ estado: 2, monto: 4 });
    const i2 = (await createIntent({ orderId: otro, providerId: "flow_qr" })).intent;
    expect((await syncFlowIntentByToken(i2.provider_ref)).status).toBe("underpaid");
  });

  it("un estado de otro comercio o sin intento no liquida nada", async () => {
    const r = await handleFlowStatus({ flowOrder: 1, commerceOrder: "pedido-ajeno", status: 2, amount: 6, currency: "PEN" });
    expect(r.status).toBe("not_found");
  });

  it("si Flow no responde al crear, el intento queda fallido y el cliente puede reintentar", async () => {
    const orderId = await pedido();
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ message: "Invalid apiKey" }), { status: 401 }));
    const r = await createIntent({ orderId, providerId: "flow_qr" });
    expect(r).toMatchObject({ ok: false, status: "provider_error" });
  });
});
