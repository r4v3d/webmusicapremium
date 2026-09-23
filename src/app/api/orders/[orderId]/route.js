import { NextResponse, after } from "next/server";
import { headers } from "next/headers";
import { checkAdminAuth } from "../../../../lib/auth";
import { getCustomerSession } from "../../../../lib/libClientAuth";
import { orderAccessLevel } from "../../../../lib/orderAccess";
import { buildCheckoutView, loadOrderRow } from "../../../../lib/checkoutView";
import { recordWebDelivery } from "../../../../lib/delivery";
import { rateLimitDb } from "../../../../lib/rateLimitDb";
import { getClientIp, getClientKey, rateLimitedJson } from "../../../../lib/rateLimit";

export const dynamic = "force-dynamic";

// El checkout consulta cada 5 s: 15 min de polling son ~180 lecturas.
const READ_LIMIT = { limit: 240, windowMs: 15 * 60 * 1000 };

export async function GET(req, { params }) {
  try {
    const limited = await rateLimitDb(getClientKey(req, "order-read"), READ_LIMIT);
    if (!limited.ok) return rateLimitedJson(limited.retryAfterMs);

    const { orderId } = await params;
    const token = new URL(req.url).searchParams.get("t");
    const order = await loadOrderRow(orderId);
    const [isAdmin, sessionCustomerId] = await Promise.all([checkAdminAuth(), getCustomerSession()]);
    const access = orderAccessLevel(order, token, { isAdmin, sessionCustomerId });

    // Mismo 404 para "no existe" y "token incorrecto": no se filtra qué pedidos existen.
    if (!order || access === "none") {
      return NextResponse.json({ message: "El pedido no fue encontrado." }, { status: 404 });
    }

    const view = await buildCheckoutView(order, { access, sessionCustomerId });

    if (view.credentials && !isAdmin) {
      const h = await headers();
      const ip = getClientIp(req);
      const userAgent = h.get("user-agent");
      after(() => recordWebDelivery(orderId, { ip, userAgent }).catch((e) => console.error("recordWebDelivery:", e)));
    }

    return NextResponse.json(view, { status: 200 });
  } catch (error) {
    console.error("Fetch Order Error:", error);
    return NextResponse.json({ message: "Error interno del servidor." }, { status: 500 });
  }
}
