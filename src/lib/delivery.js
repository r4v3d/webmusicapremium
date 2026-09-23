// Entrega automática de credenciales (§14). Se llama DESPUÉS de confirmar la
// transacción de liquidación: si falla, el pedido queda 'paid' y el worker reintenta.
import crypto from "node:crypto";
import { query } from "./pg";
import { formatOrder } from "./db";
import { parseAssignedAccount, resolveSlotCredentials } from "./credentials";
import { sendOrderEmail } from "./email";
import { sendTelegramMessage, tgEscape, telegramConfigured } from "./telegram";
import { alertAdmin } from "./notify";
import { CONFIG } from "../data/config";

export { resolveSlotCredentials };

/** Espera entre reintentos, en minutos (§14.3). Tras el último, alerta y se detiene. */
export const RETRY_BACKOFF_MINUTES = [1, 5, 15, 60, 60];
export const MAX_DELIVERY_ATTEMPTS = RETRY_BACKOFF_MINUTES.length;

export function nextRetryDelayMinutes(attempts) {
  return attempts >= MAX_DELIVERY_ATTEMPTS ? null : RETRY_BACKOFF_MINUTES[attempts];
}

export function credentialHash(email, password) {
  return crypto.createHash("sha256").update(`${email || ""}:${password || ""}`).digest("hex");
}

async function recordDelivery({ order, channel, status, attempt, errorDetail = null }) {
  const { email, password } = parseAssignedAccount(order.assigned_account);
  await query(
    `insert into deliveries(order_id, customer_id, account_slot_id, subscription_id, channel, status, credential_hash, attempt, error_detail)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [order.order_id, order.customer_id, order.account_slot_id, order.subscription_id,
     channel, status, order.assigned_account ? credentialHash(email, password) : null, attempt, errorDetail]
  );
}

async function markDelivered(orderId) {
  const res = await query(
    `update orders set status = 'delivered', delivered_at = coalesce(delivered_at, now()),
            next_delivery_at = null, last_delivery_error = null, updated_at = now()
      where order_id = $1 and status = 'paid'
      returning order_id`,
    [orderId]
  );
  return res.rowCount > 0;
}

async function telegramChatFor(customerId) {
  if (!customerId || !telegramConfigured()) return null;
  const res = await query("select chat_id from telegram_chats where customer_id = $1 order by updated_at desc limit 1", [customerId]);
  return res.rows[0]?.chat_id ?? null;
}

export function telegramDeliveryText(order, { renewalDate = null } = {}) {
  const { email, password } = parseAssignedAccount(order.assigned_account);
  const service = CONFIG.services[order.service]?.name || String(order.service || "").toUpperCase();
  return [
    `✅ <b>¡Pago confirmado!</b> Tu cuenta de <b>${tgEscape(service)}</b> está lista.`,
    "",
    `📧 Correo: <code>${tgEscape(email)}</code>`,
    password ? `🔑 Contraseña: <code>${tgEscape(password)}</code>` : null,
    renewalDate ? `📅 Vence: <b>${tgEscape(renewalDate)}</b>` : null,
    "",
    `Pedido <code>${tgEscape(order.order_id)}</code>. No cambies el correo ni la contraseña: anula la garantía.`,
  ].filter((l) => l !== null).join("\n");
}

/**
 * Entrega por todos los canales push disponibles (correo y Telegram) y registra
 * cada intento. El pedido pasa a 'delivered' solo con una fila 'sent' (§9.1).
 */
export async function deliverOrder(orderOrResult, { resend = false, performedBy = "system" } = {}) {
  const orderId = typeof orderOrResult === "string" ? orderOrResult : orderOrResult?.orderId;
  if (!orderId) return { ok: false, reason: "missing_order" };

  const res = await query(
    `select o.*, sb.renewal_date as sub_renewal_date
       from orders o left join subscriptions sb on sb.id = o.subscription_id
      where o.order_id = $1`,
    [orderId]
  );
  const order = res.rows[0];
  if (!order) return { ok: false, reason: "not_found" };
  if (!["paid", "delivered"].includes(order.status)) return { ok: false, reason: "not_paid" };
  if (!order.assigned_account) return { ok: false, reason: "no_credentials" };
  if (order.status === "delivered" && !resend) return { ok: true, alreadyDelivered: true };

  if (!resend) {
    // Lease: la ruta (after) y el worker pueden llegar a la vez. Solo uno entrega;
    // el otro ve next_delivery_at en el futuro y se retira. Si el proceso muere,
    // el lease vence a los 5 minutos y el worker reintenta.
    const lease = await query(
      `update orders set next_delivery_at = now() + interval '5 minutes'
        where order_id = $1 and status = 'paid' and next_delivery_at is not null and next_delivery_at <= now()
        returning order_id`,
      [orderId]
    );
    if (lease.rowCount === 0) return { ok: true, skipped: "not_due" };
  }

  const attempt = (order.delivery_attempts || 0) + 1;
  const sent = [];
  const errors = [];
  const statusLabel = resend ? "resent" : "sent";

  if (order.email) {
    const mail = await sendOrderEmail(formatOrder(order), { renewalDate: order.sub_renewal_date });
    if (mail.sent) {
      sent.push("email");
      await recordDelivery({ order, channel: "email", status: statusLabel, attempt });
    } else if (!mail.skipped) {
      errors.push(`email: ${mail.error}`);
      await recordDelivery({ order, channel: "email", status: "failed", attempt, errorDetail: mail.error });
    }
  }

  const chatId = await telegramChatFor(order.customer_id);
  if (chatId) {
    try {
      await sendTelegramMessage(chatId, telegramDeliveryText(order, { renewalDate: order.sub_renewal_date }));
      sent.push("telegram");
      await recordDelivery({ order, channel: "telegram", status: statusLabel, attempt });
    } catch (error) {
      errors.push(`telegram: ${error.message}`);
      await recordDelivery({ order, channel: "telegram", status: "failed", attempt, errorDetail: error.message });
    }
  }

  if (resend) {
    await query(
      `insert into events_log(entity_type, entity_id, event_type, new_value, performed_by, reason)
       values ('order', $1, 'credentials_resent', $2, $3, 'Reenvío manual de credenciales')`,
      [orderId, JSON.stringify({ channels: sent, errors }), performedBy]
    );
  }

  if (sent.length > 0) {
    await markDelivered(orderId);
    return { ok: true, channels: sent, errors };
  }

  if (errors.length === 0) {
    // Ningún canal push configurado: la entrega ocurre cuando el cliente abre su checkout
    // (recordWebDelivery). No se programa reintento.
    await query("update orders set next_delivery_at = null where order_id = $1", [orderId]);
    return { ok: true, channels: [], pendingWeb: true };
  }

  const delay = nextRetryDelayMinutes(attempt);
  await query(
    `update orders
        set delivery_attempts = $2, last_delivery_error = $3,
            next_delivery_at = case when $4::int is null then null else now() + ($4::int * interval '1 minute') end,
            updated_at = now()
      where order_id = $1`,
    [orderId, attempt, errors.join(" | ").slice(0, 500), delay]
  );
  if (delay === null) {
    await alertAdmin(`Entrega fallida tras ${attempt} intentos: ${orderId}`, [
      `Servicio: ${order.service}`, `Cliente: ${order.full_name || ""} ${order.whatsapp || ""}`, ...errors,
      "Usa «Reenviar credenciales» en el panel cuando el canal esté operativo.",
    ], { level: "critical" });
  }
  return { ok: false, channels: [], errors, attempt, retryInMinutes: delay };
}

/**
 * El cliente vio sus credenciales en el checkout: constancia web (§14.2) con IP y
 * user agent para disputas de "nunca recibí la cuenta" (§14.4).
 */
export async function recordWebDelivery(orderId, { ip = null, userAgent = null } = {}) {
  const res = await query("select * from orders where order_id = $1", [orderId]);
  const order = res.rows[0];
  if (!order || !["paid", "delivered"].includes(order.status) || !order.assigned_account) return false;
  const already = await query("select 1 from deliveries where order_id = $1 and channel = 'web' limit 1", [orderId]);
  if (already.rowCount === 0) {
    await recordDelivery({ order, channel: "web", status: "sent", attempt: 1 });
    await query(
      `insert into events_log(entity_type, entity_id, event_type, new_value, performed_by, reason)
       values ('order', $1, 'viewed_credentials', $2, 'customer', 'Credenciales mostradas en el checkout')`,
      [orderId, JSON.stringify({ ip, userAgent: userAgent ? String(userAgent).slice(0, 300) : null })]
    );
  }
  await markDelivered(orderId);
  return true;
}
