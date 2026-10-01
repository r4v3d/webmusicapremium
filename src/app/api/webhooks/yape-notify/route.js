import { safeEqual } from "../../../../lib/cryptoEqual";
import { ingestNotification, touchDevice, yapeNotifyConfig } from "../../../../lib/yapeNotify";
import { rateLimitDb } from "../../../../lib/rateLimitDb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Avisos del celular (Yape directo). Una app del teléfono (MacroDroid, Tasker…)
// reenvía aquí cada notificación de Yape. Sin el secreto no se acepta nada: es lo
// único que impide que alguien invente un «te envió un pago».
//
//   POST /api/webhooks/yape-notify
//   Authorization: Bearer <YAPE_NOTIFY_SECRET>
//   {"title": "...", "text": "...", "app": "com.bcp.innovacxion.yapeapp", "id": "...", "postedAt": 1727800000000}
//   {"ping": true}   ← señal de vida periódica (opcional)

function secretFrom(req) {
  const auth = req.headers.get("authorization") || "";
  const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1];
  return (bearer || req.headers.get("x-yape-secret") || "").trim();
}

async function readBody(req) {
  const type = req.headers.get("content-type") || "";
  const raw = await req.text().catch(() => "");
  if (type.includes("application/json") || /^\s*\{/.test(raw)) {
    try { return JSON.parse(raw); } catch { /* sigue como texto */ }
  }
  if (type.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(raw));
  return { text: raw };
}

function pick(obj, ...keys) {
  for (const k of keys) if (obj?.[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== "") return String(obj[k]);
  return "";
}

export async function POST(req) {
  const { secret } = yapeNotifyConfig();
  const given = secretFrom(req);
  if (!secret || !given || !safeEqual(given, secret)) {
    console.warn("[yape] aviso rechazado: secreto inválido");
    return Response.json({ ok: false }, { status: 403 });
  }
  // Un teléfono legítimo no manda cientos de avisos por minuto.
  const limited = await rateLimitDb("yape-notify", { limit: 120, windowMs: 60 * 1000 });
  if (!limited.ok) return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });

  const body = await readBody(req);
  if (body?.ping === true || body?.ping === "true" || pick(body, "type") === "ping") {
    await touchDevice();
    return Response.json({ ok: true, status: "pong" });
  }

  const app = pick(body, "app", "package", "packageName", "not_app");
  if (app && !/yape/i.test(app)) {
    await touchDevice();
    return Response.json({ ok: true, status: "ignored_app" });
  }

  try {
    const result = await ingestNotification({
      title: pick(body, "title", "not_title", "titulo"),
      text: pick(body, "text", "not_text", "body", "message", "mensaje", "texto"),
      notificationId: pick(body, "id", "key", "notificationId") || null,
      postedAt: pick(body, "postedAt", "time", "timestamp", "when") || null,
    });
    return Response.json({ ok: true, status: result.status, ...(result.orderId ? { orderId: result.orderId } : {}) });
  } catch (error) {
    // 500: la app del teléfono puede reintentar; el mismo aviso no se guarda dos veces.
    console.error("[yape] aviso:", error);
    return Response.json({ ok: false, error: "temporary" }, { status: 500 });
  }
}
