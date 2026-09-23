export const dynamic = "force-dynamic";

import { NextResponse, after } from "next/server";
import { checkAdminAuth } from "../../../../../lib/auth";
import { adminConfirmPayment, adminDismissIntent } from "../../../../../lib/adminPayments";
import { deliverOrder } from "../../../../../lib/delivery";
import { formatMoney } from "../../../../../lib/ledger";
import { notifyCustomer } from "../../../../../lib/notify";

const MESSAGES = {
  reference_required: "Escribe el número de operación que ves en tu app (mínimo 4 caracteres).",
  invalid_amount: "El monto recibido no es válido.",
  not_found: "No se encontró el pago o el pedido.",
  no_price: "El pedido no tiene precio en su moneda.",
  currency_mismatch: "La moneda no coincide con la del pedido.",
  already_paid: "Ese pago ya estaba confirmado.",
  has_partial_payment: "Tiene un pago parcial registrado: no se puede descartar. Reembólsalo al saldo desde Pedidos.",
  no_customer: "La recarga no tiene cliente asociado.",
};

// Confirmar (o descartar) un Yape/Plin que verificaste en tu propia app (§11.1 punto 4).
// Ejecuta el mismo settlePayment() que un webhook: nadie transcribe fechas ni credenciales.
export async function POST(req) {
  try {
    if (!(await checkAdminAuth())) return NextResponse.json({ message: "No autorizado." }, { status: 401 });

    const { action = "confirm", intentId, orderId, amountReceived, reference, reason } = await req.json();

    if (action === "dismiss") {
      if (!intentId) return NextResponse.json({ message: "Falta el intento." }, { status: 400 });
      const r = await adminDismissIntent(intentId, { reason });
      if (!r.ok) return NextResponse.json({ message: MESSAGES[r.status] || "No se pudo descartar." }, { status: 409 });
      return NextResponse.json({ success: true, message: "Marcado como no recibido. El cupo quedó libre." });
    }

    if (!intentId && !orderId) return NextResponse.json({ message: "Falta el pago o el pedido." }, { status: 400 });
    const r = await adminConfirmPayment({ intentId, orderId, amount: amountReceived, reference });

    if (!r.ok && r.status !== "duplicate") {
      return NextResponse.json({ message: MESSAGES[r.status] || "No se pudo confirmar.", code: r.status }, { status: 400 });
    }

    let message;
    switch (r.status) {
      case "settled":
        message = r.renewal ? `Renovación confirmada hasta el ${r.renewalDate}.` : `Pago confirmado. Credenciales entregadas al cliente.`;
        if (r.excess > 0) message += ` Excedente de ${formatMoney(r.excess, r.currency)} abonado a su saldo.`;
        if (r.orderId) after(() => deliverOrder(r.orderId).catch((e) => console.error("deliverOrder:", e)));
        break;
      case "needs_manual":
        message = "Pago registrado, pero NO hay stock. Importa cupos y usa «Completar entrega».";
        break;
      case "underpaid":
        message = `Pago parcial registrado: faltan ${formatMoney(r.missing, r.currency)}. No se entregó nada.`;
        break;
      case "credited":
        after(() => notifyCustomer(r.customerId, `✅ Se acreditaron <b>${formatMoney(r.amount, r.currency)}</b> a tu saldo.`));
        message = r.duplicatePayment
          ? `El pedido ya estaba pagado: ${formatMoney(r.amount, r.currency)} abonados al saldo del cliente.`
          : `Recarga acreditada: ${formatMoney(r.amount, r.currency)}.`;
        break;
      case "duplicate":
        message = "Ese número de operación ya se usó en otro pago. No se registró nada nuevo.";
        break;
      default:
        message = "Procesado.";
    }
    return NextResponse.json({ success: r.status !== "duplicate", status: r.status, message, orderId: r.orderId, credentials: r.credentials || null });
  } catch (error) {
    console.error("Confirm manual error:", error);
    return NextResponse.json({ message: `Error al confirmar: ${error.message}` }, { status: 500 });
  }
}
