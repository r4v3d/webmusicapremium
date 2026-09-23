export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../../lib/auth";
import { withTransaction } from "../../../../../lib/pg";
import { logEvent } from "../../../../../lib/db";
import { releaseReservation } from "../../../../../lib/reserve";

// Acciones administrativas que NO cobran: expirar o cancelar un pedido abierto.
// Para aprobar un pago se usa /api/admin/payments/confirm-manual (pasa por la liquidación).
export async function POST(req, { params }) {
  try {
    if (!(await checkAdminAuth())) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    const { id } = await params;
    const { action } = await req.json();
    const target = { expire: "expired", cancel: "cancelled" }[action];
    if (!target) return NextResponse.json({ message: "Acción inválida." }, { status: 400 });

    const r = await withTransaction(async (tx) => {
      const res = await tx.query(
        `update orders set status = $2, updated_at = now()
          where order_id = $1 and status in ('pending','awaiting_payment')
          returning order_id`,
        [id, target]
      );
      if (res.rowCount === 0) return false;
      await tx.query(
        "update payment_intents set status = 'cancelled', updated_at = now() where order_id = $1 and status in ('created','awaiting')",
        [id]
      );
      await releaseReservation(tx, id);
      await logEvent("order", id, target, null, { status: target }, `Pedido marcado como ${target} por el admin`, { tx });
      return true;
    });
    if (!r) return NextResponse.json({ message: "Solo se pueden expirar o cancelar pedidos sin pagar." }, { status: 409 });
    return NextResponse.json({ success: true, message: "Pedido actualizado." });
  } catch (error) {
    console.error("Admin order action error:", error);
    return NextResponse.json({ message: `Error: ${error.message}` }, { status: 500 });
  }
}
