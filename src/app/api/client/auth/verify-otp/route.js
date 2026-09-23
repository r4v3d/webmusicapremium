import { NextResponse } from "next/server";
import { query } from "../../../../../lib/pg";
import { otpCodesMatch, setCustomerSession } from "../../../../../lib/libClientAuth";
import { rateLimitDb } from "../../../../../lib/rateLimitDb";
import { getClientKey, rateLimitedJson } from "../../../../../lib/rateLimit";

export async function POST(req) {
  try {
    const limited = await rateLimitDb(getClientKey(req, "verify-otp"), { limit: 8, windowMs: 15 * 60 * 1000 });
    if (!limited.ok) {
      return rateLimitedJson(limited.retryAfterMs, "Demasiados intentos de código. Espera unos minutos.");
    }

    const { customerId, otpCode } = await req.json();
    if (!customerId || !otpCode) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    // Además del límite por IP, 5 intentos por cliente: un OTP de 6 dígitos no resiste fuerza bruta distribuida.
    const perCustomer = await rateLimitDb(`otp-verify:${customerId}`, { limit: 5, windowMs: 15 * 60 * 1000 });
    if (!perCustomer.ok) {
      return rateLimitedJson(perCustomer.retryAfterMs, "Demasiados intentos. Solicita un código nuevo en unos minutos.");
    }

    const { rows } = await query("select * from customer_auth where customer_id = $1", [customerId]);
    const authRecord = rows[0];

    if (!authRecord) {
      return NextResponse.json({ error: "Sesión no iniciada o inválida" }, { status: 400 });
    }

    const isCodeMatch = otpCodesMatch(authRecord.otp_code, otpCode);
    const isExpired = new Date(authRecord.otp_expires_at) < new Date();

    if (!isCodeMatch) {
      return NextResponse.json({ error: "Código de verificación incorrecto" }, { status: 400 });
    }

    if (isExpired) {
      return NextResponse.json({ error: "El código ha expirado. Solicita uno nuevo." }, { status: 400 });
    }

    await query(
      "update customer_auth set otp_code = null, otp_expires_at = null, updated_at = now() where customer_id = $1",
      [customerId]
    );

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
