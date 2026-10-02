// Límite de tasa persistido en Postgres (§2.3 defecto 5). Ventana fija: un
// contador por (bucket, inicio de ventana). Sobrevive a reinicios y funciona
// con varios procesos. Si la base falla, cae al límite en memoria antes que
// dejar el endpoint sin protección.
import { query } from "./pg";
import { rateLimit as memoryRateLimit } from "./rateLimit";

export async function rateLimitDb(bucket, { limit, windowMs }) {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  try {
    const res = await query(
      `insert into rate_limits(bucket, window_start, hits) values ($1, to_timestamp($2 / 1000.0), 1)
       on conflict (bucket, window_start) do update set hits = rate_limits.hits + 1
       returning hits`,
      [bucket, windowStart]
    );
    const hits = res.rows[0].hits;
    if (hits > limit) return { ok: false, remaining: 0, retryAfterMs: windowStart + windowMs - now };
    return { ok: true, remaining: limit - hits, retryAfterMs: 0 };
  } catch (error) {
    console.error("[rateLimitDb] fallback a memoria:", error.message);
    return memoryRateLimit(bucket, { limit, windowMs });
  }
}

/**
 * Varios límites a la vez; devuelve el primero que se excede. Se cuentan en orden:
 * si uno falla, los siguientes no suman.
 */
export async function rateLimitAll(checks) {
  for (const [bucket, opts] of checks) {
    const r = await rateLimitDb(bucket, opts);
    if (!r.ok) return r;
  }
  return { ok: true, remaining: null, retryAfterMs: 0 };
}

/**
 * En Perú los datos móviles salen por IPs compartidas (CGNAT): cientos de clientes
 * pueden tener la misma IP. Por eso lo importante se limita por pedido o por
 * cliente, y por IP solo queda un tope alto contra bots.
 */
const MIN = 60 * 1000;
export const LIMITS = {
  orderCreateIp: { limit: 120, windowMs: 10 * MIN },
  orderCreateContact: { limit: 8, windowMs: 10 * MIN },
  // El checkout consulta cada 5 s: ~180 lecturas en 15 min por pestaña.
  orderReadIp: { limit: 5000, windowMs: 15 * MIN },
  orderReadPerOrder: { limit: 600, windowMs: 15 * MIN },
  // Pedidos que no existen o con token incorrecto: así no se pueden adivinar.
  orderMissIp: { limit: 60, windowMs: 15 * MIN },
  intentCreateIp: { limit: 300, windowMs: 10 * MIN },
  intentCreatePerOrder: { limit: 20, windowMs: 10 * MIN },
  intentReadIp: { limit: 5000, windowMs: 15 * MIN },
  intentReadPerIntent: { limit: 600, windowMs: 15 * MIN },
  mpYapeIp: { limit: 200, windowMs: 10 * MIN },
  mpYapePerIntent: { limit: 12, windowMs: 10 * MIN },
  // Acceso de clientes: la protección fuerte es por cuenta (3–5 intentos); por IP, tope alto.
  otpRequestIp: { limit: 30, windowMs: 15 * MIN },
  otpVerifyIp: { limit: 40, windowMs: 15 * MIN },
  pinVerifyIp: { limit: 40, windowMs: 15 * MIN },
};

/** El worker lo llama una vez por hora. */
export async function purgeRateLimits() {
  const res = await query("delete from rate_limits where window_start < now() - interval '1 day'");
  return res.rowCount;
}
