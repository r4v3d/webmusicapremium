import { NextResponse, after } from "next/server";
import { authorizeCheckout, buildCheckoutView, loadOrderRow } from "../../../../../lib/checkoutView";
import { getIntentById } from "../../../../../lib/paymentIntents";
import { payIntentWithYape } from "../../../../../lib/providerSync";
import { deliverOrder } from "../../../../../lib/delivery";
import { alertAdmin } from "../../../../../lib/notify";
import { rateLimitDb } from "../../../../../lib/rateLimitDb";
import { getClientKey, rateLimitedJson } from "../../../../../lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Cobro con Yape (Mercado Pago). El navegador ya creó el token con el celular y
// el código de aprobación del cliente; aquí solo se cobra y, si Mercado Pago lo
// aprueba, se liquida el pedido al instante. Nunca se confía en montos del cliente.
export async function POST(req) {
  try {
    const limited = await rateLimitDb(getClientKey(req, "mp-yape"), { limit: 12, windowMs: 10 * 60 * 1000 });
    if (!limited.ok) return rateLimitedJson(limited.retryAfterMs, "Demasiados intentos. Espera unos minutos.");

    const { intentId, t, yapeToken } = await req.json().catch(() => ({}));
    const token = String(yapeToken || "").trim();
    if (!intentId || !token || token.length > 200) {
      return NextResponse.json({ message: "Faltan datos del pago." }, { status: 400 });
    }

    const intent = await getIntentById(intentId);
    if (!intent?.order_id) return NextResponse.json({ message: "No encontrado." }, { status: 404 });
    const auth = await authorizeCheckout(intent.order_id, t);
    if (!auth.ok) return NextResponse.json({ message: "No encontrado." }, { status: 404 });

    // Un cobro a la vez por intento: evita doble clic y reintentos simultáneos.
    const perIntent = await rateLimitDb(`mp-yape:${intent.id}`, { limit: 1, windowMs: 5_000 });
    if (!perIntent.ok) return rateLimitedJson(perIntent.retryAfterMs, "Ya estamos procesando tu pago…");

    const result = await payIntentWithYape({ intent, order: auth.order, yapeToken: token });

    if (result.status === "settled" && result.orderId) {
      after(() => deliverOrder(result.orderId).catch((e) => console.error("deliverOrder:", e)));
    }
    if (result.needsManual) {
      after(() => alertAdmin(`Pagado SIN STOCK: ${intent.order_id}`, ["Pago con Yape (Mercado Pago) confirmado sin cupo disponible."], { level: "critical" }));
    }

    const fresh = await loadOrderRow(intent.order_id);
    const view = await buildCheckoutView(fresh, { access: "full", sessionCustomerId: auth.sessionCustomerId });
    // needs_manual = cobrado pero sin cupo libre: el pago está bien, la cuenta se entrega al reponer stock.
    const ok = ["settled", "duplicate", "underpaid", "needs_manual"].includes(result.status);
    const message = !ok
      ? result.message || "No se pudo completar el pago."
      : result.status === "underpaid" ? "Recibimos un pago parcial; falta completar el monto."
      : result.status === "needs_manual" ? "¡Pago aprobado! Estamos preparando tu cuenta y te la enviamos por correo."
      : "¡Pago aprobado!";
    return NextResponse.json({ ...view, ok, message }, { status: ok || result.status === "pending" ? 200 : 402 });
  } catch (error) {
    console.error("[mercadopago] yape:", error);
    return NextResponse.json({ message: "Error interno al procesar el pago. Si Yape te descontó, espera un minuto: lo confirmamos solos." }, { status: 500 });
  }
}
