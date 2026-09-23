import { NextResponse } from "next/server";
import crypto from "crypto";
import { query } from "../../../../../lib/pg";
import { sendOTPEmail } from "../../../../../lib/email";
import { hashOtp } from "../../../../../lib/pinOtp";
import { rateLimitDb } from "../../../../../lib/rateLimitDb";
import { getClientKey, rateLimitedJson } from "../../../../../lib/rateLimit";

export async function POST(req) {
  try {
    const ipLimited = await rateLimitDb(getClientKey(req, "request-otp"), { limit: 5, windowMs: 15 * 60 * 1000 });
    if (!ipLimited.ok) {
      return rateLimitedJson(ipLimited.retryAfterMs, "Demasiadas solicitudes de código. Espera unos minutos.");
    }

    const { identifier } = await req.json();
    if (!identifier) {
      return NextResponse.json({ error: "Identificador requerido" }, { status: 400 });
    }

    const trimInput = identifier.trim();
    const identLimited = await rateLimitDb(`otp-id:${trimInput.toLowerCase()}`, { limit: 3, windowMs: 15 * 60 * 1000 });
    if (!identLimited.ok) {
      return rateLimitedJson(identLimited.retryAfterMs, "Demasiadas solicitudes de código para esta cuenta. Espera unos minutos.");
    }

    let cleanPhone = trimInput.replace(/\D/g, "");
    let cleanEmail = trimInput.toLowerCase();
    const isEmail = trimInput.includes("@");

    // Search contacts by phone or email
    const { rows: contacts } = isEmail
      ? await query(
          "select customer_id from customer_contacts where contact_type = 'email' and normalized_value = $1 order by id limit 1",
          [cleanEmail]
        )
      : await query(
          "select customer_id from customer_contacts where contact_type = 'whatsapp' and normalized_value = $1 order by is_primary desc, id limit 1",
          [cleanPhone]
        );

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({
        error: "No registrado",
        message: "No encontramos ninguna cuenta activa asociada a este correo o WhatsApp. Por favor, contáctanos para registrarte."
      }, { status: 404 });
    }

    const customerId = contacts[0].customer_id;

    // Fetch the client's registered emails to send the OTP
    const { rows: emailContacts } = await query(
      "select contact_value from customer_contacts where customer_id = $1 and contact_type = 'email' order by is_primary desc, id",
      [customerId]
    );

    // Pick target email: if the client used email to log in, use that. Otherwise, pick their first registered email.
    let targetEmail = "";
    if (isEmail) {
      targetEmail = cleanEmail;
    } else if (emailContacts && emailContacts.length > 0) {
      targetEmail = emailContacts[0].contact_value;
    }

    if (!targetEmail) {
      return NextResponse.json({
        error: "Sin correo registrado",
        message: "Tu cuenta de cliente está registrada con WhatsApp pero no tiene un correo de contacto configurado para recibir el código. Por favor escríbenos para agregarlo."
      }, { status: 400 });
    }

    // Generate a 6-digit OTP code
    const otpCode = crypto.randomInt(100000, 1000000).toString();

    await query(
      `insert into customer_auth(customer_id, otp_code, otp_expires_at, updated_at)
       values ($1, $2, now() + interval '10 minutes', now())
       on conflict (customer_id) do update
         set otp_code = excluded.otp_code, otp_expires_at = excluded.otp_expires_at, updated_at = now()`,
      [customerId, hashOtp(otpCode)]
    );

    // Send email with OTP code
    const emailResult = await sendOTPEmail(targetEmail, otpCode);
    let debugOtp = null;

    if (!emailResult.success) {
      console.warn("Could not send OTP email:", emailResult.message);
      
      // Local development fallback when SMTP is not configured
      if (process.env.NODE_ENV === "development") {
        debugOtp = otpCode;
      } else {
        // Production mode with EMAIL_USER set: treat SMTP failure as a hard error
        let errorMsg = "No se pudo enviar el correo de verificación. ";
        if (emailResult.error === "SMTP_NOT_CONFIGURED") {
          errorMsg += "Las credenciales de correo (EMAIL_USER y EMAIL_PASS) no están configuradas en el servidor.";
        } else {
          errorMsg += `Detalle del error SMTP: ${emailResult.message}. Asegúrate de usar una contraseña de aplicación (App Password) de Gmail si usas una cuenta de Gmail.`;
        }
        return NextResponse.json({
          error: "Error de correo",
          message: errorMsg
        }, { status: 500 });
      }
    }

    // Check if the user already has a PIN
    const { rows: authRows } = await query("select pin_hash from customer_auth where customer_id = $1", [customerId]);
    const authRecord = authRows[0];

    const hasPin = !!authRecord?.pin_hash;

    // Mask email for security display (e.g. jo***@gmail.com)
    const [name, domain] = targetEmail.split("@");
    const maskedEmail = name.length > 2 ? `${name.substring(0, 2)}***@${domain}` : `***@${domain}`;

    return NextResponse.json({
      success: true,
      customerId,
      maskedEmail,
      hasPin,
      debugOtp
    });
  } catch (error) {
    console.error("Request OTP error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
