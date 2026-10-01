// Yape directo al número del negocio, validado con las notificaciones del celular.
//
// Cómo se sabe qué pedido pagó cada yapeo (las tres cosas a la vez):
//   1. Monto único: cada intento abierto tiene un monto exacto distinto
//      (S/ 6.00, S/ 5.99, S/ 5.98…). La notificación «te envió un pago por S/ 5.99»
//      apunta a un solo pedido.
//   2. Código de seguridad (obligatorio): Yape pone 3 dígitos en la notificación y
//      en la constancia del cliente. El cliente los escribe en el checkout y deben
//      coincidir. Con YAPE_NOTIFY_REQUIRE_CODE=false bastaría el monto.
//   3. Ventana de tiempo: el pago tiene que llegar después de pedir el pago y
//      antes de que venza (con un margen para pagos tardíos).
// Ante cualquier duda (código distinto, monto distinto, aviso repetido, pago sin
// código desde Plin u otro banco) no se adivina: se manda a revisión en Telegram.
//
// Contra pagos duplicados y fraude:
//   - El endpoint del teléfono exige un secreto (YAPE_NOTIFY_SECRET).
//   - Un aviso repetido (reintento del teléfono) no se guarda dos veces; si llega
//     otro con el mismo nombre, monto y código, va a revisión: nunca paga solo.
//   - Cada notificación paga como máximo un intento: «yn:<id>» en
//     consumed_provider_txns. Un código ya usado no sirve para otro pedido.
//   - El código del cliente nunca confirma por sí solo: además debe existir un
//     aviso real con el monto exacto de su pedido, llegado después de pedirlo.
//   - Un monto recién pagado no se reasigna enseguida a otro pedido.
import crypto from "node:crypto";
import { query, withTransaction } from "./pg";
import { applyPayment } from "./settle";
import { adminDismissIntent } from "./adminPayments";
import { alertAdmin, notifyCustomer } from "./notify";
import { editTelegramMessage, sendTelegramMessage, tgEscape } from "./telegram";
import { formatMoney, round2 } from "./ledger";
import { CONFIG } from "../data/config";

export const PROVIDER = "yape_notify";
const OPEN = ["created", "awaiting"];
const e = tgEscape;

function num(name, def) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 && process.env[name] !== "" ? n : def;
}

export function yapeNotifyConfig() {
  return {
    secret: process.env.YAPE_NOTIFY_SECRET || "",
    // Hasta cuántos céntimos de descuento se usan para hacer único el monto.
    maxCents: Math.min(99, num("YAPE_NOTIFY_MAX_CENTS", 30)),
    // Margen tras el vencimiento en el que un pago tardío todavía se reconoce.
    graceMinutes: num("YAPE_NOTIFY_GRACE_MINUTES", 60),
    // Si el teléfono manda «ping» periódico: minutos sin señal antes de avisar (0 = no se vigila).
    heartbeatMinutes: num("YAPE_NOTIFY_HEARTBEAT_MINUTES", 0),
    // Minutos tras «Ya pagué» sin encontrar el aviso antes de pedir revisión manual.
    reviewAfterMinutes: num("YAPE_NOTIFY_REVIEW_MINUTES", 2),
    // Código de seguridad obligatorio: el pago solo se confirma solo si el cliente
    // escribió los 3 dígitos de su constancia y coinciden con los del aviso.
    requireCode: process.env.YAPE_NOTIFY_REQUIRE_CODE !== "false",
    // Minutos que un aviso espera a que el cliente escriba su código antes de ir a revisión.
    codeWaitMinutes: num("YAPE_NOTIFY_CODE_WAIT_MINUTES", 10),
  };
}

/** Número de Yape al que paga el cliente (sin espacios). */
export function yapeNumber() {
  return String(process.env.YAPE_NUMBER || CONFIG.payments?.yape?.number || "").replace(/\s+/g, "");
}

// ---------------------------------------------------------------- lectura del aviso

function stripAccents(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeName(s) {
  return stripAccents(s).toUpperCase().replace(/[^A-Z0-9*. ]/g, " ").replace(/\s+/g, " ").trim();
}

/** «6», «6.5», «6,50», «1,234.50», «1.234,50» → número con 2 decimales. */
export function parseAmount(raw) {
  let s = String(raw || "").replace(/\s/g, "");
  if (!s) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastComma > lastDot) {
    // La coma es decimal si le siguen 1–2 dígitos; si no, separa miles.
    s = /,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? round2(n) : null;
}

/**
 * Lee una notificación de Yape. Formato habitual (puede variar entre versiones):
 *   título: «Confirmación de Pago»
 *   texto:  «Yape! JUAN PEREZ te envió un pago por S/ 6. El cód. de seguridad es: 123»
 * Solo cuenta como pago lo que dice «te envió/yapeó»: «Yapeaste…» es un pago tuyo.
 */
export function parseYapeNotification({ title = "", text = "" } = {}) {
  const full = `${title || ""}\n${text || ""}`.replace(/\u00a0/g, " ");
  const flat = full.replace(/\s+/g, " ").trim();
  // Sin \b al final: en JS «ó» no cuenta como letra para \b.
  const isPayment = /\bte\s+(envi[oó]|yape[oó]|transfiri[oó])/i.test(flat)
    || /\b(recibiste|has recibido)\s+(un\s+)?(yapeo|pago|S\/)/i.test(flat);
  if (!isPayment) return { kind: "other" };

  const amountMatch = /S\/\.?\s*([\d][\d.,]*)/i.exec(flat);
  const amount = amountMatch ? parseAmount(amountMatch[1].replace(/[.,]$/, "")) : null;

  const codeMatch = /(?:c[oó]d(?:igo)?\.?\s*de\s*seguridad|c[oó]digo)\s*(?:es)?\s*:?\s*(\d{3})\b/i.exec(flat);
  const securityCode = codeMatch ? codeMatch[1] : null;

  // Nombre: lo que va antes de «te envió», desde el último «!», «:» o salto de línea.
  let senderName = null;
  const before = /^([\s\S]*?)\s+te\s+(?:envi[oó]|yape[oó]|transfiri[oó])/i.exec(full.replace(/\r/g, ""));
  if (before) senderName = before[1].split(/[!:\n]/).pop().replace(/^\s*¡?\s*yape\s*/i, "").trim() || null;
  return { kind: "payment", amount, securityCode, senderName: senderName ? senderName.slice(0, 80) : null };
}

function sha(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function contentKey(parsed) {
  return sha([parsed.amount ?? "", normalizeName(parsed.senderName), parsed.securityCode ?? ""].join("|"));
}

// ---------------------------------------------------------------- montos únicos

/**
 * Monto único para un intento nuevo: el precio, o unos céntimos menos si ese
 * monto ya está pendiente (o se pagó hace poco) en otro intento. Debe llamarse
 * dentro de la transacción que crea el intento: bloquea yape_device para que dos
 * pedidos simultáneos no reciban el mismo monto.
 */
export async function allocateUniqueAmount(tx, base) {
  const { maxCents, graceMinutes } = yapeNotifyConfig();
  const price = round2(base);
  await tx.query("insert into yape_device(id) values (1) on conflict do nothing");
  await tx.query("select id from yape_device where id = 1 for update");
  const used = await tx.query(
    `select distinct round(amount_expected, 2)::float8 as a
       from payment_intents
      where provider = $1 and amount_expected between $2 and $3
        and (status = any($4::text[]) or status = 'underpaid'
             or (status = 'expired' and expires_at > now() - ($5::int * interval '1 minute'))
             or (status in ('paid','overpaid') and paid_at > now() - ($5::int * interval '1 minute')))`,
    [PROVIDER, round2(price - maxCents / 100), price, OPEN, graceMinutes]
  );
  const taken = new Set(used.rows.map((r) => round2(r.a)));
  for (let k = 0; k <= maxCents; k++) {
    const candidate = round2(price - k / 100);
    if (candidate <= 0) break;
    if (!taken.has(candidate)) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------- llegada de avisos

/** Marca que el teléfono está vivo (cada aviso o «ping»). */
export async function touchDevice() {
  await query(
    `insert into yape_device(id, last_seen_at) values (1, now())
     on conflict (id) do update set last_seen_at = now()`
  );
}

/**
 * Guarda un aviso del teléfono y, si es un pago, intenta asignarlo.
 * `notificationId`/`postedAt` (si la app los manda) hacen exacta la deduplicación.
 */
export async function ingestNotification({ title = "", text = "", notificationId = null, postedAt = null } = {}) {
  await touchDevice();
  const body = String(text || "").slice(0, 2000);
  const head = String(title || "").slice(0, 300);
  if (!body.trim() && !head.trim()) return { status: "empty" };

  const parsed = parseYapeNotification({ title: head, text: body });
  const postedDate = postedAt ? new Date(Number(postedAt) || postedAt) : null;
  const deviceAt = postedDate && !Number.isNaN(postedDate.getTime()) ? postedDate : null;
  // Sin id ni hora del teléfono, el mismo texto dentro de 2 minutos es un reintento.
  const bucket = notificationId || deviceAt ? "" : String(Math.floor(Date.now() / 120_000));
  const dedupeKey = sha([head, body, notificationId ?? "", deviceAt ? deviceAt.toISOString() : "", bucket].join("|"));

  let status = "ignored";
  if (parsed.kind === "payment") status = parsed.amount ? "unmatched" : "unparsed";

  const ins = await query(
    `insert into yape_notifications(dedupe_key, content_key, title, body, sender_name, amount, security_code, device_at, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (dedupe_key) do nothing
     returning *`,
    [dedupeKey, parsed.kind === "payment" ? contentKey(parsed) : dedupeKey, head, body,
     parsed.senderName || null, parsed.amount, parsed.securityCode, deviceAt, status]
  );
  const row = ins.rows[0];
  if (!row) return { status: "duplicate_delivery" };
  if (status === "ignored") return { status: "ignored", id: row.id };
  if (status === "unparsed") {
    await alertAdmin("Aviso de Yape que no se pudo leer", [
      "Llegó una notificación que parece un pago pero sin monto legible.",
      `Texto: ${head} · ${body}`.slice(0, 500),
      "Revísalo en tu app de Yape y confirma a mano si corresponde.",
    ], { level: "warn" });
    return { status: "unparsed", id: row.id };
  }
  return matchNotification(row.id);
}

// ---------------------------------------------------------------- asignación

async function candidateIntents(tx, notif) {
  const { graceMinutes } = yapeNotifyConfig();
  const res = await tx.query(
    `select i.*
       from payment_intents i
       left join orders o on o.order_id = i.order_id
      where i.provider = $1
        and round(i.amount_expected, 2) = $2
        and (i.status = any($3::text[]) or i.status = 'expired')
        and i.created_at <= $4::timestamptz
        and i.expires_at + ($5::int * interval '1 minute') >= $4::timestamptz
        and (o.order_id is null or o.status not in ('paid','delivered','refunded'))
        and not exists (select 1 from yape_notifications n where n.intent_id = i.id and n.status = 'matched')
      order by i.created_at`,
    [PROVIDER, notif.amount, OPEN, notif.received_at, graceMinutes]
  );
  return res.rows;
}

async function setReview(id, note, tx = null) {
  const runner = tx || { query };
  await runner.query(
    "update yape_notifications set status = 'review', note = $2, alerted_at = null where id = $1 and status in ('unmatched','review')",
    [id, note]
  );
}

/**
 * Intenta asignar un aviso a un intento. Solo asigna sola si hay exactamente un
 * candidato y nada contradice (código distinto, aviso repetido). Si no, revisión.
 */
export async function matchNotification(notifId, { preferIntentId = null } = {}) {
  const decision = await withTransaction(async (tx) => {
    await tx.query("select id from yape_device where id = 1 for update");
    const res = await tx.query("select * from yape_notifications where id = $1 for update", [notifId]);
    const notif = res.rows[0];
    if (!notif) return { status: "not_found" };
    if (notif.status !== "unmatched") return { status: notif.status, notifId };

    // ¿El mismo pago ya había llegado? (el teléfono lo reenvió más tarde)
    const twin = await tx.query(
      `select id, status from yape_notifications
        where content_key = $1 and id <> $2 and status not in ('ignored','unparsed')
          and received_at > $3::timestamptz - interval '30 minutes'
        order by id limit 1`,
      [notif.content_key, notif.id, notif.received_at]
    );
    if (twin.rows[0]) {
      // Mismo nombre, monto y código: casi seguro el celular reenvió el aviso, pero
      // podría ser un segundo pago real. Nunca paga solo ni se descarta en silencio.
      await setReview(notif.id, `Igual al aviso #${twin.rows[0].id} (mismo nombre, monto y código): revisa en tu Yape si hay uno o dos pagos`, tx);
      return { status: "review", notifId };
    }

    const { requireCode } = yapeNotifyConfig();
    // Sin código (p. ej. pagado desde Plin u otro banco) no se puede confirmar solo.
    if (requireCode && !notif.security_code) return { status: "unmatched", reason: "no_code", notifId };

    let candidates = await candidateIntents(tx, notif);
    if (preferIntentId) {
      const preferred = candidates.filter((c) => String(c.id) === String(preferIntentId));
      if (preferred.length) candidates = preferred;
    }
    if (requireCode) {
      // Monto exacto + código que escribió el cliente: las dos cosas deben coincidir.
      const withCode = candidates.filter((c) => c.payer_code === notif.security_code);
      if (withCode.length === 0) return { status: "unmatched", reason: candidates.length ? "awaiting_code" : "no_order", notifId };
      candidates = withCode;
    } else if (candidates.length > 1 && notif.security_code) {
      const byCode = candidates.filter((c) => c.payer_code === notif.security_code);
      if (byCode.length === 1) candidates = byCode;
    }

    if (candidates.length === 0) {
      // ¿Algún cliente dijo haber pagado con este código? Entonces pagó otro monto.
      if (notif.security_code) {
        const claimed = await tx.query(
          `select id from payment_intents
            where provider = $1 and payer_code = $2 and status in ('created','awaiting','expired','underpaid')
              and created_at > now() - interval '6 hours'
            limit 1`,
          [PROVIDER, notif.security_code]
        );
        if (claimed.rows[0]) {
          await setReview(notif.id, `El código coincide con el intento #${claimed.rows[0].id} pero el monto no`, tx);
          return { status: "review", notifId };
        }
      }
      return { status: "unmatched", notifId };
    }
    if (candidates.length > 1) {
      await setReview(notif.id, `${candidates.length} pedidos esperan ${formatMoney(notif.amount, "PEN")}`, tx);
      return { status: "review", notifId };
    }
    const intent = candidates[0];
    if (intent.payer_code && notif.security_code && intent.payer_code !== notif.security_code) {
      await setReview(notif.id, `El cliente escribió el código ${intent.payer_code} y el aviso trae ${notif.security_code}`, tx);
      return { status: "review", notifId };
    }
    await tx.query(
      "update yape_notifications set status = 'matched', intent_id = $2, resolved_by = 'system', resolved_at = now() where id = $1",
      [notif.id, intent.id]
    );
    return { status: "claimed", notifId, intentId: intent.id, amount: Number(notif.amount) };
  });

  if (decision.status !== "claimed") return decision;
  return settleWithNotification({ notifId, intentId: decision.intentId, amount: decision.amount, confirmedBy: "system" });
}

async function settleWithNotification({ notifId, intentId, amount, confirmedBy }) {
  let result;
  try {
    result = await applyPayment({
      intentId, provider: PROVIDER, providerTxnId: `yn:${notifId}`, amount, currency: "PEN", confirmedBy,
      note: `Yape directo · aviso #${notifId}`,
    });
  } catch (error) {
    // No se pudo liquidar: el aviso vuelve a revisión para que no se pierda.
    await query("update yape_notifications set status = 'review', intent_id = null, note = $2, alerted_at = null where id = $1",
      [notifId, `Error al aplicar: ${error.message}`.slice(0, 300)]);
    throw error;
  }
  if (!result.ok || result.status === "duplicate") {
    await query("update yape_notifications set status = 'review', intent_id = null, note = $2, alerted_at = null where id = $1",
      [notifId, `No se aplicó (${result.status})`]);
  }
  await afterSettled(result);
  return { ...result, notifId, intentId };
}

/** Entrega y avisos tras liquidar. Nunca lanza. */
async function afterSettled(result) {
  try {
    if (result.status === "settled" && result.orderId) {
      const { deliverOrder } = await import("./delivery");
      await deliverOrder(result.orderId).catch((err) => console.error("[yape] entrega:", err.message));
    } else if (result.status === "credited" && result.customerId && !result.orderId) {
      await notifyCustomer(result.customerId, `✅ Recarga acreditada: <b>${formatMoney(result.amount, "PEN")}</b>.`);
    } else if (result.status === "needs_manual") {
      await alertAdmin(`Pagado SIN STOCK: ${result.orderId}`, ["Yape directo confirmado sin cupo disponible."], { level: "critical" });
    } else if (result.status === "underpaid") {
      await alertAdmin(`Yape incompleto: ${result.orderId}`, [`Recibido ${formatMoney(result.received, "PEN")} de ${formatMoney(result.expected, "PEN")}.`], { level: "warn" });
    }
  } catch (error) {
    console.error("[yape] después de liquidar:", error.message);
  }
}

// ---------------------------------------------------------------- «Ya pagué»

export function cleanCode(code) {
  const digits = String(code || "").replace(/\D/g, "");
  return digits.length === 3 ? digits : null;
}

/**
 * El cliente dice que ya pagó y, opcionalmente, da el código de seguridad de su
 * constancia. Con el código se busca su aviso; si el monto también coincide se
 * asigna. El código por sí solo nunca confirma un pago.
 */
export async function claimYapeIntent({ intentId, code = null }) {
  const payerCode = cleanCode(code);
  const upd = await query(
    `update payment_intents
        set payer_code = coalesce($2, payer_code), payer_claimed_at = coalesce(payer_claimed_at, now()), updated_at = now()
      where id = $1 and provider = $3
      returning *`,
    [intentId, payerCode, PROVIDER]
  );
  const intent = upd.rows[0];
  if (!intent) return { status: "not_found" };
  if (["paid", "overpaid"].includes(intent.status)) return { status: "paid" };

  const { graceMinutes, requireCode } = yapeNotifyConfig();
  // Sin código (pagó desde Plin u otro banco): queda para revisión manual.
  if (requireCode && !intent.payer_code) return { status: "waiting_manual" };
  const pending = await query(
    `select id, amount, security_code from yape_notifications
      where status = 'unmatched'
        and received_at >= $2::timestamptz
        and received_at <= $3::timestamptz + ($4::int * interval '1 minute')
        and ($5::text is null or security_code = $5)
        and round(amount, 2) = round($1::numeric, 2)
      order by id limit 3`,
    [intent.amount_expected, intent.created_at, intent.expires_at, graceMinutes, intent.payer_code]
  );
  for (const n of pending.rows) {
    const r = await matchNotification(n.id, { preferIntentId: intent.id });
    if (["settled", "credited", "needs_manual", "underpaid"].includes(r.status) && String(r.intentId) === String(intent.id)) {
      return { status: r.status, result: r };
    }
  }
  if (intent.payer_code) {
    // Llegó un Yape con el monto exacto de este pedido pero otro código: el cliente se equivocó al escribirlo.
    const sameAmount = await query(
      `select 1 from yape_notifications
        where status = 'unmatched' and security_code is not null and security_code <> $2
          and round(amount, 2) = round($1::numeric, 2)
          and received_at >= $3::timestamptz and received_at <= $4::timestamptz + ($5::int * interval '1 minute')
        limit 1`,
      [intent.amount_expected, intent.payer_code, intent.created_at, intent.expires_at, graceMinutes]
    );
    if (sameAmount.rows[0]) return { status: "code_mismatch" };
    // Mismo código, otro monto: lo decide el admin.
    const other = await query(
      `select id from yape_notifications
        where status = 'unmatched' and security_code = $1 and received_at >= $2::timestamptz
        order by id limit 1`,
      [intent.payer_code, intent.created_at]
    );
    if (other.rows[0]) await setReview(other.rows[0].id, `El cliente del intento #${intent.id} dio este código, pero el monto no coincide`);
  }
  return { status: "waiting" };
}

// ---------------------------------------------------------------- revisión en Telegram

function adminChatId() {
  return process.env.TELEGRAM_ADMIN_CHAT_ID || null;
}

/** Solo el chat del admin (y, si se definen, solo esos usuarios) puede aprobar. */
export function isYapeAdmin(chatId, userId) {
  const chat = adminChatId();
  if (!chat || String(chatId) !== String(chat)) return false;
  const allowed = String(process.env.TELEGRAM_ADMIN_USER_IDS || "").split(/[,\s]+/).filter(Boolean);
  return allowed.length === 0 || allowed.includes(String(userId));
}

function hhmm(date) {
  if (!date) return "—";
  return new Date(date).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" });
}

function notifLine(n) {
  return `${formatMoney(n.amount, "PEN")} · ${e(n.sender_name || "sin nombre")}${n.security_code ? ` · cód <b>${e(n.security_code)}</b>` : ""} · ${hhmm(n.received_at)}`;
}

async function loadIntentForReview(intentId) {
  const res = await query(
    `select i.*, o.full_name, o.whatsapp, o.service, o.duration, o.status as order_status, o.amount_pen
       from payment_intents i left join orders o on o.order_id = i.order_id
      where i.id = $1`,
    [intentId]
  );
  return res.rows[0] || null;
}

function intentTitle(i) {
  return i.order_id ? `Pedido ${i.order_id}` : `Recarga #${i.id}`;
}

async function intentReviewScreen(intentId, { header = "🟡 <b>Yape por revisar</b>" } = {}) {
  const i = await loadIntentForReview(intentId);
  if (!i) return null;
  const { graceMinutes } = yapeNotifyConfig();
  const notifs = await query(
    `select * from yape_notifications
      where status in ('unmatched','review')
        and received_at >= $1::timestamptz - interval '1 minute'
        and received_at <= $2::timestamptz + ($3::int * interval '1 minute')
      order by (security_code is not distinct from $4) desc, abs(amount - $5) asc, id desc
      limit 4`,
    [i.created_at, i.expires_at, graceMinutes, i.payer_code, Number(i.amount_expected) || 0]
  );
  const lines = [
    header,
    `${e(intentTitle(i))}${i.service ? ` · ${e(i.service)} ${e(i.duration || "")}` : ""}`,
    `Debe llegar: <b>${formatMoney(i.amount_expected, "PEN")}</b>${i.amount_pen && Number(i.amount_pen) !== Number(i.amount_expected) ? ` (precio ${formatMoney(i.amount_pen, "PEN")})` : ""}`,
    i.full_name || i.whatsapp ? `Cliente: ${e(i.full_name || "")} ${e(i.whatsapp || "")}`.trim() : null,
    `Código que escribió: ${i.payer_code ? `<b>${e(i.payer_code)}</b>` : "ninguno"}`,
    `Pidió pagar: ${hhmm(i.created_at)}${i.payer_claimed_at ? ` · dice que pagó: ${hhmm(i.payer_claimed_at)}` : ""}`,
    "",
    notifs.rows.length ? "<b>Yapes recibidos sin asignar:</b>" : "⚠️ <b>No llegó ningún aviso de Yape sin asignar en ese horario.</b> Revisa tu app antes de aprobar.",
    ...notifs.rows.map((n, idx) => `${idx + 1}. ${notifLine(n)}`),
  ].filter((l) => l !== null);
  const keyboard = notifs.rows.map((n, idx) => [{ text: `✅ Es el ${idx + 1} (${formatMoney(n.amount, "PEN")})`, callback_data: `yn:ok:${i.id}:${n.id}` }]);
  keyboard.push([{ text: "✅ Aprobar sin aviso", callback_data: `yn:fz:${i.id}` }, { text: "❌ No llegó", callback_data: `yn:no:${i.id}` }]);
  return { text: lines.join("\n"), keyboard };
}

async function notificationReviewScreen(notifId) {
  const res = await query("select * from yape_notifications where id = $1", [notifId]);
  const n = res.rows[0];
  if (!n) return null;
  const { graceMinutes } = yapeNotifyConfig();
  const intents = await query(
    `select i.id, i.order_id, i.amount_expected, i.payer_code, i.created_at
       from payment_intents i left join orders o on o.order_id = i.order_id
      where i.provider = $1
        and (i.status = any($2::text[]) or i.status in ('expired','underpaid'))
        and i.created_at <= $3::timestamptz
        and i.expires_at + ($4::int * interval '1 minute') >= $3::timestamptz
        and (o.order_id is null or o.status not in ('paid','delivered','refunded'))
      order by (i.payer_code is not distinct from $5) desc, abs(i.amount_expected - $6) asc, i.id desc
      limit 4`,
    [PROVIDER, OPEN, n.received_at, graceMinutes, n.security_code, Number(n.amount) || 0]
  );
  const lines = [
    "🔔 <b>Yape recibido sin pedido claro</b>",
    notifLine(n),
    n.note ? `Motivo: ${e(n.note)}` : null,
    "",
    intents.rows.length ? "<b>Pedidos que esperan pago:</b>" : "No hay pedidos esperando pago en ese horario.",
    ...intents.rows.map((i, idx) => `${idx + 1}. ${e(intentTitle(i))} · ${formatMoney(i.amount_expected, "PEN")}${i.payer_code ? ` · cód ${e(i.payer_code)}` : ""} · ${hhmm(i.created_at)}`),
  ].filter((l) => l !== null);
  const keyboard = intents.rows.map((i, idx) => [{ text: `✅ Asignar al ${idx + 1} (${i.order_id || `recarga #${i.id}`})`, callback_data: `yn:ok:${i.id}:${n.id}` }]);
  keyboard.push([{ text: "🗑 No es de la tienda", callback_data: `yn:ign:${n.id}` }]);
  return { text: lines.filter(Boolean).join("\n"), keyboard };
}

async function sendReview(screen, fallbackSubject) {
  if (!screen) return { sent: false };
  const chat = adminChatId();
  if (chat && process.env.TELEGRAM_BOT_TOKEN) {
    try {
      await sendTelegramMessage(chat, screen.text, { keyboard: screen.keyboard });
      return { sent: true };
    } catch (error) {
      console.error("[yape] revisión por Telegram:", error.message);
    }
  }
  // Sin Telegram: correo al admin; se confirma desde Cobros → Por verificar.
  await alertAdmin(fallbackSubject, [screen.text.replace(/<[^>]+>/g, ""), "Confirma desde Cobros → Por verificar."], { level: "warn" });
  return { sent: false, fallback: true };
}

export async function sendIntentReview(intentId) {
  return sendReview(await intentReviewScreen(intentId), "Yape por revisar");
}

export async function sendNotificationReview(notifId) {
  return sendReview(await notificationReviewScreen(notifId), "Yape recibido sin pedido claro");
}

/** Botones del admin en Telegram: yn:ok:<intent>:<aviso> · yn:fz / yn:fz2:<intent> · yn:no:<intent> · yn:ign:<aviso> · yn:x */
export async function handleYapeAdminCallback({ data, chatId, messageId, from }) {
  if (!isYapeAdmin(chatId, from?.id)) return { text: null, toast: "No autorizado." };
  const by = `telegram:${from?.username ? `@${from.username}` : from?.id}`;
  const [, action, a, b] = String(data).split(":");
  const done = async (text) => {
    if (messageId) await editTelegramMessage(chatId, messageId, text).catch(() => sendTelegramMessage(chatId, text).catch(() => {}));
    else await sendTelegramMessage(chatId, text).catch(() => {});
    return { text };
  };

  if (action === "ok") {
    const r = await adminAssign({ intentId: a, notifId: b, by });
    return done(r.message);
  }
  if (action === "fz") {
    const i = await loadIntentForReview(a);
    if (!i) return done("Intento no encontrado.");
    const text = `⚠️ ¿Aprobar <b>${e(intentTitle(i))}</b> por ${formatMoney(i.amount_expected, "PEN")} <b>sin</b> un aviso de Yape?\nHazlo solo si ves el pago en tu app de Yape.`;
    const keyboard = [[{ text: "Sí, lo veo en mi Yape", callback_data: `yn:fz2:${i.id}` }, { text: "Cancelar", callback_data: `yn:rv:${i.id}` }]];
    if (messageId) await editTelegramMessage(chatId, messageId, text, { keyboard }).catch(() => {});
    return { text };
  }
  if (action === "fz2") {
    const r = await adminForceApprove({ intentId: a, by });
    return done(r.message);
  }
  if (action === "rv") {
    const screen = await intentReviewScreen(a);
    if (screen && messageId) await editTelegramMessage(chatId, messageId, screen.text, { keyboard: screen.keyboard }).catch(() => {});
    return { text: screen?.text || null };
  }
  if (action === "no") {
    const r = await adminDismissIntent(a, { performedBy: by, reason: "Yape no llegó (Telegram)" });
    const msg = r.ok ? `❌ Rechazado por ${e(by)}: ${e(r.orderId || `intento #${a}`)}. Se liberó el cupo.`
      : r.status === "already_paid" ? "Ese pago ya estaba confirmado." : `No se pudo rechazar (${e(r.status)}).`;
    return done(msg);
  }
  if (action === "ign") {
    const res = await query(
      `update yape_notifications set status = 'ignored', resolved_by = $2, resolved_at = now()
        where id = $1 and status in ('unmatched','review') returning id`,
      [a, by]
    );
    return done(res.rowCount ? `🗑 Aviso #${e(a)} marcado como ajeno a la tienda por ${e(by)}.` : "Ese aviso ya estaba resuelto.");
  }
  return { text: null, toast: "Acción desconocida." };
}

function resultMessage(r, title, by) {
  switch (r.status) {
    case "settled": return `✅ ${e(title)} pagado (${e(by)}). Credenciales enviadas al cliente.`;
    case "needs_manual": return `⚠️ ${e(title)} pagado pero SIN STOCK. Importa cupos y usa «Completar entrega».`;
    case "credited": return r.duplicatePayment ? `✅ El pedido ya estaba pagado: ${formatMoney(r.amount, "PEN")} se abonó al saldo del cliente.` : `✅ Recarga acreditada: ${formatMoney(r.amount, "PEN")}.`;
    case "underpaid": return `⚠️ ${e(title)}: llegó ${formatMoney(r.received, "PEN")} de ${formatMoney(r.expected, "PEN")}. Falta ${formatMoney(r.missing, "PEN")}.`;
    case "duplicate": return "Ese aviso de Yape ya se usó para otro pago. No se aplicó de nuevo.";
    default: return `No se pudo aplicar (${e(r.status)}).`;
  }
}

/** El admin asigna un aviso concreto a un intento. El aviso solo puede usarse una vez. */
export async function adminAssign({ intentId, notifId, by = "admin" }) {
  const claim = await withTransaction(async (tx) => {
    await tx.query("select id from yape_device where id = 1 for update");
    const nRes = await tx.query("select * from yape_notifications where id = $1 for update", [notifId]);
    const n = nRes.rows[0];
    if (!n) return { ok: false, message: "Aviso no encontrado." };
    if (!["unmatched", "review"].includes(n.status)) {
      return { ok: false, message: n.status === "matched" ? "Ese aviso ya pagó otro pedido." : `Ese aviso ya está resuelto (${e(n.status)}).` };
    }
    const iRes = await tx.query("select * from payment_intents where id = $1 for update", [intentId]);
    const i = iRes.rows[0];
    if (!i || i.provider !== PROVIDER) return { ok: false, message: "Intento no encontrado." };
    await tx.query(
      "update yape_notifications set status = 'matched', intent_id = $2, resolved_by = $3, resolved_at = now() where id = $1",
      [n.id, i.id, by]
    );
    return { ok: true, amount: Number(n.amount), title: intentTitle(i) };
  });
  if (!claim.ok) return claim;
  const r = await settleWithNotification({ notifId, intentId, amount: claim.amount, confirmedBy: by });
  return { ...r, message: resultMessage(r, claim.title, by) };
}

/** Aprobar sin aviso (el admin lo ve en su app). Una sola vez por intento. */
export async function adminForceApprove({ intentId, by = "admin" }) {
  const i = await loadIntentForReview(intentId);
  if (!i || i.provider !== PROVIDER) return { status: "not_found", message: "Intento no encontrado." };
  const pending = round2(Number(i.amount_expected) - Number(i.amount_received || 0));
  if (!(pending > 0)) return { status: "paid", message: "Ese intento ya está pagado." };
  const r = await applyPayment({
    intentId: i.id, provider: PROVIDER, providerTxnId: `yn-manual:${i.id}`, amount: pending, currency: "PEN",
    confirmedBy: by, note: "Yape directo aprobado a mano sin aviso",
  });
  await afterSettled(r);
  return { ...r, message: resultMessage(r, intentTitle(i), by) };
}

// ---------------------------------------------------------------- worker

/**
 * Paso del worker: reintenta avisos sin asignar, manda a revisión lo dudoso y
 * avisa si el celular dejó de reportar.
 */
export async function yapeNotifyStep() {
  const out = {};
  const { reviewAfterMinutes, heartbeatMinutes, graceMinutes, requireCode, codeWaitMinutes } = yapeNotifyConfig();

  // 1. Avisos sin asignar recientes (p. ej. llegaron segundos antes que el intento).
  const loose = await query(
    "select id from yape_notifications where status = 'unmatched' and received_at > now() - interval '2 hours' order by id limit 50"
  );
  for (const n of loose.rows) {
    const r = await matchNotification(n.id).catch((err) => ({ status: "error", error: err.message }));
    if (r.status !== "unmatched") (out.matched ??= []).push({ notifId: n.id, status: r.status });
  }

  // 2. Avisos en revisión que aún no se avisaron.
  const toReview = await query(
    `update yape_notifications set alerted_at = now()
      where status = 'review' and alerted_at is null returning id`
  );
  for (const n of toReview.rows) await sendNotificationReview(n.id);
  if (toReview.rows.length) out.notificationReviews = toReview.rows.length;

  // 3. Avisos sin dueño mientras hay pedidos esperando: puede ser un monto mal pagado.
  const strays = await query(
    `update yape_notifications n set alerted_at = now()
      where n.status = 'unmatched' and n.alerted_at is null and n.received_at < now() - ($3::int * interval '1 minute')
        and exists (select 1 from payment_intents i
                     where i.provider = $1 and i.status in ('created','awaiting','expired','underpaid')
                       and i.created_at <= n.received_at
                       and i.expires_at + ($2::int * interval '1 minute') >= n.received_at)
      returning id`,
    // Con código obligatorio se da tiempo a que el cliente lo escriba antes de molestar al admin.
    [PROVIDER, graceMinutes, requireCode ? codeWaitMinutes : 1]
  );
  for (const n of strays.rows) await sendNotificationReview(n.id);
  if (strays.rows.length) out.strayReviews = strays.rows.length;

  // 4. El cliente dijo «Ya pagué» y su aviso no aparece.
  const claimed = await query(
    `update payment_intents set review_sent_at = now()
      where provider = $1 and review_sent_at is null and payer_claimed_at is not null
        and payer_claimed_at < now() - ($2::int * interval '1 minute')
        and status in ('created','awaiting','expired','underpaid')
      returning id`,
    [PROVIDER, reviewAfterMinutes]
  );
  for (const i of claimed.rows) await sendIntentReview(i.id);
  if (claimed.rows.length) out.intentReviews = claimed.rows.length;

  // 5. ¿El celular sigue reportando?
  const dev = (await query("select last_seen_at, last_alert_at from yape_device where id = 1")).rows[0] || {};
  const lastSeen = dev.last_seen_at ? new Date(dev.last_seen_at).getTime() : 0;
  const lastAlert = dev.last_alert_at ? new Date(dev.last_alert_at).getTime() : 0;
  let silent = false;
  if (heartbeatMinutes > 0 && Date.now() - lastSeen > heartbeatMinutes * 60_000) silent = true;
  if (!silent && claimed.rows.length) {
    // Sin «ping» configurado: si hay clientes que dicen haber pagado y el teléfono no habla desde antes, es sospechoso.
    const oldest = await query(
      "select min(payer_claimed_at) as t from payment_intents where id = any($1::bigint[])",
      [claimed.rows.map((r) => r.id)]
    );
    const t = oldest.rows[0]?.t ? new Date(oldest.rows[0].t).getTime() : 0;
    if (t && lastSeen < t - 10 * 60_000) silent = true;
  }
  if (silent && Date.now() - lastAlert > 60 * 60_000) {
    await query("update yape_device set last_alert_at = now() where id = 1");
    await alertAdmin("El celular de Yape no está reportando", [
      `Última señal: ${dev.last_seen_at ? new Date(dev.last_seen_at).toLocaleString("es-PE", { timeZone: "America/Lima" }) : "nunca"}.`,
      "Revisa que el teléfono tenga internet, batería y que la app que reenvía las notificaciones siga activa.",
      "Mientras tanto, los pagos se pueden aprobar a mano desde Telegram o Cobros → Por verificar.",
    ], { level: "critical" });
    out.deviceSilent = true;
  }
  return out;
}

/** Para el panel: avisos recientes y estado del celular. */
export async function yapeNotifyOverview() {
  const dev = (await query("select last_seen_at from yape_device where id = 1")).rows[0] || {};
  const recent = await query(
    `select id, sender_name, amount, security_code, received_at, status, intent_id, note, resolved_by
       from yape_notifications where status <> 'ignored' order by id desc limit 50`
  );
  return { lastSeenAt: dev.last_seen_at || null, notifications: recent.rows };
}
