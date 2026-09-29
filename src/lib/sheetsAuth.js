// Firma de los mensajes entre el servidor y la hoja de Google (Apps Script).
// HMAC-SHA256 de "<timestamp>.<cuerpo>" con GOOGLE_SHEETS_SECRET, que solo
// conocen el servidor y las propiedades del script. El repo es público: el
// secreto nunca va en el código.
import crypto from "node:crypto";
import { query } from "./pg";
import { safeEqual } from "./cryptoEqual";

const MAX_SKEW_MS = 5 * 60 * 1000;

export function sheetsSecret() {
  const secret = process.env.GOOGLE_SHEETS_SECRET || "";
  return secret.length >= 32 ? secret : null;
}

/** URL de la app web del script: a donde el worker empuja los cambios del panel. */
export function sheetsWebAppUrl() {
  const url = process.env.GOOGLE_SHEETS_WEBAPP_URL || "";
  return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url) ? url : null;
}

export function sheetsPushConfigured() {
  return Boolean(sheetsSecret() && sheetsWebAppUrl());
}

export function signSheets(timestamp, body, secret = sheetsSecret()) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");
}

/**
 * Verifica una petición de la hoja. Rechaza firmas malas, relojes desfasados
 * más de 5 minutos y la misma firma usada dos veces.
 */
export async function verifySheetsRequest({ timestamp, signature, body, now = Date.now() }) {
  const secret = sheetsSecret();
  if (!secret) return { ok: false, reason: "not_configured" };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_MS) return { ok: false, reason: "stale" };
  const sig = String(signature || "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sig) || !safeEqual(sig, signSheets(ts, body, secret))) return { ok: false, reason: "bad_signature" };

  // Uso único: la firma queda registrada hasta que la purga diaria de rate_limits la borre.
  const res = await query(
    `insert into rate_limits(bucket, window_start, hits) values ($1, to_timestamp($2 / 1000.0), 1)
     on conflict (bucket, window_start) do nothing returning hits`,
    [`sheets-sig:${sig}`, ts]
  );
  if (res.rowCount === 0) return { ok: false, reason: "replay" };
  return { ok: true };
}
