import { NextResponse } from "next/server";
import { getCustomerSession } from "../../../../../lib/libClientAuth";
import { query } from "../../../../../lib/pg";
import { claimYapeIntent, cleanCode } from "../../../../../lib/yapeNotify";
import { getBalances } from "../../../../../lib/wallet";
import { rateLimitDb } from "../../../../../lib/rateLimitDb";
import { rateLimitedJson } from "../../../../../lib/rateLimit";

export const dynamic = "force-dynamic";

// Recarga en soles por Yape directo: el cliente escribe el código de seguridad de
// su constancia. Solo sobre una recarga suya; el código nunca acredita por sí solo.
export async function POST(req) {
  try {
    const customerId = await getCustomerSession();
    if (!customerId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { intentId, securityCode, otherApp } = await req.json().catch(() => ({}));
    const own = await query(
      "select id from payment_intents where id = $1 and customer_id = $2 and purpose = 'wallet_topup' and provider = 'yape_notify'",
      [intentId, customerId]
    );
    if (!own.rows[0]) return NextResponse.json({ error: "Recarga no encontrada." }, { status: 404 });

    const code = cleanCode(securityCode);
    if (!code && otherApp !== true) return NextResponse.json({ error: "Escribe el código de seguridad de 3 dígitos de tu constancia de Yape." }, { status: 400 });
    const limited = await rateLimitDb(`yape-code:${intentId}`, { limit: 6, windowMs: 60 * 60 * 1000 });
    if (!limited.ok) return rateLimitedJson(limited.retryAfterMs, "Demasiados intentos. Lo revisamos a mano y se acredita en cuanto lo confirmemos.");

    const r = await claimYapeIntent({ intentId, code });
    const ok = ["credited", "paid"].includes(r.status);
    const message = ok ? "¡Recarga acreditada!"
      : r.status === "code_mismatch" ? "Recibimos un Yape por ese monto, pero con otro código. Revisa los 3 dígitos de tu constancia."
      : r.status === "waiting_manual" ? "Lo revisamos a mano y se acredita en cuanto lo confirmemos."
      : "Aún no vemos tu Yape con ese código. Suele llegar en segundos: vuelve a intentarlo en un momento.";
    return NextResponse.json({ ok, status: r.status, message, balances: await getBalances(customerId) });
  } catch (error) {
    console.error("Wallet topup yape error:", error);
    return NextResponse.json({ error: "Error interno. Intenta de nuevo." }, { status: 500 });
  }
}
