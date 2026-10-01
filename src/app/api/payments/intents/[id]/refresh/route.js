import { NextResponse, after } from "next/server";
import { authorizeCheckout, buildCheckoutView, loadOrderRow } from "../../../../../../lib/checkoutView";
import { getIntentById } from "../../../../../../lib/paymentIntents";
import { query } from "../../../../../../lib/pg";
import { syncBinance, handleTaypiPayment, pollFlow, pollMercadoPago } from "../../../../../../lib/providerSync";
import { binanceConfigured } from "../../../../../../lib/binanceAccount";
import { getPayment as taypiGetPayment } from "../../../../../../lib/taypi";
import { recordEvent } from "../../../../../../lib/idempotency";
import { deliverOrder } from "../../../../../../lib/delivery";
import { alertAdmin } from "../../../../../../lib/notify";
import { rateLimitDb } from "../../../../../../lib/rateLimitDb";
import { rateLimitedJson } from "../../../../../../lib/rateLimit";
import { claimYapeIntent, cleanCode } from "../../../../../../lib/yapeNotify";

export const dynamic = "force-dynamic";

// "Ya pagué y no aparece" (§11.6 punto 6). Nunca liquida con datos del cliente:
// con TAYPI o USDT consulta al proveedor; con Yape manual avisa a la cola.
export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const { t, customerReference, securityCode, otherApp } = await req.json().catch(() => ({}));
    const intent = await getIntentById(id);
    if (!intent?.order_id) return NextResponse.json({ message: "No encontrado." }, { status: 404 });

    const auth = await authorizeCheckout(intent.order_id, t);
    if (!auth.ok) return NextResponse.json({ message: "No encontrado." }, { status: 404 });

    // Una consulta al proveedor por intento cada 20 s: el historial de Binance pesa 3000.
    const limited = await rateLimitDb(`refresh:${intent.id}`, { limit: 1, windowMs: 20_000 });
    if (!limited.ok) return rateLimitedJson(limited.retryAfterMs, "Ya lo estamos revisando. Espera unos segundos.");

    let message = "Revisando tu pago…";

    if (intent.provider === "manual_yape") {
      const reference = customerReference ? String(customerReference).trim().slice(0, 80) : null;
      if (reference) {
        await query("update payment_intents set customer_reference = $2, updated_at = now() where id = $1", [intent.id, reference]);
      }
      const nudge = await rateLimitDb(`yape-nudge:${intent.id}`, { limit: 1, windowMs: 5 * 60 * 1000 });
      if (nudge.ok) {
        after(() => alertAdmin(`El cliente dice que ya pagó: ${intent.order_id}`, [
          `Monto esperado: S/ ${Number(intent.amount_expected).toFixed(2)}`,
          reference || intent.customer_reference ? `Dato del cliente: ${reference || intent.customer_reference}` : null,
          "Verifica en tu app de Yape y confirma desde Cobros → Por verificar.",
        ]));
      }
      message = "Tu pago está en verificación. Normalmente tarda pocos minutos.";
    } else if (intent.provider === "yape_notify") {
      // El código solo ayuda a encontrar el aviso de Yape: nunca confirma un pago por sí solo.
      const code = cleanCode(securityCode);
      if (code) {
        const tries = await rateLimitDb(`yape-code:${intent.id}`, { limit: 3, windowMs: 60 * 60 * 1000 });
        if (!tries.ok) return rateLimitedJson(tries.retryAfterMs, "Demasiados intentos con el código. Ya avisamos para revisar tu pago a mano.");
      }
      if (!code && otherApp !== true) {
        const fresh = await loadOrderRow(intent.order_id);
        const view = await buildCheckoutView(fresh, { access: "full", sessionCustomerId: auth.sessionCustomerId });
        return NextResponse.json({ ...view, message: "Escribe el código de seguridad de 3 dígitos que aparece en tu constancia de Yape." });
      }
      const r = await claimYapeIntent({ intentId: intent.id, code });
      message = ["settled", "paid", "needs_manual"].includes(r.status)
        ? "¡Pago encontrado!"
        : r.status === "underpaid"
        ? "Recibimos tu Yape, pero el monto es menor al del pedido."
        : r.status === "code_used"
        ? "Ese código ya se usó en otro pago. Revisa los 3 dígitos de tu constancia; si son correctos, lo revisamos a mano y te confirmamos aquí."
        : r.status === "waiting_manual"
        ? "Lo revisamos a mano en unos minutos y te confirmamos aquí mismo."
        : "Aún no vemos un Yape de tu monto con ese código. Revisa que los 3 dígitos sean los de tu constancia. Suele llegar en segundos; si no aparece en 2 minutos lo revisamos a mano y te confirmamos aquí.";
    } else if (intent.provider === "binance_account" && binanceConfigured()) {
      const since = Math.max(Date.now() - 2 * 60 * 60 * 1000, new Date(intent.created_at).getTime() - 5 * 60 * 1000);
      const results = await syncBinance({ lookbackMs: Date.now() - since });
      for (const r of results) {
        if (r.status === "settled" && r.orderId) after(() => deliverOrder(r.orderId).catch(() => {}));
      }
      message = "Para verificar tu pago al instante, pega el Order ID que te muestra Binance y pulsa «Verificar pago».";
    } else if (intent.provider === "mercadopago_yape") {
      const results = await pollMercadoPago({ intentId: intent.id });
      for (const r of results) {
        if (r.status === "settled" && r.orderId) after(() => deliverOrder(r.orderId).catch(() => {}));
      }
      message = "Si Yape te descontó, el pago se confirma en segundos. Si no, vuelve a intentar con un código de aprobación nuevo.";
    } else if (intent.provider === "flow_qr") {
      const results = await pollFlow({ intentId: intent.id });
      for (const r of results) {
        if (r.status === "settled" && r.orderId) after(() => deliverOrder(r.orderId).catch(() => {}));
      }
      message = "Si ya pagaste el QR, se confirma en segundos. Si no, ábrelo de nuevo con el botón «Pagar con QR».";
    } else if (intent.provider === "taypi" && intent.provider_ref) {
      const payment = await taypiGetPayment(intent.provider_ref);
      const status = String(payment.status || "").toLowerCase();
      const ev = await recordEvent({ provider: "taypi", eventId: `${intent.provider_ref}:${status}`, eventType: "refresh", payload: payment, signatureValid: true });
      if (!ev.duplicate) {
        const r = await handleTaypiPayment({ ...payment, payment_id: intent.provider_ref }, { eventRowId: ev.eventRowId });
        if (r.status === "settled") after(() => deliverOrder(r.orderId).catch(() => {}));
      }
    }

    const fresh = await loadOrderRow(intent.order_id);
    const view = await buildCheckoutView(fresh, { access: "full", sessionCustomerId: auth.sessionCustomerId });
    return NextResponse.json({ ...view, message });
  } catch (error) {
    console.error("Intent refresh error:", error);
    return NextResponse.json({ message: "No pudimos consultar el pago ahora. Reintenta en un momento." }, { status: 502 });
  }
}
