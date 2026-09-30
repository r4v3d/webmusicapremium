// Empuje panel → hoja. El worker vacía sheet_outbox (lo llenan los triggers de
// 005_sheets_sync.sql) y manda las filas frescas a la app web del script.
// Escucha NOTIFY mpb_sheets para hacerlo en segundos, no al siguiente ciclo.
import pg from "pg";
import { query } from "./pg";
import { buildInventoryRows, buildTitularRows } from "./sheetsSync";
import { sheetsPushConfigured, sheetsWebAppUrl, signSheets } from "./sheetsAuth";
import { alertAdmin } from "./notify";

const BATCH = 1500;
const state = { failingSince: null, alerted: false, nextTryAt: 0, backoffMs: 0 };

/** Manda un mensaje firmado a la app web. La respuesta debe ser {ok:true,...}. */
export async function postToSheet(message, { fetchImpl = fetch, url = sheetsWebAppUrl(), now = Date.now() } = {}) {
  // Solo ASCII (tildes como \uXXXX): la firma no depende de cómo Google decodifique el cuerpo.
  const payload = JSON.stringify(message).replace(/[\u007f-\uffff]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
  const body = JSON.stringify({ ts: now, sig: signSheets(now, payload), payload });
  // Apps Script responde con un 302 a googleusercontent: fetch lo sigue con GET y ahí está la respuesta.
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  const raw = await res.text();
  let json = null;
  try { json = JSON.parse(raw); } catch { /* HTML de error de Google */ }
  if (!json) {
    throw new Error(`La hoja respondió HTTP ${res.status} sin JSON. ¿La app web está implementada con acceso «Cualquier persona»?`);
  }
  if (!json.ok) throw new Error(json.error || `La hoja rechazó el envío (HTTP ${res.status}).`);
  return json;
}

/**
 * Un pase: toma hasta BATCH cupos pendientes, los manda y los borra de la cola.
 * Si la hoja no está configurada, la cola se vacía sin enviar (la primera
 * sincronización completa la hace el propio script al configurarse).
 */
export async function flushSheetOutbox({ fetchImpl = fetch, now = Date.now() } = {}) {
  if (!sheetsPushConfigured()) {
    const res = await query("delete from sheet_outbox");
    return { pushed: 0, discarded: res.rowCount, more: false };
  }
  if (now < state.nextTryAt) return { pushed: 0, waiting: true, more: false };

  const pending = await query("select id, slot_id from sheet_outbox order by id limit $1", [BATCH]);
  if (!pending.rows.length) return { pushed: 0, more: false };

  const ids = pending.rows.map((r) => r.id);
  const slotIds = [...new Set(pending.rows.map((r) => r.slot_id))];
  const rows = await buildInventoryRows(slotIds);
  const found = new Set(rows.map((r) => r.id));
  const deleted = slotIds.filter((id) => !found.has(id));

  try {
    // «Titulares» es chica (una fila por cuenta): va completa y la hoja solo reescribe si algo cambió.
    const titulares = await buildTitularRows();
    await postToSheet({ type: "rows", rows, deleted, titulares }, { fetchImpl, now });
  } catch (error) {
    state.failingSince ??= now;
    state.backoffMs = Math.min(Math.max(state.backoffMs * 2, 15_000), 5 * 60_000);
    state.nextTryAt = now + state.backoffMs;
    if (!state.alerted && now - state.failingSince > 15 * 60_000) {
      state.alerted = true;
      await alertAdmin("Google Sheets no recibe los cambios del panel", [
        `Falla desde hace ${Math.round((now - state.failingSince) / 60_000)} min: ${error.message}`,
        "Los cambios quedan en cola y se enviarán cuando vuelva. En la hoja: MusicaPremium → Probar conexión.",
      ], { level: "warn" });
    }
    throw error;
  }

  if (state.alerted) {
    await alertAdmin("Google Sheets vuelve a recibir los cambios", ["La cola pendiente se envió."]);
  }
  Object.assign(state, { failingSince: null, alerted: false, nextTryAt: 0, backoffMs: 0 });
  await query("delete from sheet_outbox where id = any($1::bigint[])", [ids]);
  return { pushed: rows.length, deleted: deleted.length, more: pending.rows.length === BATCH };
}

/**
 * LISTEN mpb_sheets en una conexión propia. Llama onNotify en cada aviso y se
 * reconecta sola si la conexión se cae. Devuelve una función para detenerla.
 */
export function listenSheetOutbox(onNotify, { log = console } = {}) {
  let client = null;
  let stopped = false;
  let retry = null;

  const connect = async () => {
    if (stopped) return;
    client = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: "musicapremium-sheets-listen" });
    client.on("notification", () => onNotify());
    client.on("error", (e) => {
      log.error("[sheets] conexión LISTEN caída:", e.message);
      reconnect();
    });
    try {
      await client.connect();
      await client.query("listen mpb_sheets");
      onNotify(); // lo que se acumuló mientras no escuchábamos
    } catch (e) {
      log.error("[sheets] no se pudo escuchar:", e.message);
      reconnect();
    }
  };
  const reconnect = () => {
    if (stopped || retry) return;
    client?.end().catch(() => {});
    retry = setTimeout(() => { retry = null; connect(); }, 10_000);
  };

  connect();
  return async () => {
    stopped = true;
    clearTimeout(retry);
    await client?.end().catch(() => {});
  };
}

export function __resetSheetsPushState() {
  Object.assign(state, { failingSince: null, alerted: false, nextTryAt: 0, backoffMs: 0 });
}
