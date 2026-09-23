import { NextResponse, after } from "next/server";
import { authorizeCheckout, buildCheckoutView, loadOrderRow } from "../../../../../lib/checkoutView";
import { getLatestIntentForOrder } from "../../../../../lib/paymentIntents";
import { binanceConfigured, getPayTransactions } from "../../../../../lib/binanceAccount";
import { processBinanceTransactions } from "../../../../../lib/providerSync";
import { deliverOrder } from "../../../../../lib/delivery";
import { rateLimitDb } from "../../../../../lib/rateLimitDb";
import { getClientKey, rateLimitedJson } from "../../../../../lib/rateLimit";

export const dynamic = "force-dynamic";

// Reclamo asistido (§12.2): el cliente pega el Order ID de Binance para no
// esperar al worker. Solo dispara la consulta al historial; las reglas de
// §12.1 (nota, monto, ventana, transacción no consumida) se aplican igual.
export async function POST(req) {
  try {
    const { orderId, token, binanceOrderId } = await req.json();
    const txnId = String(binanceOrderId || "").replace(/\D/g, "");
    if (!orderId || txnId.length < 8) {
      return NextResponse.json({ message: "Pega el Order ID completo que te muestra Binance." }, { status: 400 });
    }

    const auth = await authorizeCheckout(orderId, token);
    if (!auth.ok) return NextResponse.json({ message: "El pedido no fue encontrado." }, { status: 404 });

    // Máximo 5 reclamos por cliente cada 10 min (fuerza bruta de Order IDs).
    const bucket = auth.order.customer_id ? `claim:c:${auth.order.customer_id}` : `claim:${getClientKey(req)}`;
    const limited = await rateLimitDb(bucket, { limit: 5, windowMs: 10 * 60 * 1000 });
    if (!limited.ok) return rateLimitedJson(limited.retryAfterMs, "Demasiados intentos. Espera unos minutos.");

    if (!binanceConfigured()) {
      return NextResponse.json({ message: "La verificación automática de Binance no está disponible ahora." }, { status: 503 });
    }

    const intent = await getLatestIntentForOrder(orderId);
    if (!intent || intent.provider !== "binance_account") {
      return NextResponse.json({ message: "Este pedido no tiene un pago USDT abierto." }, { status: 409 });
    }

    const since = new Date(intent.created_at).getTime() - 5 * 60 * 1000;
    const txs = await getPayTransactions({ startTime: since, limit: 100 });
    const tx = txs.find((t) => String(t.transactionId) === txnId || String(t.orderId || "") === txnId);
    if (!tx) {
      return NextResponse.json({ message: "No encontramos ese Order ID en los pagos recibidos. Verifica el número o espera un minuto." }, { status: 404 });
    }

    const [result] = await processBinanceTransactions([tx], { claimIntentId: intent.id });
    if (result?.status === "settled" && result.orderId) after(() => deliverOrder(result.orderId).catch(() => {}));

    const messages = {
      settled: "¡Pago acreditado!",
      underpaid: "Recibimos tu pago, pero el monto es menor al total. Envía la diferencia con la misma nota.",
      duplicate: "Ese pago ya fue aplicado.",
      claimed_without_note: "Encontramos el pago pero sin la nota del pedido. Lo revisaremos a mano en breve.",
      mismatch: "Encontramos el pago, pero no coincide con este pedido. Lo revisaremos a mano.",
      seen: "Ese pago ya fue procesado.",
    };
    const key = result?.status || result?.action;

    const fresh = await loadOrderRow(orderId);
    const view = await buildCheckoutView(fresh, { access: "full", sessionCustomerId: auth.sessionCustomerId });
    return NextResponse.json({ ...view, message: messages[key] || "Pago recibido. Lo estamos procesando." });
  } catch (error) {
    console.error("Binance claim error:", error);
    return NextResponse.json({ message: "No pudimos consultar Binance ahora. Tu pago se acreditará solo en el siguiente ciclo." }, { status: 502 });
  }
}
