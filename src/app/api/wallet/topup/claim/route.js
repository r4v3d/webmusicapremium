import { NextResponse } from "next/server";
import { getCustomerSession } from "../../../../../lib/libClientAuth";
import { getOrCreateBinanceTopupIntent } from "../../../../../lib/paymentIntents";
import { binanceConfigured } from "../../../../../lib/binanceAccount";
import { claimBinanceByOrderId } from "../../../../../lib/providerSync";
import { claimMessage } from "../../../../../lib/binanceClaimMessages";
import { getBalances } from "../../../../../lib/wallet";
import { walletEnabled } from "../../../../../lib/providers";
import { rateLimitDb } from "../../../../../lib/rateLimitDb";
import { rateLimitedJson } from "../../../../../lib/rateLimit";

export const dynamic = "force-dynamic";

// Recarga USDT de monto libre: el cliente pagó al Pay ID y pega el Order ID.
// Se acredita lo que llegó (truncado a 3 decimales). No hace falta nota.
export async function POST(req) {
  try {
    const customerId = await getCustomerSession();
    if (!customerId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!walletEnabled()) return NextResponse.json({ error: "El saldo no está disponible." }, { status: 404 });

    const limited = await rateLimitDb(`claim:c:${customerId}`, { limit: 5, windowMs: 10 * 60 * 1000 });
    if (!limited.ok) return rateLimitedJson(limited.retryAfterMs, "Demasiados intentos. Espera unos minutos.");

    if (!binanceConfigured()) {
      return NextResponse.json({ error: "La verificación automática de Binance no está disponible ahora." }, { status: 503 });
    }

    const { binanceOrderId } = await req.json();
    // Siempre sobre un intento del propio cliente: nunca se acredita a otro.
    const intent = await getOrCreateBinanceTopupIntent({ customerId, salesChannel: "web" });
    const r = await claimBinanceByOrderId({ intentId: intent.id, binanceOrderId });
    const { key, message } = claimMessage(r, { topup: true });

    return NextResponse.json(
      { ok: r.status === "credited", status: key, message, balances: await getBalances(customerId) },
      { status: r.status === "credited" || r.status === "duplicate" ? 200 : r.status === "not_found" ? 404 : 400 }
    );
  } catch (error) {
    console.error("Wallet topup claim error:", error);
    return NextResponse.json({ error: "No pudimos consultar Binance ahora. Intenta de nuevo en un minuto." }, { status: 502 });
  }
}
