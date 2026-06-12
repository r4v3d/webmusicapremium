import { NextResponse } from "next/server";
import { supabase } from "../../../../../lib/db";
import { hashPin, setCustomerSession } from "../../../../../lib/libClientAuth";

export async function POST(req) {
  try {
    const { customerId, pin } = await req.json();
    if (!customerId || !pin) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    if (pin.length !== 6) {
      return NextResponse.json({ error: "El PIN debe tener 6 dígitos" }, { status: 400 });
    }

    // Retrieve auth record
    const { data: authRecord, error: fetchError } = await supabase
      .from("customer_auth")
      .select("pin_hash")
      .eq("customer_id", customerId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (!authRecord || !authRecord.pin_hash) {
      return NextResponse.json({ error: "No tienes un PIN configurado. Ingresa mediante código OTP." }, { status: 400 });
    }

    // Hash the input pin and compare
    const inputPinHash = hashPin(pin);
    if (authRecord.pin_hash !== inputPinHash) {
      return NextResponse.json({ error: "PIN incorrecto" }, { status: 400 });
    }

    // Set cookie session
    await setCustomerSession(customerId);

    return NextResponse.json({
      success: true,
      customerId
    });
  } catch (error) {
    console.error("Verify PIN error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
