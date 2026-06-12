import { NextResponse } from "next/server";
import { supabase } from "../../../../../lib/db";
import { sendOTPEmail } from "../../../../../lib/email";

export async function POST(req) {
  try {
    const { identifier } = await req.json();
    if (!identifier) {
      return NextResponse.json({ error: "Identificador requerido" }, { status: 400 });
    }

    const trimInput = identifier.trim();
    let cleanPhone = trimInput.replace(/\D/g, "");
    let cleanEmail = trimInput.toLowerCase();
    const isEmail = trimInput.includes("@");

    // Search contacts by phone or email
    let dbQuery = supabase.from("customer_contacts").select("customer_id, contact_type, contact_value");
    if (isEmail) {
      dbQuery = dbQuery.eq("contact_type", "email").eq("contact_value", cleanEmail);
    } else {
      dbQuery = dbQuery.eq("contact_type", "whatsapp").eq("normalized_value", cleanPhone);
    }

    const { data: contacts, error: contactError } = await dbQuery;
    if (contactError) throw contactError;

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({
        error: "No registrado",
        message: "No encontramos ninguna cuenta activa asociada a este correo o WhatsApp. Por favor, contáctanos para registrarte."
      }, { status: 404 });
    }

    const customerId = contacts[0].customer_id;

    // Fetch the client's registered emails to send the OTP
    const { data: emailContacts, error: emailError } = await supabase
      .from("customer_contacts")
      .select("contact_value")
      .eq("customer_id", customerId)
      .eq("contact_type", "email");

    if (emailError) throw emailError;

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
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // Upsert into customer_auth table (using service_role client from db.js)
    const { error: authError } = await supabase
      .from("customer_auth")
      .upsert({
        customer_id: customerId,
        otp_code: otpCode,
        otp_expires_at: otpExpiresAt,
        updated_at: new Date().toISOString()
      }, { onConflict: "customer_id" });

    if (authError) {
      // If table doesn't exist, we notify the admin/user that database needs migration.
      console.error("Error upserting customer_auth. Please make sure the table exists in Supabase:", authError);
      return NextResponse.json({
        error: "Error del servidor",
        message: "Error al generar el código. Si es la primera vez que usas esta función, asegúrate de haber ejecutado el script SQL en la consola de Supabase."
      }, { status: 500 });
    }

    // Send email with OTP code
    const emailResult = await sendOTPEmail(targetEmail, otpCode);
    let debugOtp = null;

    if (!emailResult.success) {
      console.warn("Could not send OTP email:", emailResult.message);
      
      // Local development or fallback when SMTP credentials are not present: return debug OTP to frontend
      if (process.env.NODE_ENV === "development" || !process.env.EMAIL_USER) {
        debugOtp = otpCode;
      } else {
        // Production mode with EMAIL_USER set: treat SMTP failure as a hard error
        let errorMsg = "No se pudo enviar el correo de verificación. ";
        if (emailResult.error === "SMTP_NOT_CONFIGURED") {
          errorMsg += "Las credenciales de correo (EMAIL_USER y EMAIL_PASS) no están configuradas en Vercel.";
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
    const { data: authRecord } = await supabase
      .from("customer_auth")
      .select("pin_hash")
      .eq("customer_id", customerId)
      .maybeSingle();

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
