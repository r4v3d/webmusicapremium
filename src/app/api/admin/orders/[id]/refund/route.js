export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../../../lib/auth";
import { refundOrderToWallet } from "../../../../../../lib/settle";
import { formatMoney } from "../../../../../../lib/ledger";

// Reembolso al saldo (§6): libera cupo, cancela suscripción, revierte el asiento.
export async function POST(req, { params }) {
  try {
    if (!(await checkAdminAuth())) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    const { id } = await params;
    const { reason = "" } = await req.json().catch(() => ({}));
    const r = await refundOrderToWallet(id, { performedBy: "admin", reason: String(reason).slice(0, 200) });
    if (!r.ok) {
      return NextResponse.json({ message: r.status === "not_found" ? "Pedido no encontrado." : `Este pedido no se puede reembolsar (estado: ${r.orderStatus}).` }, { status: 409 });
    }
    const amounts = Object.entries(r.refunded).map(([c, a]) => formatMoney(a, c)).join(" y ");
    return NextResponse.json({ success: true, message: amounts ? `Reembolsado al saldo del cliente: ${amounts}.` : "Pedido marcado como reembolsado (no tenía pagos confirmados)." });
  } catch (error) {
    console.error("Refund error:", error);
    return NextResponse.json({ message: `Error al reembolsar: ${error.message}` }, { status: 500 });
  }
}
