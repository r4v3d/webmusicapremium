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

/** El worker lo llama una vez por hora. */
export async function purgeRateLimits() {
  const res = await query("delete from rate_limits where window_start < now() - interval '1 day'");
  return res.rowCount;
}
