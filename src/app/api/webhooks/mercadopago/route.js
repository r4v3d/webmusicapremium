import { after } from "next/server";
import { getMercadoPagoPayment, verifyWebhookSignature } from "../../../../lib/mercadopago";
import { recordEvent, recordInvalidSignature } from "../../../../lib/idempotency";
import { handleMercadoPagoPayment, mpAlreadyApplied } from "../../../../lib/providerSync";
import { deliverOrder } from "../../../../lib/delivery";
import { getProvider } from "../../../../lib/providers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Webhook de Mercado Pago. El aviso solo dice «cambió el pago N»: el estado real
// se consulta a la API de Mercado Pago con nuestra clave. Con MP_WEBHOOK_SECRET
// se exige además la firma x-signature.
export async function POST(req) {
  const url = new URL(req.url);
  const raw = await req.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }

  const type = body.type || body.topic || url.searchParams.get("type") || url.searchParams.get("topic");
  const dataId = url.searchParams.get("data.id") || body?.data?.id || url.searchParams.get("id");
  if (type !== "payment" || !dataId) return Response.json({ received: true, ignored: "not_payment" });

  if (process.env.MP_WEBHOOK_SECRET) {
    const ok = verifyWebhookSignature({
      xSignature: req.headers.get("x-signature"),
      xRequestId: req.headers.get("x-request-id"),
      dataId,
    });
    if (!ok) {
      await recordInvalidSignature("mercadopago", raw, {
        signature: req.headers.get("x-signature"), requestId: req.headers.get("x-request-id"), dataId,
      }).catch(() => {});
      return Response.json({ error: "invalid_signature" }, { status: 401 });
    }
  }

  if (!getProvider("mercadopago_yape")?.enabled) return Response.json({ received: true, ignored: "disabled" });

  try {
    const payment = await getMercadoPagoPayment(dataId);
    const ev = await recordEvent({
      provider: "mercadopago", eventId: `${payment.id}:${payment.status}`, eventType: "webhook",
      payload: payment, headers: { requestId: req.headers.get("x-request-id") }, signatureValid: Boolean(process.env.MP_WEBHOOK_SECRET),
    });
    if (ev.duplicate && mpAlreadyApplied(ev.previousResult)) return Response.json({ received: true, duplicate: true });
    const result = await handleMercadoPagoPayment(payment, { eventRowId: ev.eventRowId });
    if (result.status === "settled" && result.orderId) {
      after(() => deliverOrder(result.orderId).catch((e) => console.error("deliverOrder:", e)));
    }
    return Response.json({ received: true });
  } catch (error) {
    // 500: Mercado Pago reintenta más tarde (y la consulta de respaldo también lo cubre).
    console.error("[mercadopago] webhook:", error.message);
    return Response.json({ error: "temporary" }, { status: 500 });
  }
}
