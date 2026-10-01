// Flow (flow.cl) · QR interoperable (Yape, Plin y apps de bancos) en Perú.
//
// Flujo: el servidor crea el pago en Flow (payment/create) y el cliente va a la
// página de Flow con el QR. Al pagar, Flow avisa a urlConfirmation (POST con
// token) y devuelve al cliente a urlReturn. En ambos casos el estado real se
// consulta con payment/getStatus firmado: nunca se confía en lo que llega.
//
// Variables del servidor:
//   FLOW_ENABLED=true
//   FLOW_API_KEY, FLOW_SECRET_KEY   (Integraciones → API en el panel de Flow)
//   FLOW_BASE_URL       (por defecto https://www.flow.cl/api; pruebas: https://sandbox.flow.cl/api)
//   FLOW_PAYMENT_METHOD (por defecto 169 = QR interoperable; 9 = todos los medios activos)
//   SITE_URL            (p. ej. https://cheapmusic.best)
import crypto from "node:crypto";

function cfg() {
  return {
    base: (process.env.FLOW_BASE_URL || "https://www.flow.cl/api").replace(/\/+$/, ""),
    apiKey: process.env.FLOW_API_KEY || "",
    secret: process.env.FLOW_SECRET_KEY || "",
    paymentMethod: process.env.FLOW_PAYMENT_METHOD || "169",
    siteUrl: (process.env.SITE_URL || "https://cheapmusic.best").replace(/\/+$/, ""),
  };
}

export function flowConfigured() {
  const c = cfg();
  return Boolean(c.apiKey && c.secret);
}

/**
 * Firma de Flow: parámetros ordenados por nombre, concatenados como
 * «nombre1valor1nombre2valor2…» (sin «s»), HMAC-SHA256 en hex con la secretKey.
 */
export function signParams(params, secret = cfg().secret) {
  const keys = Object.keys(params).filter((k) => k !== "s" && params[k] !== undefined && params[k] !== null).sort();
  const toSign = keys.map((k) => `${k}${params[k]}`).join("");
  return crypto.createHmac("sha256", secret).update(toSign).digest("hex");
}

async function flowRequest(method, path, params, { fetchImpl = fetch } = {}) {
  const c = cfg();
  if (!c.apiKey || !c.secret) throw Object.assign(new Error("Faltan FLOW_API_KEY y FLOW_SECRET_KEY en el servidor."), { status: 500 });
  const all = { ...params, apiKey: c.apiKey };
  for (const k of Object.keys(all)) if (all[k] === undefined || all[k] === null) delete all[k];
  const body = new URLSearchParams({ ...Object.fromEntries(Object.entries(all).map(([k, v]) => [k, String(v)])), s: signParams(all, c.secret) });
  const url = method === "GET" ? `${c.base}${path}?${body}` : `${c.base}${path}`;
  const res = await fetchImpl(url, {
    method,
    ...(method === "GET" ? {} : { headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(json?.message || `Flow ${res.status}`);
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

export function flowCommerceOrder(intentId) {
  return `intent-${intentId}`;
}

export function intentIdFromCommerceOrder(commerceOrder) {
  const m = /^intent-(\d+)$/.exec(String(commerceOrder || ""));
  return m ? m[1] : null;
}

/** URL a la que se manda al cliente para pagar (la página de Flow con el QR). */
export function checkoutUrlFrom(created) {
  return created?.url && created?.token ? `${created.url}?token=${encodeURIComponent(created.token)}` : null;
}

/**
 * Crea el pago en Flow. Montos en PEN con 2 decimales. timeoutSeconds: cuánto
 * vive la orden en Flow (igual que la reserva del cupo).
 */
export function createFlowPayment({ intentId, amount, subject, email, timeoutSeconds }, { fetchImpl } = {}) {
  const c = cfg();
  return flowRequest("POST", "/payment/create", {
    commerceOrder: flowCommerceOrder(intentId),
    subject,
    currency: "PEN",
    amount: Number(amount).toFixed(2),
    email,
    paymentMethod: c.paymentMethod,
    urlConfirmation: `${c.siteUrl}/api/webhooks/flow`,
    urlReturn: `${c.siteUrl}/api/payments/flow/return`,
    timeout: timeoutSeconds ? Math.max(60, Math.round(timeoutSeconds)) : undefined,
  }, { fetchImpl });
}

export function getFlowStatus(token, { fetchImpl } = {}) {
  return flowRequest("GET", "/payment/getStatus", { token }, { fetchImpl });
}

export function getFlowStatusByCommerceId(commerceId, { fetchImpl } = {}) {
  return flowRequest("GET", "/payment/getStatusByCommerceId", { commerceId }, { fetchImpl });
}

/** Estados de Flow: 1 pendiente, 2 pagada, 3 rechazada, 4 anulada. */
export const FLOW_STATUS = { PENDING: 1, PAID: 2, REJECTED: 3, CANCELLED: 4 };
