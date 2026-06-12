import { NextResponse } from "next/server";
import { supabase } from "../../../../../lib/db";
import { setCustomerSession } from "../../../../../lib/libClientAuth";

export async function POST(req) {
  try {
    const { customerId, otpCode } = await req.json();
    if (!customerId || !otpCode) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    // Retrieve auth record
    const { data: authRecord, error: fetchError } = await supabase
      .from("customer_auth")
      .select("*")
      .eq("customer_id", customerId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (!authRecord) {
      return NextResponse.json({ error: "Sesión no iniciada o inválida" }, { status: 400 });
    }

    // Verify OTP code and expiration
    const isCodeMatch = authRecord.otp_code === otpCode.trim();
    const isExpired = new Date(authRecord.otp_expires_at) < new Date();

    if (!isCodeMatch) {
      return NextResponse.json({ error: "Código de verificación incorrecto" }, { status: 400 });
    }

    if (isExpired) {
      return NextResponse.json({ error: "El código ha expirado. Solicita uno nuevo." }, { status: 400 });
    }

    // Clear OTP code to make it single-use
    await supabase
      .from("customer_auth")
      .update({
        otp_code: null,
        otp_expires_at: null,
        updated_at: new Date().toISOString()
      })
      .eq("customer_id", customerId);

    // Save session in HTTP-only cookie
    await setCustomerSession(customerId);

    return NextResponse.json({
      success: true,
      customerId
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
