import { NextResponse } from "next/server";
import { query } from "../../../../../lib/pg";
import { getCustomerSession, hashPin } from "../../../../../lib/libClientAuth";

export async function POST(req) {
  try {
    // Validate session
    const customerId = await getCustomerSession();
    if (!customerId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { pin } = await req.json();
    if (!pin) {
      return NextResponse.json({ error: "PIN requerido" }, { status: 400 });
    }

    // Validate 6 digit numeric PIN
    const isNumeric = /^\d{6}$/.test(pin);
    if (!isNumeric) {
      return NextResponse.json({ error: "El PIN debe tener exactamente 6 dígitos numéricos" }, { status: 400 });
    }

    const pinHash = await hashPin(pin);

    await query(
      `insert into customer_auth(customer_id, pin_hash, updated_at) values ($1, $2, now())
       on conflict (customer_id) do update set pin_hash = excluded.pin_hash, updated_at = now()`,
      [customerId, pinHash]
    );

    return NextResponse.json({
      success: true,
      message: "PIN actualizado correctamente"
    });
  } catch (error) {
    console.error("Set PIN error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
