import { NextResponse } from "next/server";
import crypto from "crypto";
import { getCustomerSession } from "../../../../lib/libClientAuth";
import { createOrder, getClientById, getOrderById } from "../../../../lib/db";
import { findPlan } from "../../../../lib/catalog";
import { newAccessToken } from "../../../../lib/orderAccess";
import { query } from "../../../../lib/pg";
import { rateLimitDb } from "../../../../lib/rateLimitDb";
import { rateLimitedJson } from "../../../../lib/rateLimit";

export const dynamic = "force-dynamic";

// Renovación desde el panel del cliente. Reemplaza el viejo reporte con
// comprobante (/api/client/renew): se crea un pedido de renovación que pasa por
// el mismo checkout, los mismos intentos y la misma liquidación.
export async function POST(req) {
  try {
    const customerId = await getCustomerSession();
    if (!customerId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const limited = await rateLimitDb(`renewal-order:${customerId}`, { limit: 6, windowMs: 10 * 60 * 1000 });
    if (!limited.ok) return rateLimitedJson(limited.retryAfterMs);

    const { subscriptionId, planId, currency = "PEN" } = await req.json();
    if (!subscriptionId || !planId || !["PEN", "USDT"].includes(currency)) {
      return NextResponse.json({ error: "Datos incompletos." }, { status: 400 });
    }

    const subRes = await query("select * from subscriptions where id = $1 and customer_id = $2", [subscriptionId, customerId]);
    const sub = subRes.rows[0];
    if (!sub) return NextResponse.json({ error: "Suscripción no válida." }, { status: 404 });

    const plan = findPlan(sub.platform_code, planId);
    if (!plan) return NextResponse.json({ error: "Plan no válido para este servicio." }, { status: 400 });

    // Si ya hay una renovación abierta de esta suscripción, se reutiliza.
    const open = await query(
      `select order_id, access_token from orders
        where renew_subscription_id = $1 and customer_id = $2 and plan_id = $3 and pay_currency = $4
          and status in ('pending','awaiting_payment','underpaid')
        order by created_at desc limit 1`,
      [subscriptionId, customerId, plan.id, currency]
    );
    if (open.rows[0]) {
      const { order_id, access_token } = open.rows[0];
      return NextResponse.json({ orderId: order_id, checkoutUrl: `/checkout/${order_id}?t=${access_token}` });
    }

    const client = await getClientById(customerId);
    let orderId = null;
    for (let attempt = 0; attempt < 8 && !orderId; attempt++) {
      const candidate = `MPB-${crypto.randomInt(100000, 1000000)}`;
      if (!(await getOrderById(candidate))) orderId = candidate;
    }
    if (!orderId) return NextResponse.json({ error: "Inténtalo de nuevo." }, { status: 500 });

    const accessToken = newAccessToken();
    await createOrder({
      orderId,
      service: sub.platform_code,
      planId: plan.id,
      duration: plan.duration,
      pricePen: `S/ ${plan.pricePen.toFixed(2)}`,
      priceUsd: plan.priceUsdt.toFixed(2),
      amountPen: plan.pricePen,
      amountUsdt: plan.priceUsdt,
      payCurrency: currency,
      fullName: client?.nickname || "Cliente",
      email: client?.usedEmails?.[0] || null,
      whatsapp: client?.currentWhatsApp || null,
      status: "pending",
      customerId,
      salesChannel: "web",
      accessToken,
      renewSubscriptionId: sub.id,
    });

    return NextResponse.json({ orderId, checkoutUrl: `/checkout/${orderId}?t=${accessToken}` }, { status: 201 });
  } catch (error) {
    console.error("Renewal order error:", error);
    return NextResponse.json({ error: "No se pudo iniciar la renovación." }, { status: 500 });
  }
}
