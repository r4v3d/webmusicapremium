// Bot de Telegram (§17): adaptador delgado sobre el núcleo. No tiene reglas de
// negocio propias: compra con saldo vía payWithWallet, recarga vía intentos y
// Binance, entrega vía deliverOrder. El stock es el mismo que el de la web.
import crypto from "node:crypto";
import { query } from "./pg";
import { createClient, createOrder, getClientById, getFreeSlotsStock, getOrderById } from "./db";
import { findPlan, formatPen, formatUsdt } from "./catalog";
import { payWithWallet } from "./settle";
import { deliverOrder, telegramDeliveryText } from "./delivery";
import { createTopupIntent, getOrCreateBinanceTopupIntent } from "./paymentIntents";
import { getBalances } from "./wallet";
import { newAccessToken } from "./orderAccess";
import { defaultProvider, walletEnabled } from "./providers";
import { binanceConfigured } from "./binanceAccount";
import { claimBinanceByOrderId } from "./providerSync";
import { claimMessage } from "./binanceClaimMessages";
import { rateLimitDb } from "./rateLimitDb";
import { hashOtp, otpCodesMatch } from "./pinOtp";
import { sendOTPEmail } from "./email";
import { alertAdmin, announceToChannel } from "./notify";
import { resolveSlotCredentials } from "./credentials";
import { answerCallback, editTelegramMessage, sendTelegramMessage, tgEscape } from "./telegram";
import { CONFIG } from "../data/config";

const e = tgEscape;

// --- identidad y estado ---

async function upsertChat(chatId, from) {
  const res = await query(
    `insert into telegram_chats(chat_id, user_id, username) values ($1,$2,$3)
     on conflict (chat_id) do update set user_id = excluded.user_id, username = excluded.username, updated_at = now()
     returning *`,
    [chatId, from.id, from.username || null]
  );
  return res.rows[0];
}

/** Busca o crea el cliente por su telegram_user_id (customer_contacts.contact_type = 'telegram'). */
async function ensureCustomer(chat, from) {
  if (chat.customer_id) return chat.customer_id;
  const found = await query(
    "select customer_id from customer_contacts where contact_type = 'telegram' and normalized_value = $1 order by id limit 1",
    [String(from.id)]
  );
  let customerId = found.rows[0]?.customer_id;
  if (!customerId) {
    const name = [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || "Cliente Telegram";
    const client = await createClient({ nickname: name, notes: "Creado desde Telegram" });
    customerId = client.id;
    await query(
      `insert into customer_contacts(customer_id, contact_type, contact_value, normalized_value, is_primary, status)
       values ($1,'telegram',$2,$3,true,'active')`,
      [customerId, from.username ? `@${from.username}` : String(from.id), String(from.id)]
    );
  }
  await query("update telegram_chats set customer_id = $2, updated_at = now() where chat_id = $1", [chat.chat_id, customerId]);
  chat.customer_id = customerId;
  return customerId;
}

async function setState(chatId, state) {
  // Conserva lastUpdateId: es la deduplicación de reintentos de Telegram.
  await query(
    `update telegram_chats
        set state = jsonb_strip_nulls(jsonb_build_object('lastUpdateId', state->'lastUpdateId')) || $2::jsonb,
            updated_at = now()
      where chat_id = $1`,
    [chatId, JSON.stringify(state || {})]
  );
}

// --- pantallas ---

function balanceLine(b) {
  return `Tu saldo: <b>${formatPen(b.PEN)}</b> · <b>${b.USDT.toFixed(3)} USDT</b>`;
}

function mainKeyboard() {
  const rows = [
    [{ text: "🛒 Tienda", callback_data: "shop" }, { text: "💰 Recargar saldo", callback_data: "topup" }],
    [{ text: "🎧 Mis cuentas", callback_data: "accounts" }, { text: "🆘 Soporte", callback_data: "support" }],
    [{ text: "🔗 Vincular mi cuenta web", callback_data: "link" }],
  ];
  if (CONFIG.whatsappChannelUrl) rows.push([{ text: "📢 Canal", url: CONFIG.whatsappChannelUrl }]);
  return rows;
}

async function menuText(customerId) {
  const b = await getBalances(customerId);
  return `🎧 <b>${e(CONFIG.appName)}</b>\n${balanceLine(b)}\n\n¿Qué quieres hacer?`;
}

async function shopScreen() {
  const stock = await getFreeSlotsStock();
  const rows = Object.values(CONFIG.services).map((s) => [{
    text: `${s.name} · ${stock[s.id] > 0 ? `${stock[s.id]} en stock` : "agotado"}`,
    callback_data: `svc:${s.id}`,
  }]);
  rows.push([{ text: "⬅️ Menú", callback_data: "menu" }]);
  return { text: "🛒 <b>Tienda</b>\nElige el servicio:", keyboard: rows };
}

function plansScreen(serviceId) {
  const service = CONFIG.services[serviceId];
  if (!service) return null;
  const rows = service.plans.map((p) => [{
    text: `${p.duration} · ${formatPen(p.pricePen)} · ${formatUsdt(p.priceUsdt)}`,
    callback_data: `plan:${p.id}`,
  }]);
  rows.push([{ text: "⬅️ Tienda", callback_data: "shop" }]);
  return { text: `<b>${e(service.name)} Premium</b>\n${e(service.tagline || "")}\n\nElige la duración:`, keyboard: rows };
}

async function planScreen(customerId, planId) {
  const service = Object.values(CONFIG.services).find((s) => s.plans.some((p) => p.id === planId));
  const plan = service && findPlan(service.id, planId);
  if (!plan) return null;
  const b = await getBalances(customerId);
  return {
    text: `<b>${e(service.name)} · ${e(plan.duration)}</b>\n\nPrecio: <b>${formatPen(plan.pricePen)}</b> o <b>${formatUsdt(plan.priceUsdt)}</b>\n${balanceLine(b)}\n\nSe paga con tu saldo y la cuenta llega al instante.`,
    keyboard: [
      [{ text: `Pagar ${formatPen(plan.pricePen)}`, callback_data: `buy:${plan.id}:PEN` }],
      [{ text: `Pagar ${formatUsdt(plan.priceUsdt)}`, callback_data: `buy:${plan.id}:USDT` }],
      [{ text: "⬅️ Planes", callback_data: `svc:${service.id}` }],
    ],
  };
}

async function accountsScreen(customerId) {
  const { rows } = await query(
    `select sb.platform_code, sb.renewal_date, to_json(s) as slot, to_json(pa) as account
       from subscriptions sb
       left join account_slots s on s.id = sb.account_slot_id
       left join platform_accounts pa on pa.id = sb.platform_account_id
      where sb.customer_id = $1 and sb.subscription_status in ('active','pending_payment')
        and (sb.renewal_date is null or sb.renewal_date >= current_date)
      order by sb.renewal_date`,
    [customerId]
  );
  if (rows.length === 0) {
    return { text: "No tienes cuentas activas todavía.\nCompra una en la 🛒 Tienda.", keyboard: [[{ text: "🛒 Tienda", callback_data: "shop" }], [{ text: "⬅️ Menú", callback_data: "menu" }]] };
  }
  const blocks = rows.map((r) => {
    const mine = r.slot && String(r.slot.customer_id) === String(customerId);
    const { email, password } = mine ? resolveSlotCredentials(r.slot, r.account) : { email: "", password: "" };
    const name = CONFIG.services[r.platform_code]?.name || r.platform_code;
    return `<b>${e(name)}</b> · vence ${e(r.renewal_date || "—")}\n📧 <code>${e(email)}</code>${password ? `\n🔑 <code>${e(password)}</code>` : ""}`;
  });
  return { text: `🎧 <b>Mis cuentas</b>\n\n${blocks.join("\n\n")}`, keyboard: [[{ text: "⬅️ Menú", callback_data: "menu" }]] };
}

// --- acciones ---

async function newOrderId() {
  for (let i = 0; i < 8; i++) {
    const candidate = `MPB-${crypto.randomInt(100000, 1000000)}`;
    if (!(await getOrderById(candidate))) return candidate;
  }
  throw new Error("No se pudo generar un ID de pedido.");
}

async function buy(chat, customerId, planId, currency) {
  if (!walletEnabled()) return { text: "Las compras con saldo no están disponibles ahora." };
  const service = Object.values(CONFIG.services).find((s) => s.plans.some((p) => p.id === planId));
  const plan = service && findPlan(service.id, planId);
  if (!plan || !["PEN", "USDT"].includes(currency)) return { text: "Plan no válido." };

  const client = await getClientById(customerId);
  const orderId = await newOrderId();
  await createOrder({
    orderId, service: service.id, planId: plan.id, duration: plan.duration,
    pricePen: `S/ ${plan.pricePen.toFixed(2)}`, priceUsd: plan.priceUsdt.toFixed(2),
    amountPen: plan.pricePen, amountUsdt: plan.priceUsdt, payCurrency: currency,
    fullName: client?.nickname || "Cliente Telegram", email: client?.usedEmails?.[0] || null,
    whatsapp: client?.currentWhatsApp || null, status: "pending",
    customerId, salesChannel: "telegram", accessToken: newAccessToken(),
  });

  try {
    const r = await payWithWallet({ orderId, customerId, currency, salesChannel: "telegram" });
    if (r.status !== "settled") return { text: "No se pudo completar la compra. Intenta de nuevo." };
    // La entrega por Telegram la hace deliverOrder (y deja constancia en deliveries).
    const delivered = await deliverOrder(orderId);
    if (!delivered.channels?.includes("telegram")) {
      const order = (await query("select o.*, sb.renewal_date as sub_renewal_date from orders o left join subscriptions sb on sb.id = o.subscription_id where o.order_id = $1", [orderId])).rows[0];
      return { text: telegramDeliveryText(order, { renewalDate: order.sub_renewal_date }), keyboard: [[{ text: "⬅️ Menú", callback_data: "menu" }]] };
    }
    return { text: "¡Listo! Te envié tus datos de acceso arriba. 👆", keyboard: [[{ text: "⬅️ Menú", callback_data: "menu" }]] };
  } catch (error) {
    await query("update orders set status = 'cancelled', updated_at = now() where order_id = $1 and status = 'pending'", [orderId]);
    if (error.code === "INSUFFICIENT_FUNDS") {
      const missing = currency === "USDT" ? formatUsdt(error.missing) : formatPen(error.missing);
      return {
        text: `Tu saldo no alcanza: te faltan <b>${missing}</b>.`,
        keyboard: [[{ text: `💰 Recargar ${currency === "USDT" ? "USDT" : "soles"}`, callback_data: `topup:${currency}` }], [{ text: "⬅️ Menú", callback_data: "menu" }]],
      };
    }
    if (error.code === "OUT_OF_STOCK") return { text: "Lo sentimos, se agotó el stock de este servicio. No se te cobró nada." };
    throw error;
  }
}

async function topupUsdt(chat, customerId) {
  const payId = process.env.BINANCE_PAY_ID || CONFIG.payments.binancePay.payId;
  const nick = process.env.BINANCE_PAY_NICKNAME || CONFIG.payments.binancePay.nickname || "";
  await getOrCreateBinanceTopupIntent({ customerId, salesChannel: "telegram" });
  await setState(chat.chat_id, { await: "binance_order_id" });
  return {
    text: [
      "💰 <b>Recargar USDT</b> (monto libre)",
      "",
      `1. Envía <b>cualquier monto</b> en USDT por Binance Pay al Pay ID <code>${e(payId)}</code>${nick ? ` (${e(nick)})` : ""}. No hace falta escribir nota.`,
      "2. Pega aquí el <b>Order ID</b> que te muestra Binance al terminar el pago.",
      "",
      "Se acredita lo que llegó, con hasta 3 decimales.",
    ].join("\n"),
    keyboard: [[{ text: "⬅️ Menú", callback_data: "menu" }]],
  };
}

async function topupPenAsk(chat) {
  const provider = defaultProvider("PEN");
  if (!provider) return { text: "Las recargas en soles no están disponibles ahora." };
  await setState(chat.chat_id, { await: "topup_pen_amount" });
  return { text: "💰 <b>Recargar soles</b> (monto libre)\n\nEscribe el monto que vas a yapear, por ejemplo <code>20</code>.", keyboard: [[{ text: "Cancelar", callback_data: "menu" }]] };
}

async function topupPenCreate(chat, customerId, text) {
  const amount = Number(String(text).replace(",", ".").replace(/[^\d.]/g, ""));
  if (!(amount > 0 && amount <= 5000)) return { text: "Escribe solo el monto, por ejemplo <code>20</code>." };
  const provider = defaultProvider("PEN");
  const r = await createTopupIntent({ customerId, providerId: provider.id, declaredAmount: amount, salesChannel: "telegram" });
  if (!r.ok) return { text: "No se pudo iniciar la recarga. Intenta más tarde." };
  await setState(chat.chat_id, { await: "topup_pen_ref", intentId: r.intent.id });
  const yape = CONFIG.payments.yape;
  return {
    text: [
      `Yapea <b>${formatPen(amount)}</b> al <code>${e(yape.number)}</code> (${e(yape.name)}).`,
      "",
      "Cuando lo hagas, escribe aquí el <b>número de operación</b> o el nombre con el que yapeaste: nos ayuda a encontrarlo.",
      `Lo verificamos en nuestra app y se acredita a tu saldo. Horario: ${e(CONFIG.manualReviewHours || "")}`,
    ].join("\n"),
  };
}

async function topupPenReference(chat, state, text) {
  const reference = String(text).trim().slice(0, 80);
  await query("update payment_intents set customer_reference = concat_ws(' · ', customer_reference, $2::text), updated_at = now() where id = $1", [state.intentId, reference]);
  await setState(chat.chat_id, {});
  await alertAdmin("Recarga Yape por verificar (Telegram)", [`Intento #${state.intentId}`, `Dato del cliente: ${reference}`]);
  return { text: "¡Gracias! Lo verificamos y te avisamos por aquí cuando se acredite.", keyboard: [[{ text: "⬅️ Menú", callback_data: "menu" }]] };
}

async function claimBinance(chat, customerId, text) {
  const txnId = String(text).replace(/\D/g, "");
  if (txnId.length < 8) return { text: "Pega el Order ID completo que te muestra Binance (solo números)." };
  const limited = await rateLimitDb(`tg-claim:${chat.chat_id}`, { limit: 5, windowMs: 10 * 60 * 1000 });
  if (!limited.ok) return { text: "Demasiados intentos. Espera unos minutos y vuelve a pegar el Order ID." };
  if (!binanceConfigured()) return { text: "La verificación automática no está disponible ahora. Escríbenos por soporte." };
  // Siempre sobre un intento del propio cliente: el Order ID se acredita a quien lo reclama primero.
  const intent = await getOrCreateBinanceTopupIntent({ customerId, salesChannel: "telegram" });
  const r = await claimBinanceByOrderId({ intentId: intent.id, binanceOrderId: txnId });
  const { key, message } = claimMessage(r, { topup: true });
  if (key !== "not_found" && key !== "invalid_order_id") await setState(chat.chat_id, {});
  const b = await getBalances(customerId);
  if (key === "credited") return { text: `✅ ${e(message)}\n${balanceLine(b)}`, keyboard: [[{ text: "🛒 Tienda", callback_data: "shop" }]] };
  return { text: e(message), keyboard: [[{ text: "⬅️ Menú", callback_data: "menu" }]] };
}

// Vincular con la cuenta web: número de WhatsApp + OTP al correo registrado (pinOtp.js).
async function linkAsk(chat) {
  await setState(chat.chat_id, { await: "link_phone" });
  return { text: "🔗 Escribe el número de WhatsApp con el que compraste en la web (con código de país, ej. 51987654321)." };
}

async function linkPhone(chat, text) {
  const phone = String(text).replace(/\D/g, "");
  if (phone.length < 8) return { text: "Número no válido. Escríbelo con código de país, solo dígitos." };
  const limited = await rateLimitDb(`tg-link:${chat.chat_id}`, { limit: 3, windowMs: 30 * 60 * 1000 });
  if (!limited.ok) return { text: "Demasiados intentos. Vuelve a intentarlo en un rato." };
  const found = await query(
    "select customer_id from customer_contacts where contact_type = 'whatsapp' and normalized_value = $1 order by is_primary desc, id limit 1",
    [phone]
  );
  const target = found.rows[0]?.customer_id;
  const emailRes = target ? await query("select contact_value from customer_contacts where customer_id = $1 and contact_type = 'email' order by id limit 1", [target]) : { rows: [] };
  const email = emailRes.rows[0]?.contact_value;
  // Misma respuesta exista o no: no revelamos qué números son clientes.
  if (target && email && String(target) !== String(chat.customer_id)) {
    const code = crypto.randomInt(100000, 1000000).toString();
    await query(
      `insert into customer_auth(customer_id, otp_code, otp_expires_at, updated_at) values ($1,$2, now() + interval '10 minutes', now())
       on conflict (customer_id) do update set otp_code = excluded.otp_code, otp_expires_at = excluded.otp_expires_at, updated_at = now()`,
      [target, hashOtp(code)]
    );
    await sendOTPEmail(email, code);
    await setState(chat.chat_id, { await: "link_otp", target: String(target) });
  } else {
    await setState(chat.chat_id, { await: "link_otp", target: null });
  }
  return { text: "Si ese número está registrado con un correo, te enviamos un código de 6 dígitos. Escríbelo aquí." };
}

async function linkOtp(chat, state, text) {
  const limited = await rateLimitDb(`tg-link-otp:${chat.chat_id}`, { limit: 5, windowMs: 15 * 60 * 1000 });
  if (!limited.ok) return { text: "Demasiados intentos. Vuelve a empezar la vinculación más tarde." };
  if (!state.target) return { text: "Código incorrecto." };
  const auth = await query("select otp_code, otp_expires_at from customer_auth where customer_id = $1", [state.target]);
  const row = auth.rows[0];
  if (!row || !otpCodesMatch(row.otp_code, String(text).trim()) || new Date(row.otp_expires_at) < new Date()) {
    return { text: "Código incorrecto o vencido." };
  }
  // Solo se fusiona si el cliente de Telegram no tiene historial propio: nada se pierde.
  const current = chat.customer_id;
  const usage = await query(
    `select (select count(*) from orders where customer_id = $1 and status in ('paid','delivered'))::int
          + (select count(*) from wallet_ledger where customer_id = $1)::int as n`,
    [current]
  );
  if (usage.rows[0].n > 0) {
    await setState(chat.chat_id, {});
    return { text: "Tu cuenta de Telegram ya tiene compras o saldo propios. Escríbenos por soporte para unir ambas cuentas." };
  }
  await query("update customer_auth set otp_code = null, otp_expires_at = null where customer_id = $1", [state.target]);
  await query("update customer_contacts set customer_id = $2 where customer_id = $1 and contact_type = 'telegram'", [current, state.target]);
  await query("update customers set status = 'merged', notes = concat_ws(' · ', notes, $2::text) where id = $1", [current, `Fusionado en ${state.target}`]);
  await query("update telegram_chats set customer_id = $2, state = '{}'::jsonb, updated_at = now() where chat_id = $1", [chat.chat_id, state.target]);
  chat.customer_id = state.target;
  return { text: "✅ ¡Cuenta vinculada! Ahora ves aquí tus compras de la web.", keyboard: [[{ text: "🎧 Mis cuentas", callback_data: "accounts" }]] };
}

// --- despacho ---

async function reply(chatId, messageId, screen) {
  if (!screen) return;
  if (messageId) {
    try {
      await editTelegramMessage(chatId, messageId, screen.text, { keyboard: screen.keyboard });
      return;
    } catch {
      // "message is not modified" o mensaje viejo: se envía uno nuevo.
    }
  }
  await sendTelegramMessage(chatId, screen.text, { keyboard: screen.keyboard });
}

export async function handleTelegramUpdate(update) {
  const message = update.message;
  const callback = update.callback_query;
  const from = message?.from || callback?.from;
  const chatId = message?.chat?.id || callback?.message?.chat?.id;
  if (!from || !chatId || from.is_bot) return;
  if ((message?.chat?.type || callback?.message?.chat?.type) !== "private") return;

  const chat = await upsertChat(chatId, from);
  // Telegram reintenta si no respondemos 200: se ignora un update ya visto.
  const lastSeen = Number(chat.state?.lastUpdateId || 0);
  if (update.update_id && update.update_id <= lastSeen) return;
  await query(
    "update telegram_chats set state = jsonb_set(coalesce(state, '{}'::jsonb), '{lastUpdateId}', to_jsonb($2::bigint)) where chat_id = $1",
    [chatId, update.update_id || 0]
  );
  const customerId = await ensureCustomer(chat, from);
  const state = chat.state || {};

  if (callback) {
    await answerCallback(callback.id).catch(() => {});
    const data = String(callback.data || "");
    const msgId = callback.message?.message_id;
    let screen = null;
    if (data === "menu") {
      await setState(chatId, {});
      screen = { text: await menuText(customerId), keyboard: mainKeyboard() };
    } else if (data === "shop") screen = await shopScreen();
    else if (data.startsWith("svc:")) screen = plansScreen(data.slice(4));
    else if (data.startsWith("plan:")) screen = await planScreen(customerId, data.slice(5));
    else if (data.startsWith("buy:")) {
      const [, planId, currency] = data.split(":");
      screen = await buy(chat, customerId, planId, currency);
      return sendTelegramMessage(chatId, screen.text, { keyboard: screen.keyboard });
    } else if (data === "topup") {
      screen = { text: "💰 ¿Qué saldo quieres recargar?", keyboard: [[{ text: "Soles (Yape/Plin)", callback_data: "topup:PEN" }, { text: "USDT (Binance)", callback_data: "topup:USDT" }], [{ text: "⬅️ Menú", callback_data: "menu" }]] };
    } else if (data === "topup:USDT") screen = await topupUsdt(chat, customerId);
    else if (data === "topup:PEN") screen = await topupPenAsk(chat);
    else if (data === "accounts") screen = await accountsScreen(customerId);
    else if (data === "support") {
      screen = { text: `🆘 Escríbenos por WhatsApp: https://wa.me/${CONFIG.whatsappNumber}`, keyboard: [[{ text: "⬅️ Menú", callback_data: "menu" }]] };
    } else if (data === "link") screen = await linkAsk(chat);
    return reply(chatId, msgId, screen);
  }

  const text = String(message?.text || "").trim();
  if (!text) return;

  if (text.startsWith("/start")) {
    await setState(chatId, {});
    const payload = text.split(" ")[1] || "";
    if (payload.startsWith("svc_")) return reply(chatId, null, plansScreen(payload.slice(4)));
    return reply(chatId, null, { text: await menuText(customerId), keyboard: mainKeyboard() });
  }
  if (text === "/saldo") return reply(chatId, null, { text: balanceLine(await getBalances(customerId)) });
  if (text === "/cuentas") return reply(chatId, null, await accountsScreen(customerId));

  let screen = null;
  if (state.await === "binance_order_id") screen = await claimBinance(chat, customerId, text);
  else if (state.await === "topup_pen_amount") screen = await topupPenCreate(chat, customerId, text);
  else if (state.await === "topup_pen_ref") screen = await topupPenReference(chat, state, text);
  else if (state.await === "link_phone") screen = await linkPhone(chat, text);
  else if (state.await === "link_otp") screen = await linkOtp(chat, state, text);
  else if (/^\d{15,22}$/.test(text)) screen = await claimBinance(chat, customerId, text);
  else screen = { text: await menuText(customerId), keyboard: mainKeyboard() };
  return reply(chatId, null, screen);
}

/** Anuncio automático al canal tras una importación (§17). */
export async function announceStock(serviceId, added, totalFree = null) {
  const service = CONFIG.services[serviceId];
  if (!service || !(added > 0)) return { sent: false };
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  const cheapest = service.plans[0];
  const text = [
    `🔥 ¡<b>${added}</b> cupos añadidos a <b>${e(service.name)} Premium</b>!`,
    totalFree != null ? `Stock disponible: ${totalFree}` : null,
    cheapest ? `Desde ${formatPen(cheapest.pricePen)} · ${formatUsdt(cheapest.priceUsdt)}` : null,
  ].filter(Boolean).join("\n");
  const keyboard = bot ? [[{ text: "Comprar ahora", url: `https://t.me/${bot}?start=svc_${service.id}` }]] : null;
  return announceToChannel(text, keyboard);
}
