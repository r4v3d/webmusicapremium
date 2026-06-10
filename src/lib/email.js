import nodemailer from "nodemailer";
import { CONFIG } from "../data/config";

// Helper to calculate the expiration date based on duration and purchase date
export function calculateExpirationDate(durationStr, purchaseDateStr) {
  // Extract number of months (e.g. "6 Meses" -> 6, "1 Mes" -> 1)
  const match = durationStr.match(/\d+/);
  const monthsToAdd = match ? parseInt(match[0]) : 1;

  const date = purchaseDateStr ? new Date(purchaseDateStr) : new Date();
  const day = date.getDate();

  // Rule: if day is 31, count as purchased on 1st of next month
  if (day === 31) {
    date.setMonth(date.getMonth() + 1);
    date.setDate(1);
  }

  date.setMonth(date.getMonth() + monthsToAdd);
  return date;
}

// Helper to format Date objects as DD/MM/YYYY
export function formatDate(date) {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

export async function sendOrderEmail(order) {
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;

  // If email credentials are not configured, skip silently
  if (!emailUser || !emailPass) {
    console.warn("SMTP email credentials (EMAIL_USER / EMAIL_PASS) not configured. Skipping email.");
    return false;
  }

  // Setup Nodemailer transporter with Gmail SMTP
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });

  // Calculate dates
  const purchaseDate = order.createdAt ? new Date(order.createdAt) : new Date();
  const expirationDate = calculateExpirationDate(order.duration, order.createdAt);

  const formattedPurchaseDate = formatDate(purchaseDate);
  const formattedExpirationDate = formatDate(expirationDate);

  // Platform specific colors and names
  const serviceConfig = CONFIG.services[order.service] || {
    name: order.service.toUpperCase(),
    accentColor: "#d4af37",
  };
  const accentColor = serviceConfig.accentColor;

  // Split account credentials if formatted as email:password
  let credentialsHtml = "";
  if (order.assignedAccount) {
    if (order.assignedAccount.includes(":")) {
      const parts = order.assignedAccount.split(":");
      const username = parts[0].trim();
      const password = parts.slice(1).join(":").trim();
      credentialsHtml = `
        <div style="background-color: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #9ca3af; font-size: 14px; width: 100px;">Correo:</td>
              <td style="padding: 6px 0; font-family: monospace; font-size: 16px; color: #ffffff; font-weight: bold; word-break: break-all;">${username}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #9ca3af; font-size: 14px;">Contraseña:</td>
              <td style="padding: 6px 0; font-family: monospace; font-size: 16px; color: ${accentColor}; font-weight: bold; word-break: break-all;">${password}</td>
            </tr>
          </table>
        </div>
      `;
    } else {
      credentialsHtml = `
        <div style="background-color: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 20px; margin-bottom: 24px; text-align: center;">
          <span style="display: block; color: #9ca3af; font-size: 14px; margin-bottom: 6px;">Código / Cuenta de Acceso:</span>
          <code style="font-family: monospace; font-size: 18px; color: ${accentColor}; font-weight: bold; display: block; word-break: break-all;">${order.assignedAccount}</code>
        </div>
      `;
    }
  } else {
    // Fallback if no stock was available at time of approval
    credentialsHtml = `
      <div style="background-color: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.15); border-radius: 8px; padding: 20px; margin-bottom: 24px; text-align: center; color: #ef4444;">
        <span style="display: block; font-size: 14px; font-weight: bold; margin-bottom: 6px;">Entrega en Proceso</span>
        <p style="margin: 0; font-size: 13px; color: #9ca3af; line-height: 1.5;">Tu cuenta está siendo preparada. En unos minutos te enviaremos las credenciales directamente a tu WhatsApp o correo electrónico.</p>
      </div>
    `;
  }

  // HTML Email Template
  const emailHtml = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Tu Cuenta Premium</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #08080a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f3f4f6; -webkit-font-smoothing: antialiased;">
      <table style="width: 100%; background-color: #08080a; padding: 40px 20px;" border="0" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <table style="max-width: 600px; margin: 0 auto; background-color: #0f0f13; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 40px; box-shadow: 0 8px 30px rgba(0,0,0,0.6);" border="0" cellpadding="0" cellspacing="0">
              
              <!-- Brand Header -->
              <tr>
                <td style="text-align: center; padding-bottom: 30px;">
                  <div style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px;">
                    <span style="width: 8px; height: 8px; background-color: ${accentColor}; border-radius: 50%; display: inline-block;"></span>
                    Música Premium Barato
                  </div>
                </td>
              </tr>

              <!-- Greeting & Status -->
              <tr>
                <td style="padding-bottom: 24px;">
                  <h1 style="margin: 0 0 10px 0; font-size: 24px; font-weight: 700; color: #ffffff; text-align: center;">¡Gracias por tu compra, ${order.fullName}!</h1>
                  <p style="margin: 0; font-size: 15px; color: #9ca3af; text-align: center; line-height: 1.5;">Tu pago ha sido verificado y aprobado con éxito. Aquí tienes los detalles de tu cuenta premium.</p>
                </td>
              </tr>

              <!-- Platform Banner -->
              <tr>
                <td style="padding-bottom: 24px;">
                  <div style="text-align: center; padding: 12px; background: linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px;">
                    <span style="font-size: 13px; text-transform: uppercase; font-weight: 700; letter-spacing: 1px; color: ${accentColor};">Servicio Contratado</span>
                    <h2 style="margin: 6px 0 0 0; font-size: 22px; font-weight: 800; color: #ffffff;">${serviceConfig.name} Premium</h2>
                  </div>
                </td>
              </tr>

              <!-- Credentials Box -->
              <tr>
                <td>
                  ${credentialsHtml}
                </td>
              </tr>

              <!-- Order & Validity Info -->
              <tr>
                <td style="padding-bottom: 30px;">
                  <table style="width: 100%; background-color: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; font-size: 14px;" cellpadding="12">
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                      <td style="color: #9ca3af;">ID de Orden:</td>
                      <td style="text-align: right; color: #ffffff; font-weight: 600;">#${order.orderId}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                      <td style="color: #9ca3af;">Fecha de Compra:</td>
                      <td style="text-align: right; color: #ffffff; font-weight: 600;">${formattedPurchaseDate}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                      <td style="color: #9ca3af;">Periodo Adquirido:</td>
                      <td style="text-align: right; color: ${accentColor}; font-weight: 600;">${order.duration}</td>
                    </tr>
                    <tr>
                      <td style="color: #9ca3af; font-weight: bold;">Fecha de Vencimiento:</td>
                      <td style="text-align: right; color: #ffffff; font-weight: bold; font-size: 15px;">${formattedExpirationDate}</td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Call to Action (Support Channel) -->
              <tr>
                <td style="text-align: center; padding-bottom: 30px;">
                  <span style="font-size: 14px; color: #9ca3af; display: block; margin-bottom: 12px; line-height: 1.5;">Para recibir soporte 24/7, enterarte de novedades y recibir garantías, únete a nuestro canal oficial de WhatsApp:</span>
                  <a href="${CONFIG.whatsappChannelUrl}" target="_blank" style="display: inline-block; background-color: #25d366; color: #ffffff; padding: 14px 28px; font-weight: 700; font-size: 15px; border-radius: 9999px; text-decoration: none; box-shadow: 0 4px 14px rgba(37, 211, 102, 0.3); transition: transform 0.2s ease;">
                    Canal de Soporte WhatsApp 24/7
                  </a>
                </td>
              </tr>

              <!-- Important Notes -->
              <tr>
                <td style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 20px; font-size: 12px; color: #6b7280; line-height: 1.6; text-align: center;">
                  <strong style="color: #9ca3af; display: block; margin-bottom: 4px;">Información de Seguridad</strong>
                  Por favor no modifiques los datos de la cuenta ni intentes cambiar el correo asociado. Cualquier intento de alteración anulará la garantía del servicio.
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"Música Premium Barato" <${emailUser}>`,
    to: order.email,
    subject: `🚀 Tu cuenta premium de ${serviceConfig.name} está lista - Orden #${order.orderId}`,
    html: emailHtml,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Order email sent successfully to ${order.email}`);
    return true;
  } catch (error) {
    console.error("Error sending order email:", error);
    return false;
  }
}
