// Alertas al admin (§16 punto 7-8) por correo y, si está configurado, por Telegram.
// Nunca lanza: una alerta que falla no debe tumbar una liquidación.
import { sendPlainEmail } from "./email";
import { sendTelegramMessage, tgEscape } from "./telegram";
import { query } from "./pg";

export async function alertAdmin(subject, lines = [], { level = "info" } = {}) {
  const body = Array.isArray(lines) ? lines.filter(Boolean).join("\n") : String(lines);
  const prefix = level === "critical" ? "🚨" : level === "warn" ? "⚠️" : "🔔";
  const results = {};

  const to = process.env.ADMIN_ALERT_EMAIL;
  if (to) {
    results.email = await sendPlainEmail({ to, subject: `${prefix} ${subject}`, text: body }).catch((e) => ({ sent: false, error: e.message }));
  }

  const adminChat = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (adminChat) {
    results.telegram = await sendTelegramMessage(adminChat, `${prefix} <b>${tgEscape(subject)}</b>\n${tgEscape(body)}`)
      .then(() => ({ sent: true }))
      .catch((e) => ({ sent: false, error: e.message }));
  }

  if (!to && !adminChat) console.warn(`[alerta] ${subject}\n${body}`);
  return results;
}

/** Aviso al cliente por Telegram si tiene el bot vinculado (recarga acreditada, pago parcial...). */
export async function notifyCustomer(customerId, text) {
  if (!customerId || !process.env.TELEGRAM_BOT_TOKEN) return { sent: false, skipped: true };
  try {
    const res = await query("select chat_id from telegram_chats where customer_id = $1 order by updated_at desc limit 1", [customerId]);
    if (!res.rows[0]) return { sent: false, skipped: true };
    await sendTelegramMessage(res.rows[0].chat_id, text);
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error.message };
  }
}

/** Publica en el canal de Telegram (anuncios de stock, §17). */
export async function announceToChannel(text, keyboard = null) {
  const channel = process.env.TELEGRAM_CHANNEL_ID;
  if (!channel) return { sent: false, skipped: true };
  try {
    await sendTelegramMessage(channel, text, { keyboard });
    return { sent: true };
  } catch (error) {
    console.error("[canal] no se pudo publicar:", error.message);
    return { sent: false, error: error.message };
  }
}
