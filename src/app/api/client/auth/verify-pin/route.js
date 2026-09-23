import { NextResponse } from "next/server";
import { query } from "../../../../../lib/pg";
import { hashPin, setCustomerSession, verifyPin } from "../../../../../lib/libClientAuth";
import { isLegacyPinHash } from "../../../../../lib/pinOtp";
import { rateLimitDb } from "../../../../../lib/rateLimitDb";
import { getClientKey, rateLimitedJson } from "../../../../../lib/rateLimit";

export async function POST(req) {
  try {
    const limited = await rateLimitDb(getClientKey(req, "verify-pin"), { limit: 8, windowMs: 15 * 60 * 1000 });
    if (!limited.ok) {
      return rateLimitedJson(limited.retryAfterMs, "Demasiados intentos de PIN. Espera unos minutos.");
    }

    const { customerId, pin } = await req.json();
    if (!customerId || !pin) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    if (pin.length !== 6) {
      return NextResponse.json({ error: "El PIN debe tener 6 dígitos" }, { status: 400 });
    }

    const pinLimited = await rateLimitDb(`pin:${customerId}`, { limit: 5, windowMs: 15 * 60 * 1000 });
    if (!pinLimited.ok) {
      return rateLimitedJson(pinLimited.retryAfterMs, "PIN bloqueado temporalmente por demasiados intentos.");
    }

    const { rows } = await query("select pin_hash from customer_auth where customer_id = $1", [customerId]);
    const authRecord = rows[0];

    if (!authRecord || !authRecord.pin_hash) {
      return NextResponse.json({ error: "No tienes un PIN configurado. Ingresa mediante código OTP." }, { status: 400 });
    }

    const matches = await verifyPin(pin, authRecord.pin_hash);
    if (!matches) {
      return NextResponse.json({ error: "PIN incorrecto" }, { status: 400 });
    }

    if (isLegacyPinHash(authRecord.pin_hash)) {
      const upgraded = await hashPin(pin);
      await query("update customer_auth set pin_hash = $2, updated_at = now() where customer_id = $1", [customerId, upgraded]);
    }

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
