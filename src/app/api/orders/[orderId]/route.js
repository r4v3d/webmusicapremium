import { NextResponse, after } from "next/server";
import { headers } from "next/headers";
import { checkAdminAuth } from "../../../../lib/auth";
import { getCustomerSession } from "../../../../lib/libClientAuth";
import { orderAccessLevel } from "../../../../lib/orderAccess";
import { buildCheckoutView, loadOrderRow } from "../../../../lib/checkoutView";
import { recordWebDelivery } from "../../../../lib/delivery";
import { LIMITS, rateLimitDb } from "../../../../lib/rateLimitDb";
import { getClientIp, getClientKey, rateLimitedJson } from "../../../../lib/rateLimit";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  try {
    const limited = await rateLimitDb(getClientKey(req, "order-read"), LIMITS.orderReadIp);
    if (!limited.ok) return rateLimitedJson(limited.retryAfterMs);

    const { orderId } = await params;
    const token = new URL(req.url).searchParams.get("t");
    const order = await loadOrderRow(orderId);
    const [isAdmin, sessionCustomerId] = await Promise.all([checkAdminAuth(), getCustomerSession()]);
    const access = orderAccessLevel(order, token, { isAdmin, sessionCustomerId });

    // Mismo 404 para "no existe" y "token incorrecto": no se filtra qué pedidos existen.
    if (!order || access === "none") {
      const miss = await rateLimitDb(getClientKey(req, "order-miss"), LIMITS.orderMissIp);
      if (!miss.ok) return rateLimitedJson(miss.retryAfterMs);
      return NextResponse.json({ message: "El pedido no fue encontrado." }, { status: 404 });
    }
    // Límite por pedido (el polling del checkout), no por IP: clientes que comparten IP no chocan.
    const perOrder = await rateLimitDb(`order-read:${order.order_id}`, LIMITS.orderReadPerOrder);
    if (!perOrder.ok) return rateLimitedJson(perOrder.retryAfterMs);

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
