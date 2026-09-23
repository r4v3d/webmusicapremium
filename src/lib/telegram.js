// Cliente mínimo de la Bot API de Telegram (§17): llamadas directas, sin librerías.

export function telegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export async function tgCall(method, payload = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, skipped: true };
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
  if (!json.ok) {
    const err = new Error(json.description || `telegram_${method}_error`);
    err.code = json.error_code;
    throw err;
  }
  return json;
}

/** Escapa texto para parse_mode HTML. */
export function tgEscape(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function sendTelegramMessage(chatId, text, { keyboard = null, disablePreview = true } = {}) {
  return tgCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: disablePreview,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

export function editTelegramMessage(chatId, messageId, text, { keyboard = null } = {}) {
  return tgCall("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

export function answerCallback(callbackQueryId, text = "") {
  return tgCall("answerCallbackQuery", { callback_query_id: callbackQueryId, ...(text ? { text } : {}) });
}
