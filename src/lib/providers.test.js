import { describe, expect, it } from "vitest";
import { availableProviders, defaultProvider } from "./providers";
import { computeFee, normalizeAmount } from "./ledger";
import { matchTransaction, normalizeNote, truncate3 } from "./binanceAccount";
import { signRequest, verifyWebhookSignature } from "./taypi";
import { extractNoteCodes } from "./providerSync";
import { resolveSlotCredentials } from "./credentials";
import { nextRetryDelayMinutes } from "./delivery";
import { orderAccessLevel } from "./orderAccess";
import crypto from "node:crypto";

describe("providers", () => {
  it("TAYPI apagado por defecto; al activarlo es el proveedor por defecto en soles", () => {
    expect(availableProviders("PEN", {}).map((p) => p.id)).toEqual(["manual_yape", "wallet_pen"]);
    expect(defaultProvider("PEN", {}).id).toBe("manual_yape");
    const env = { TAYPI_ENABLED: "true", MANUAL_YAPE_ENABLED: "false" };
    expect(availableProviders("PEN", env).map((p) => p.id)).toEqual(["taypi", "wallet_pen"]);
    expect(defaultProvider("PEN", env).id).toBe("taypi");
    expect(defaultProvider("USDT", {}).id).toBe("binance_account");
  });

  it("WALLET_ENABLED=false quita el saldo en ambas monedas", () => {
    expect(availableProviders(null, { WALLET_ENABLED: "false" }).map((p) => p.id)).toEqual(["manual_yape", "binance_account"]);
  });
});

describe("ledger", () => {
  it("comisión TAYPI exacta en los cuatro precios y cero en el resto", () => {
    expect([6, 9, 25, 45].map((p) => computeFee("taypi", p, "PEN"))).toEqual([0.41, 0.5, 0.97, 1.56]);
    for (const provider of ["manual_yape", "binance_account", "wallet_pen", "wallet_usdt", "admin_manual"]) {
      expect(computeFee(provider, 25, "PEN")).toBe(0);
    }
    expect(computeFee("taypi", 25, "USDT")).toBe(0);
  });

  it("USDT se trunca a 3 decimales y nunca redondea a favor del cliente", () => {
    expect(normalizeAmount(1.23999, "USDT")).toBe(1.239);
    expect(truncate3(0.7009)).toBe(0.7);
    expect(normalizeAmount(6.005, "PEN")).toBe(6.01);
  });
});

describe("binance", () => {
  const intent = { id: 7, note_code: "MPB123456", created_at: "2026-09-23T10:00:00Z", expires_at: "2026-09-23T11:00:00Z", customer_id: 3, binance_payer_id: null };
  const customer = { id: 9, wallet_note_code: "SALDO-ABCDE", binance_payer_id: "111" };
  const maps = () => ({ intentsByNote: new Map([["MPB123456", intent]]), customersByNote: new Map([["SALDOABCDE", customer]]) });
  const at = (iso) => new Date(iso).getTime();

  it("normaliza la nota y encuentra el código dentro del texto", () => {
    expect(normalizeNote(" mpb-123 456 ")).toBe("MPB123456");
    expect(extractNoteCodes("pago mpb-123456 gracias!")).toEqual(["MPB123456"]);
    expect(extractNoteCodes("saldo-abcde")).toEqual(["SALDOABCDE"]);
  });

  it("empareja por nota dentro de la ventana del intento", () => {
    const d = matchTransaction({ currency: "USDT", amount: "1.7999", note: "MPB-123456", transactionTime: at("2026-09-23T10:20:00Z") }, maps());
    expect(d).toMatchObject({ action: "apply_intent", amount: 1.799 });
  });

  it("rechaza moneda distinta, montos salientes, transacciones consumidas y pagos viejos", () => {
    expect(matchTransaction({ currency: "BUSD", amount: 5, note: "MPB123456" }, maps()).action).toBe("ignore");
    expect(matchTransaction({ currency: "USDT", amount: -5, note: "MPB123456" }, maps()).action).toBe("ignore");
    expect(matchTransaction({ currency: "USDT", amount: 5, note: "MPB123456" }, { ...maps(), alreadyConsumed: true }).action).toBe("ignore");
    const old = matchTransaction({ currency: "USDT", amount: 5, note: "MPB123456", transactionTime: at("2026-09-22T10:00:00Z") }, maps());
    expect(old).toMatchObject({ action: "mismatch", reason: "outside_window" });
  });

  it("una nota que no es de nadie queda sin emparejar; el código de saldo recarga", () => {
    expect(matchTransaction({ currency: "USDT", amount: 5, note: "MPB999999" }, maps()).action).toBe("unmatched");
    expect(matchTransaction({ currency: "USDT", amount: 5, note: "saldo abcde", payerInfo: { binanceId: 111 } }, maps())).toMatchObject({ action: "topup", amount: 5 });
    expect(matchTransaction({ currency: "USDT", amount: 5, note: "SALDOABCDE", payerInfo: { binanceId: 222 } }, maps())).toMatchObject({ action: "mismatch", reason: "payer_mismatch" });
  });
});

describe("taypi", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ payment_id: "p1", status: "completed", reference: "MPB-123456", note: "ñandú ☕" });
  const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const now = 1_790_000_000_000;

  it("acepta la firma correcta sobre el cuerpo crudo, con UTF-8", () => {
    expect(verifyWebhookSignature(body, sig, String(now / 1000), { secret, now })).toBe(true);
  });

  it("rechaza firma alterada, cuerpo alterado y timestamp viejo", () => {
    expect(verifyWebhookSignature(body, sig.replace(/.$/, "0"), null, { secret, now })).toBe(false);
    expect(verifyWebhookSignature(body.replace("completed", "expired"), sig, null, { secret, now })).toBe(false);
    expect(verifyWebhookSignature(body, sig, String(now / 1000 - 301), { secret, now })).toBe(false);
    expect(verifyWebhookSignature(body, "", null, { secret, now })).toBe(false);
  });

  it("firma las peticiones con timestamp + método + ruta + cuerpo", () => {
    const expected = crypto.createHmac("sha256", "sk").update("123POST/api/v1/payments{}").digest("hex");
    expect(signRequest("sk", "123", "POST", "/api/v1/payments", "{}")).toBe(expected);
  });
});

describe("entrega", () => {
  it("resuelve la credencial según email_type", () => {
    const account = { account_email: "master@x.com", account_password: "mp" };
    expect(resolveSlotCredentials({ email_type: "admin", member_email: "m@x.com", member_password: "p" }, account)).toEqual({ email: "master@x.com", password: "p" });
    expect(resolveSlotCredentials({ email_type: "customer", member_email: "m@x.com", member_password: "p" }, account)).toEqual({ email: "m@x.com", password: "p" });
    expect(resolveSlotCredentials({ email_type: "customer", member_email: "", member_password: "" }, account)).toEqual({ email: "master@x.com", password: "mp" });
    expect(resolveSlotCredentials({ email_type: "admin" }, null)).toEqual({ email: "", password: "" });
  });

  it("reintenta con espera creciente y se detiene tras el quinto fallo", () => {
    expect([0, 1, 2, 3, 4, 5].map(nextRetryDelayMinutes)).toEqual([1, 5, 15, 60, 60, null]);
  });

  it("solo el token correcto, el dueño o el admin ven el pedido completo", () => {
    const order = { access_token: "tok123", customer_id: 5 };
    expect(orderAccessLevel(order, "tok123")).toBe("full");
    expect(orderAccessLevel(order, "nope")).toBe("none");
    expect(orderAccessLevel(order, null, { sessionCustomerId: 5 })).toBe("full");
    expect(orderAccessLevel(order, null, { sessionCustomerId: 6 })).toBe("none");
    expect(orderAccessLevel(order, null, { isAdmin: true })).toBe("full");
    expect(orderAccessLevel({ access_token: null }, null)).toBe("limited");
  });
});
