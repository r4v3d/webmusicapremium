// Mercado Pago · Yape con Checkout API (Perú).
//
// Flujo: el navegador pide al cliente su celular de Yape y el «código de
// aprobación» (6 dígitos que da la app de Yape), y con MercadoPago.js crea un
// token de un solo uso. El servidor cobra ese token con payment_method_id
// "yape". Yape funciona como tarjeta de débito: la respuesta es aprobado o
// rechazado en el momento, sin esperar.
//
// Variables del servidor:
//   MERCADOPAGO_ENABLED=true
//   MP_PUBLIC_KEY      (pública, va al navegador)
//   MP_ACCESS_TOKEN    (secreta, solo servidor)
//   MP_WEBHOOK_SECRET  (clave secreta de Webhooks en «Tus integraciones»)
//   SITE_URL           (p. ej. https://cheapmusic.best, para la URL de notificaciones)
//   MP_TEST_PAYER_EMAIL  (solo pruebas: correo de un comprador de prueba, p. ej.
//                         test_user_123@testuser.com; con credenciales de prueba
//                         Mercado Pago rechaza correos reales y el del vendedor)
import crypto from "node:crypto";

const API = "https://api.mercadopago.com";

function cfg() {
  return {
    accessToken: process.env.MP_ACCESS_TOKEN || "",
    publicKey: process.env.MP_PUBLIC_KEY || "",
    webhookSecret: process.env.MP_WEBHOOK_SECRET || "",
    siteUrl: (process.env.SITE_URL || "https://cheapmusic.best").replace(/\/+$/, ""),
  };
}

export function mercadoPagoPublicKey() {
  return cfg().publicKey;
}

export function mercadoPagoConfigured() {
  const c = cfg();
  return Boolean(c.accessToken && c.publicKey);
}

async function mpFetch(method, path, body = null, { idempotencyKey = null, fetchImpl = fetch } = {}) {
  const { accessToken } = cfg();
  if (!accessToken) throw Object.assign(new Error("Falta MP_ACCESS_TOKEN en el servidor."), { status: 500 });
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(json?.message || `Mercado Pago ${res.status}`);
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

/**
 * Cobra un token de Yape. externalReference ata el pago al intento («intent:123»):
 * así el webhook y la consulta de respaldo saben a qué pedido pertenece.
 */
export function createYapePayment({ token, amount, description, email, externalReference, idempotencyKey, metadata = {} }, { fetchImpl } = {}) {
  return mpFetch("POST", "/v1/payments", {
    token,
    transaction_amount: Math.round(Number(amount) * 100) / 100,
    description,
    installments: 1,
    payment_method_id: "yape",
    payer: { email },
    external_reference: externalReference,
    notification_url: `${cfg().siteUrl}/api/webhooks/mercadopago`,
    metadata,
  }, { idempotencyKey, fetchImpl });
}

export function getMercadoPagoPayment(paymentId, { fetchImpl } = {}) {
  return mpFetch("GET", `/v1/payments/${encodeURIComponent(paymentId)}`, null, { fetchImpl });
}

/** Pagos de un intento (por external_reference), el más nuevo primero. */
export async function searchPaymentsByReference(externalReference, { fetchImpl } = {}) {
  const qs = new URLSearchParams({ external_reference: externalReference, sort: "date_created", criteria: "desc", limit: "10" });
  const json = await mpFetch("GET", `/v1/payments/search?${qs}`, null, { fetchImpl });
  return json?.results || [];
}

export function intentReference(intentId) {
  return `intent:${intentId}`;
}

export function intentIdFromReference(ref) {
  const m = /^intent:(\d+)$/.exec(String(ref || ""));
  return m ? m[1] : null;
}

/**
 * Firma de los webhooks (header x-signature = "ts=...,v1=..."). Manifiesto:
 * «id:{data.id};request-id:{x-request-id};ts:{ts};», HMAC-SHA256 en hex con la
 * clave secreta de Webhooks. data.id alfanumérico va en minúsculas.
 */
export function verifyWebhookSignature({ xSignature, xRequestId, dataId }, { secret = cfg().webhookSecret, now = Date.now(), maxAgeMs = 10 * 60 * 1000 } = {}) {
  if (!secret || !xSignature) return false;
  let ts = null;
  let v1 = null;
  for (const part of String(xSignature).split(",")) {
    const [k, ...rest] = part.split("=");
    const v = rest.join("=").trim();
    if (k?.trim() === "ts") ts = v;
    else if (k?.trim() === "v1") v1 = v;
  }
  if (!ts || !v1) return false;
  // ts viene en milisegundos o en segundos según la versión: se aceptan ambos.
  const tsMs = Number(ts) > 1e12 ? Number(ts) : Number(ts) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(now - tsMs) > maxAgeMs) return false;

  let manifest = "";
  if (dataId) manifest += `id:${String(dataId).toLowerCase()};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Correo del pagador. En pruebas (MP_TEST_PAYER_EMAIL) se usa el del comprador
 * de prueba: Mercado Pago no acepta correos reales con credenciales de prueba.
 */
export function payerEmailFor(orderEmail) {
  return text(process.env.MP_TEST_PAYER_EMAIL) || orderEmail;
}

function text(v) {
  return v == null ? "" : String(v).trim();
}

/**
 * Por qué Mercado Pago rechazó la petición (4xx), para el admin y el registro.
 * { code, message, hint }: hint explica qué revisar en la configuración.
 */
export function describeApiError(error) {
  const p = error?.payload || {};
  const cause = Array.isArray(p.cause) ? p.cause[0] : null;
  const code = String(cause?.code ?? p.code ?? p.error ?? error?.status ?? "");
  const message = String(cause?.description || p.message || error?.message || "");
  const hints = {
    2034: "Credenciales y comprador de ambientes distintos. Con credenciales de PRUEBA usa un comprador de prueba (MP_TEST_PAYER_EMAIL=…@testuser.com); con credenciales de PRODUCCIÓN, un correo real distinto al tuyo.",
    2198: "Con credenciales de prueba el correo del pagador debe ser de un usuario de prueba: pon MP_TEST_PAYER_EMAIL en el servidor.",
    4390: "El pagador no puede ser el mismo vendedor: prueba con otro correo (o con un comprador de prueba).",
    3003: "Token de Yape inválido o vencido: genera un código de aprobación nuevo.",
    2006: "Token de Yape inválido o vencido: genera un código de aprobación nuevo.",
    4033: "Monto inválido para Yape.",
  };
  const hint = hints[code] || (/token/i.test(message) ? "El token de Yape no sirve (vencido o de otra Public Key): revisa que MP_PUBLIC_KEY y MP_ACCESS_TOKEN sean del mismo ambiente." : "");
  return { code, message, hint };
}

/** Motivo de rechazo en palabras del cliente. */
export function rejectionMessage(statusDetail) {
  const messages = {
    cc_rejected_call_for_authorize: "Yape no autorizó el pago. Genera un código de aprobación nuevo en tu app e inténtalo otra vez.",
    cc_rejected_insufficient_amount: "Tu Yape no tiene saldo suficiente para este pago.",
    cc_rejected_card_type_not_allowed: "Tu cuenta de Yape no permite este tipo de pago.",
    cc_rejected_max_attempts: "Superaste los intentos permitidos. Espera unos minutos y genera un código nuevo.",
    cc_rejected_bad_filled_security_code: "El código de aprobación no es correcto o ya venció. Genera uno nuevo en tu app de Yape.",
    cc_rejected_form_error: "Revisa tu número de celular y el código de aprobación.",
    cc_rejected_high_risk: "El pago fue rechazado por seguridad. Prueba con otro método de pago.",
    cc_rejected_duplicated_payment: "Ya hiciste un pago igual hace un momento. Revisa tu Yape antes de intentarlo de nuevo.",
  };
  return messages[statusDetail] || "Yape rechazó el pago. Genera un código de aprobación nuevo e inténtalo otra vez, o usa otro método.";
}
