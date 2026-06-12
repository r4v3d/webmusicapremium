import { NextResponse } from "next/server";
import { supabase } from "../../../../../lib/db";
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

    const pinHash = hashPin(pin);

    // Update PIN in database using a lock-friendly UPDATE
    const { data, error: updateError } = await supabase
      .from("customer_auth")
      .update({
        pin_hash: pinHash,
        updated_at: new Date().toISOString()
      })
      .eq("customer_id", customerId)
      .select();

    if (updateError) throw updateError;

    // Fallback: If no row was updated (extremely rare), insert it
    if (!data || data.length === 0) {
      const { error: insertError } = await supabase
        .from("customer_auth")
        .insert({
          customer_id: customerId,
          pin_hash: pinHash,
          updated_at: new Date().toISOString()
        });
      if (insertError) throw insertError;
    }

    return NextResponse.json({
      success: true,
      message: "PIN actualizado correctamente"
    });
  } catch (error) {
    console.error("Set PIN error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
