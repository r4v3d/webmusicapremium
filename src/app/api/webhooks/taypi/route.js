import { after } from "next/server";
import { verifyWebhookSignature } from "../../../../lib/taypi";
import { recordEvent, recordInvalidSignature } from "../../../../lib/idempotency";
import { handleTaypiPayment } from "../../../../lib/providerSync";
import { deliverOrder } from "../../../../lib/delivery";
import { getProvider } from "../../../../lib/providers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Webhook de TAYPI (§11.5). La firma se verifica sobre el cuerpo CRUDO:
// req.text() primero, JSON.parse después.
export async function POST(req) {
  const raw = await req.text();
  const signature = req.headers.get("taypi-signature");
  const timestamp = req.headers.get("taypi-timestamp");

  if (!verifyWebhookSignature(raw, signature, timestamp)) {
    await recordInvalidSignature("taypi", raw, { signature, timestamp }).catch(() => {});
    return Response.json({ error: "invalid_signature" }, { status: 403 });
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  // Cerrojo 1: deduplicación por evento.
  const { duplicate, eventRowId } = await recordEvent({
    provider: "taypi",
    eventId: `${event.payment_id}:${event.status}`,
    eventType: event.event,
    payload: event,
    headers: { timestamp },
    signatureValid: true,
  });
  if (duplicate) return Response.json({ received: true, duplicate: true });

  if (!getProvider("taypi")?.enabled) {
    // Se registra pero no se liquida: TAYPI está apagado por configuración.
    return Response.json({ received: true, ignored: "taypi_disabled" });
  }

  const result = await handleTaypiPayment(event, { eventRowId });
  if (result.status === "settled" && result.orderId) {
    after(() => deliverOrder(result.orderId).catch((e) => console.error("deliverOrder:", e)));
  }

  // 200 siempre que la firma sea válida: el reintento ya está cubierto por la deduplicación.
  return Response.json({ received: true });
}
