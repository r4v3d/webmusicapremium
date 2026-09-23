// TAYPI (§11.3–11.5). Construido y probado, apagado con TAYPI_ENABLED=false
// hasta tener la API. Pendiente de confirmar con soporte: qué clave va en
// Authorization (TAYPI_AUTH_KEY lo deja configurable) y si el webhook envía
// Taypi-Timestamp.
import crypto from "node:crypto";

function cfg() {
  return {
    base: process.env.TAYPI_BASE_URL || "https://sandbox.taypi.pe",
    secret: process.env.TAYPI_SECRET_KEY || "",
    authKey: process.env.TAYPI_AUTH_KEY || process.env.TAYPI_SECRET_KEY || "",
    webhookSecret: process.env.TAYPI_WEBHOOK_SECRET || "",
  };
}

export function signRequest(secret, timestamp, method, path, body) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}${method}${path}${body}`).digest("hex");
}

async function taypiFetch(method, path, bodyObj = null, { idempotencyKey = null } = {}) {
  const { base, secret, authKey } = cfg();
  const body = bodyObj ? JSON.stringify(bodyObj) : "";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authKey}`,
      "Taypi-Timestamp": timestamp,
      "Taypi-Signature": signRequest(secret, timestamp, method, path, body),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    ...(bodyObj ? { body } : {}),
    signal: AbortSignal.timeout(12_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(json?.message || `TAYPI ${res.status}`);
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json?.data ?? json;
}

export function createPayment({ amountPen, reference, description, idempotencyKey }) {
  return taypiFetch("POST", "/api/v1/payments", {
    amount: Number(amountPen).toFixed(2),
    reference,
    ...(description ? { description } : {}),
  }, { idempotencyKey });
}

export function getPayment(paymentId) {
  return taypiFetch("GET", `/api/v1/payments/${encodeURIComponent(paymentId)}`);
}

/** Firma HMAC-SHA256 sobre el cuerpo CRUDO. Anti-replay de 5 minutos si llega timestamp. */
export function verifyWebhookSignature(rawBody, signatureHeader, timestampHeader, { secret = cfg().webhookSecret, now = Date.now() } = {}) {
  if (!signatureHeader || !secret) return false;
  if (timestampHeader) {
    const skew = Math.abs(now / 1000 - Number(timestampHeader));
    if (!Number.isFinite(skew) || skew > 300) return false;
  }
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signatureHeader).trim(), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
