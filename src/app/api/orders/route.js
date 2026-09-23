import { NextResponse } from "next/server";
import crypto from "crypto";
import { createOrder, getOrderById } from "../../../lib/db";
import { findPlan } from "../../../lib/catalog";
import { newAccessToken } from "../../../lib/orderAccess";
import { getCustomerSession } from "../../../lib/libClientAuth";
import { rateLimitDb } from "../../../lib/rateLimitDb";
import { getClientKey, rateLimitedJson } from "../../../lib/rateLimit";
import { CONFIG } from "../../../data/config";

export const dynamic = "force-dynamic";

// Compatibilidad con el formulario anterior, que mandaba el método en vez de la moneda.
const LEGACY_METHOD_CURRENCY = { yape_plin: "PEN", binance_pay: "USDT" };

export async function POST(req) {
  try {
    const limited = await rateLimitDb(getClientKey(req, "create-order"), { limit: 8, windowMs: 10 * 60 * 1000 });
    if (!limited.ok) {
      return rateLimitedJson(limited.retryAfterMs, "Has creado demasiados pedidos seguidos. Espera unos minutos.");
    }

    const body = await req.json();
    const { service, planId, fullName, email, whatsapp } = body;
    const currency = body.currency || LEGACY_METHOD_CURRENCY[body.paymentMethod] || "PEN";

    if (!service || !planId || !fullName || !email || !whatsapp) {
      return NextResponse.json({ message: "Faltan campos requeridos en el formulario." }, { status: 400 });
    }
    if (!CONFIG.services[service]) {
      return NextResponse.json({ message: "Servicio no válido." }, { status: 400 });
    }
    if (!["PEN", "USDT"].includes(currency)) {
      return NextResponse.json({ message: "Moneda no válida." }, { status: 400 });
    }

    // El precio sale del catálogo del servidor. Lo que mande el navegador se ignora.
    const plan = findPlan(service, planId);
    if (!plan) {
      return NextResponse.json({ message: "Plan no válido." }, { status: 400 });
    }

    let orderId = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = `MPB-${crypto.randomInt(100000, 1000000)}`;
      if (!(await getOrderById(candidate))) {
        orderId = candidate;
        break;
      }
    }
    if (!orderId) {
      return NextResponse.json({ message: "No se pudo generar un ID de pedido. Inténtalo de nuevo." }, { status: 500 });
    }

    const accessToken = newAccessToken();
    const sessionCustomerId = await getCustomerSession();

    await createOrder({
      orderId,
      service,
      planId: plan.id,
      duration: plan.duration,
      pricePen: `S/ ${plan.pricePen.toFixed(2)}`,
      priceUsd: plan.priceUsdt.toFixed(2),
      amountPen: plan.pricePen,
      amountUsdt: plan.priceUsdt,
      payCurrency: currency,
      fullName: String(fullName).trim().slice(0, 120),
      email: String(email).trim().toLowerCase().slice(0, 160),
      whatsapp: String(whatsapp).trim().slice(0, 40),
      paymentMethod: null,
      status: "pending",
      customerId: sessionCustomerId,
      salesChannel: "web",
      accessToken,
    });

    return NextResponse.json(
      { orderId, accessToken, checkoutUrl: `/checkout/${orderId}?t=${accessToken}`, message: "Pedido creado con éxito." },
      { status: 201 }
    );
  } catch (error) {
    console.error("Order Creation Error:", error);
    return NextResponse.json({ message: "Error interno al crear el pedido." }, { status: 500 });
  }
}
