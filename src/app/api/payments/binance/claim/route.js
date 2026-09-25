import { NextResponse, after } from "next/server";
import { authorizeCheckout, buildCheckoutView, loadOrderRow } from "../../../../../lib/checkoutView";
import { getLatestIntentForOrder } from "../../../../../lib/paymentIntents";
import { binanceConfigured } from "../../../../../lib/binanceAccount";
import { claimBinanceByOrderId } from "../../../../../lib/providerSync";
import { deliverOrder } from "../../../../../lib/delivery";
import { rateLimitDb } from "../../../../../lib/rateLimitDb";
import { getClientKey, rateLimitedJson } from "../../../../../lib/rateLimit";
import { claimMessage } from "../../../../../lib/binanceClaimMessages";

export const dynamic = "force-dynamic";

// Verificación por Order ID (lo único obligatorio): el cliente pega el Order ID
// que le muestra Binance y se valida contra el historial de pagos recibidos.
export async function POST(req) {
  try {
    const { orderId, token, binanceOrderId } = await req.json();
    if (!orderId) return NextResponse.json({ message: "Falta el pedido." }, { status: 400 });

    const auth = await authorizeCheckout(orderId, token);
    if (!auth.ok) return NextResponse.json({ message: "El pedido no fue encontrado." }, { status: 404 });

    // Máximo 5 reclamos por cliente cada 10 min: evita probar Order IDs al azar.
    const bucket = auth.order.customer_id ? `claim:c:${auth.order.customer_id}` : `claim:${getClientKey(req)}`;
    const limited = await rateLimitDb(bucket, { limit: 5, windowMs: 10 * 60 * 1000 });
    if (!limited.ok) return rateLimitedJson(limited.retryAfterMs, "Demasiados intentos. Espera unos minutos.");

    if (!binanceConfigured()) {
      return NextResponse.json({ message: "La verificación automática de Binance no está disponible ahora. Escríbenos por WhatsApp." }, { status: 503 });
    }

    const intent = await getLatestIntentForOrder(orderId);
    if (!intent || intent.provider !== "binance_account") {
      return NextResponse.json({ message: "Este pedido no tiene un pago USDT abierto." }, { status: 409 });
    }

    const r = await claimBinanceByOrderId({ intentId: intent.id, binanceOrderId });
    if (r.status === "settled" && r.orderId) after(() => deliverOrder(r.orderId).catch(() => {}));

    const { key, message } = claimMessage(r);
    const fresh = await loadOrderRow(orderId);
    const view = await buildCheckoutView(fresh, { access: "full", sessionCustomerId: auth.sessionCustomerId });
    return NextResponse.json(
      { ...view, message, claimStatus: key },
      { status: r.status === "not_found" || r.status === "invalid_order_id" ? 404 : 200 }
    );
  } catch (error) {
    console.error("Binance claim error:", error);
    return NextResponse.json({ message: "No pudimos consultar Binance ahora. Intenta de nuevo en un minuto." }, { status: 502 });
  }
}
