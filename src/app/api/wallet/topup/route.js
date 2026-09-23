import { NextResponse } from "next/server";
import { getCustomerSession } from "../../../../lib/libClientAuth";
import { createTopupIntent, intentUi } from "../../../../lib/paymentIntents";
import { defaultProvider, walletEnabled } from "../../../../lib/providers";
import { ensureWalletNoteCode } from "../../../../lib/wallet";
import { rateLimitDb } from "../../../../lib/rateLimitDb";
import { rateLimitedJson } from "../../../../lib/rateLimit";

export const dynamic = "force-dynamic";

// Recarga de monto libre (§13.1). Soles: intento que entra a la cola "Por
// verificar" (o TAYPI cuando se active). USDT: no hace falta intento, basta el
// código permanente en la nota de Binance.
export async function POST(req) {
  try {
    const customerId = await getCustomerSession();
    if (!customerId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!walletEnabled()) return NextResponse.json({ error: "El saldo no está disponible." }, { status: 404 });

    const limited = await rateLimitDb(`topup:${customerId}`, { limit: 6, windowMs: 30 * 60 * 1000 });
    if (!limited.ok) return rateLimitedJson(limited.retryAfterMs, "Tienes varias recargas pendientes. Espera a que las verifiquemos.");

    const { currency, amount, reference } = await req.json();

    if (currency === "USDT") {
      return NextResponse.json({ currency: "USDT", noteCode: await ensureWalletNoteCode(customerId) });
    }
    if (currency !== "PEN") return NextResponse.json({ error: "Moneda no válida." }, { status: 400 });

    const declared = amount === undefined || amount === "" ? null : Number(amount);
    if (declared !== null && !(declared > 0 && declared <= 5000)) {
      return NextResponse.json({ error: "Ingresa un monto válido." }, { status: 400 });
    }

    const provider = defaultProvider("PEN");
    if (!provider) return NextResponse.json({ error: "No hay métodos de recarga en soles disponibles." }, { status: 503 });

    const result = await createTopupIntent({
      customerId,
      providerId: provider.id,
      declaredAmount: declared,
      customerReference: reference ? String(reference).trim().slice(0, 80) : null,
      salesChannel: "web",
    });
    if (!result.ok) return NextResponse.json({ error: "No se pudo iniciar la recarga.", code: result.status }, { status: 400 });

    return NextResponse.json({ currency: "PEN", intent: intentUi(result.intent) });
  } catch (error) {
    console.error("Wallet topup error:", error);
    return NextResponse.json({ error: "Error interno al iniciar la recarga." }, { status: 500 });
  }
}
