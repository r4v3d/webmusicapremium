const buckets = new Map();

function prune(timestamps, now, windowMs) {
  return timestamps.filter((t) => now - t < windowMs);
}

/** IP del cliente. Caddy escribe X-Real-IP ya validado contra los proxies de Cloudflare; el primer valor de X-Forwarded-For lo controla el cliente. */
export function getClientIp(req) {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const forwarded = req.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0] || "unknown").trim();
}

export function getClientKey(req, extra = "") {
  const ip = getClientIp(req);
  return extra ? `${ip}:${extra}` : ip;
}

export function rateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const fresh = prune(buckets.get(key) || [], now, windowMs);
  if (fresh.length >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: windowMs - (now - fresh[0]),
    };
  }
  fresh.push(now);
  buckets.set(key, fresh);
  if (buckets.size > 5000) {
    for (const [mapKey, stamps] of buckets) {
      const kept = prune(stamps, now, windowMs);
      if (kept.length === 0) buckets.delete(mapKey);
      else buckets.set(mapKey, kept);
    }
  }
  return { ok: true, remaining: limit - fresh.length, retryAfterMs: 0 };
}

export function rateLimitedJson(retryAfterMs, message = "Demasiados intentos. Espera un momento e inténtalo de nuevo.") {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return Response.json(
    { error: "rate_limited", message },
    {
      status: 429,
      headers: { "Retry-After": String(seconds) },
    }
  );
}

/** Test helper — not used in production routes. */
export function _resetRateLimitForTests() {
  buckets.clear();
}
