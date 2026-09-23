export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../../lib/auth";
import { deliverOrder } from "../../../../../lib/delivery";
import { completePaidOrder } from "../../../../../lib/settle";

// Reenvío de credenciales sin volver a cobrar ni reasignar (§14.3). Si el pedido
// se pagó sin stock, primero completa la entrega con un cupo nuevo (§22).
export async function POST(req) {
  try {
    if (!(await checkAdminAuth())) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ message: "Falta el pedido." }, { status: 400 });

    let fulfilled = null;
    const done = await completePaidOrder(orderId);
    if (done.ok) fulfilled = done;
    else if (done.status === "no_stock") {
      return NextResponse.json({ message: "Sigue sin haber stock de este servicio. Importa cupos primero." }, { status: 409 });
    }

    const r = await deliverOrder(orderId, { resend: !fulfilled, performedBy: "admin" });
    if (!r.ok && r.reason) {
      const reasons = { not_paid: "El pedido no está pagado.", no_credentials: "El pedido no tiene credenciales asignadas.", not_found: "Pedido no encontrado." };
      return NextResponse.json({ message: reasons[r.reason] || "No se pudo reenviar." }, { status: 409 });
    }
    const channels = r.channels?.length ? r.channels.join(" y ") : null;
    return NextResponse.json({
      success: Boolean(r.ok),
      message: channels
        ? `${fulfilled ? "Entrega completada" : "Credenciales reenviadas"} por ${channels}.`
        : r.pendingWeb
        ? "Sin correo ni Telegram configurados: el cliente verá las credenciales al abrir su checkout."
        : `No se pudo entregar: ${(r.errors || []).join(" | ")}`,
    }, { status: r.ok ? 200 : 502 });
  } catch (error) {
    console.error("Resend error:", error);
    return NextResponse.json({ message: `Error al reenviar: ${error.message}` }, { status: 500 });
  }
}
