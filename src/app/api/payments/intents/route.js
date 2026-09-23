import { NextResponse, after } from "next/server";
import { authorizeCheckout, buildCheckoutView, loadOrderRow } from "../../../../lib/checkoutView";
import { createIntent } from "../../../../lib/paymentIntents";
import { deliverOrder } from "../../../../lib/delivery";
import { alertAdmin } from "../../../../lib/notify";
import { rateLimitDb } from "../../../../lib/rateLimitDb";
import { getClientKey, rateLimitedJson } from "../../../../lib/rateLimit";

export const dynamic = "force-dynamic";

const MESSAGES = {
  provider_disabled: "Ese método de pago no está disponible.",
  login_required: "Inicia sesión para pagar con tu saldo.",
  no_stock: "Lo sentimos, no queda stock de este servicio. No se te cobró nada.",
  closed: "Este pedido ya no admite pagos.",
  no_price: "Este pedido no tiene precio en esa moneda.",
  provider_error: "El proveedor de pago no respondió. Intenta con otro método o en un minuto.",
  forbidden: "Este pedido pertenece a otro cliente.",
};

export async function POST(req) {
  try {
    const limited = await rateLimitDb(getClientKey(req, "create-intent"), { limit: 20, windowMs: 10 * 60 * 1000 });
    if (!limited.ok) return rateLimitedJson(limited.retryAfterMs);

    const { orderId, token, provider, customerReference } = await req.json();
    if (!orderId || !provider) {
      return NextResponse.json({ message: "Faltan datos del pago." }, { status: 400 });
    }

    const auth = await authorizeCheckout(orderId, token);
    if (!auth.ok) return NextResponse.json({ message: "El pedido no fue encontrado." }, { status: 404 });

    const result = await createIntent({
      orderId,
      providerId: provider,
      customerReference: customerReference ? String(customerReference).trim().slice(0, 80) : null,
      salesChannel: auth.order.sales_channel,
      sessionCustomerId: auth.sessionCustomerId,
    });

    if (!result.ok) {
      if (result.status === "insufficient_funds") {
        return NextResponse.json({
          message: `Tu saldo no alcanza: te faltan ${result.missing} ${result.currency === "USDT" ? "USDT" : "soles"}.`,
          code: "insufficient_funds", missing: result.missing, currency: result.currency,
        }, { status: 402 });
      }
      return NextResponse.json({ message: MESSAGES[result.status] || "No se pudo iniciar el pago.", code: result.status },
        { status: result.status === "no_stock" ? 409 : 400 });
    }

    const settle = result.settle;
    if (settle && settle.status === "settled" && !settle.duplicate) {
      after(() => deliverOrder(settle.orderId).catch((e) => console.error("deliverOrder:", e)));
    }
    if (settle?.needsManual) {
      after(() => alertAdmin(`Pagado SIN STOCK: ${orderId}`, ["Pago con saldo confirmado sin cupo disponible."], { level: "critical" }));
    }

    const fresh = await loadOrderRow(orderId);
    const view = await buildCheckoutView(fresh, { access: "full", sessionCustomerId: auth.sessionCustomerId });
    return NextResponse.json(view, { status: 200 });
  } catch (error) {
    console.error("Create intent error:", error);
    return NextResponse.json({ message: "Error interno al iniciar el pago." }, { status: 500 });
  }
}
