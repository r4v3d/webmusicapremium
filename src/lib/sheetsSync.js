// Sincronización con Google Sheets: arma las filas de la hoja «Inventario»,
// aplica lo que se edita en ella y procesa la hoja «Cargar» (alta masiva).
//
// Una fila = un cupo. Los datos del titular se repiten en cada cupo de su
// cuenta; editarlos en cualquier fila cambia la cuenta y, por los triggers de
// 005_sheets_sync.sql, todas sus filas.
import crypto from "node:crypto";
import { query, withTransaction } from "./pg";
import { createFamilyAccount, deleteFamilyAccount, getOrCreateClient, toDateStr, updateFamilyAccount, updateMemberProfile } from "./db";
import { parseDateInput } from "./importParse";
import { CONFIG } from "../data/config";

export class SheetError extends Error {}

const STATUS_LABELS = {
  free: "Libre",
  active: "Activo",
  pending_payment: "Falta pago",
  expired: "Vencido",
  reserved: "Reservado",
};
const STATUS_FROM_LABEL = {
  libre: "free", disponible: "free", free: "free",
  activo: "active", active: "active",
  "falta pago": "pending_payment", pending_payment: "pending_payment",
  vencido: "expired", expired: "expired",
};
const CURRENCIES = ["PEN", "USD", "ARS"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Las columnas de la hoja, en orden. El script de Apps Script usa las mismas claves. */
export const INVENTORY_KEYS = [
  "id", "plataforma", "correoTitular", "claveTitular", "renuevaTitular", "costoTitular", "monedaTitular",
  "cupo", "estado", "correoMiembro", "claveMiembro", "tipoCorreo", "cliente", "whatsapp", "precio", "vence",
  "notasTitular", "actualizado", "cuenta", "nombre",
];
const ACCOUNT_KEYS = ["correoTitular", "claveTitular", "renuevaTitular", "costoTitular", "monedaTitular", "notasTitular"];
const SLOT_KEYS = ["estado", "correoMiembro", "claveMiembro", "tipoCorreo", "cliente", "whatsapp", "precio", "vence", "nombre"];
// NOMBRE (formato de tabla): un número se toma como WhatsApp; cualquier otra cosa (p. ej. @usuario), como nombre.
const PHONE_RE = /^\+?[\d\s().-]+$/;
const looksLikePhone = (v) => PHONE_RE.test(v) && v.replace(/\D/g, "").length >= 6;

export function sheetServices() {
  return Object.entries(CONFIG.services).map(([code, s]) => ({ code, name: s.name }));
}

function serviceName(code) {
  return CONFIG.services[code]?.name || code;
}

function resolveService(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return null;
  return Object.entries(CONFIG.services).find(([code, s]) => code === v || s.name.toLowerCase() === v)?.[0] || null;
}

const text = (v) => (v == null ? "" : String(v).trim());
const digits = (v) => text(v).replace(/\D/g, "");
const money = (v) => (v == null || v === "" ? "" : Math.round(Number(v) * 100) / 100);

function rowVersion(row) {
  const values = INVENTORY_KEYS.map((k) => row[k]);
  return crypto.createHash("sha1").update(JSON.stringify(values)).digest("hex").slice(0, 16);
}

/**
 * Filas del inventario, ordenadas por plataforma, titular y cupo.
 * Sin slotIds, todo el inventario (la recarga completa de la hoja).
 */
export async function buildInventoryRows(slotIds = null) {
  if (slotIds && slotIds.length === 0) return [];
  const { rows } = await query(
    `select s.id::text as id, s.platform_account_id::text as cuenta, pa.platform_code, pa.account_email, pa.account_password, pa.owner_renewal_date,
            pa.renewal_cost, pa.renewal_currency, pa.notes, s.slot_number, s.status,
            (s.status = 'reserved' and s.reserved_until > now()) as reserved_live,
            s.member_email, s.member_password, s.email_type, c.display_name,
            (select cc.contact_value from customer_contacts cc
              where cc.customer_id = s.customer_id and cc.contact_type = 'whatsapp'
              order by cc.is_primary desc, cc.id limit 1) as whatsapp,
            sub.plan_price, sub.renewal_date,
            to_char(greatest(s.updated_at, pa.updated_at, coalesce(sub.updated_at, s.updated_at))
                    at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI') as actualizado
       from account_slots s
       join platform_accounts pa on pa.id = s.platform_account_id
       left join customers c on c.id = s.customer_id
       left join lateral (
         select plan_price, renewal_date, updated_at from subscriptions sb
          where sb.account_slot_id = s.id and sb.subscription_status in ('active','pending_payment')
          order by sb.id desc limit 1
       ) sub on true
      where ($1::text[] is null or s.id::text = any($1::text[]))
      order by pa.platform_code, lower(pa.account_email), s.slot_number nulls last, s.id`,
    [slotIds ? slotIds.map(String) : null]
  );
  return rows.map(toSheetRow);
}

function toSheetRow(r) {
  // Una reserva vencida no retiene el cupo: para la hoja está libre.
  const status = r.status === "reserved" && !r.reserved_live ? "free" : r.status;
  const occupied = status !== "free" && status !== "reserved";
  const row = {
    id: r.id,
    plataforma: serviceName(r.platform_code),
    correoTitular: r.account_email || "",
    claveTitular: r.account_password || "",
    renuevaTitular: toDateStr(r.owner_renewal_date) || "",
    costoTitular: money(r.renewal_cost),
    monedaTitular: r.renewal_currency || "PEN",
    cupo: r.slot_number ?? "",
    estado: STATUS_LABELS[status] || status,
    correoMiembro: r.member_email || "",
    claveMiembro: r.member_password || "",
    tipoCorreo: (r.email_type || "admin") === "admin" ? "Propio" : "Cliente",
    cliente: occupied ? r.display_name || "" : "",
    whatsapp: occupied ? r.whatsapp || "" : "",
    precio: occupied && r.plan_price != null ? money(r.plan_price) : "",
    vence: occupied ? toDateStr(r.renewal_date) || "" : "",
    notasTitular: r.notes || "",
    actualizado: r.actualizado || "",
    cuenta: r.cuenta || "",
    // Lo que se ve en la columna NOMBRE: el WhatsApp o, si no tiene, el nombre.
    nombre: occupied ? r.whatsapp || r.display_name || "" : "",
  };
  row.version = rowVersion(row);
  return row;
}

// --- Edición desde la hoja «Inventario» ---

function parseDateField(value, label) {
  const v = text(value);
  if (!v) return null;
  const date = parseDateInput(v);
  if (!date || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) {
    throw new SheetError(`${label}: fecha no válida («${v}»). Usa el formato día/mes/año.`);
  }
  return date;
}

function parseMoneyField(value, label) {
  const v = text(value).replace(",", ".");
  if (!v) return 0;
  const n = Number(v.replace(/^s\/\.?\s*/i, ""));
  if (!Number.isFinite(n) || n < 0) throw new SheetError(`${label}: debe ser un número mayor o igual a 0.`);
  return Math.round(n * 100) / 100;
}

function parseEmailField(value, label, { required = false } = {}) {
  const v = text(value);
  if (!v) {
    if (required) throw new SheetError(`${label} no puede quedar vacío.`);
    return "";
  }
  if (!EMAIL_RE.test(v)) throw new SheetError(`${label}: «${v}» no parece un correo.`);
  return v;
}

async function assertTitularFree(tx, email, exceptAccountId) {
  const res = await tx.query(
    `select platform_code from platform_accounts
      where lower(account_email) = lower($1) and ($2::text is null or id::text <> $2::text) limit 1`,
    [email, exceptAccountId == null ? null : String(exceptAccountId)]
  );
  if (res.rows[0]) throw new SheetError(`El titular ${email} ya existe en ${serviceName(res.rows[0].platform_code)}.`);
}

async function assertMemberFree(tx, email, platformCode, exceptSlotId) {
  const res = await tx.query(
    `select pa.account_email from account_slots s
       join platform_accounts pa on pa.id = s.platform_account_id
      where pa.platform_code = $1 and lower(s.member_email) = lower($2)
        and ($3::text is null or s.id::text <> $3::text)
      limit 1`,
    [platformCode, email, exceptSlotId == null ? null : String(exceptSlotId)]
  );
  if (res.rows[0]) throw new SheetError(`El correo miembro ${email} ya está en la cuenta de ${res.rows[0].account_email}.`);
}

/**
 * Traduce NOMBRE a las columnas de siempre: escribirlo ocupa el cupo (Activo),
 * borrarlo lo libera. Si no cambió respecto de lo que se ve, no hace nada.
 */
function nombreToChanges(changes, cur) {
  const { nombre, ...rest } = changes;
  const value = text(nombre);
  const curStatus = cur.status === "reserved" && !cur.reserved_live ? "free" : cur.status;
  const occupied = curStatus !== "free" && curStatus !== "reserved";
  const shown = occupied ? cur.whatsapp || cur.display_name || "" : "";
  if (value === shown) return rest;

  if (!value) return occupied && !("estado" in rest) ? { ...rest, estado: "Libre" } : rest;

  const next = { ...rest };
  if (looksLikePhone(value)) {
    next.whatsapp = value;
    // Otro número = otra persona: no heredar el nombre del cliente anterior.
    if (digits(value) !== digits(cur.whatsapp)) next.cliente = "";
  } else {
    next.cliente = value;
    next.whatsapp = "";
  }
  if (!occupied && !("estado" in rest)) next.estado = "Activo";
  return next;
}

async function applyOneEdit(tx, slotId, changes) {
  const cur = (await tx.query(
    `select s.*, pa.platform_code, pa.account_email, pa.account_password, pa.owner_renewal_date,
            pa.renewal_cost, pa.renewal_currency, pa.notes as account_notes,
            (s.status = 'reserved' and s.reserved_until > now()) as reserved_live,
            c.display_name,
            (select cc.contact_value from customer_contacts cc
              where cc.customer_id = s.customer_id and cc.contact_type = 'whatsapp'
              order by cc.is_primary desc, cc.id limit 1) as whatsapp
       from account_slots s
       join platform_accounts pa on pa.id = s.platform_account_id
       left join customers c on c.id = s.customer_id
      where s.id::text = $1
      for update of s`,
    [String(slotId)]
  )).rows[0];
  if (!cur) throw new SheetError("Este cupo ya no existe en el panel. Recarga el inventario.");

  // Titular vacío = «borrar»: no se aplica a la fila; applySheetEdits decide si
  // se borra la cuenta (cuando se limpian todas sus filas). El resto de la fila sí se guarda.
  const clearTitular = Object.prototype.hasOwnProperty.call(changes, "correoTitular") && !text(changes.correoTitular);
  if (clearTitular) {
    const { correoTitular: _omit, ...rest } = changes;
    changes = rest;
  }
  const has = (k) => Object.prototype.hasOwnProperty.call(changes, k);
  let accountChanged = false;

  // Datos del titular: valen para toda la cuenta.
  const acc = {};
  // Otro titular en la fila no renombra la cuenta aquí: applySheetEdits solo
  // la renombra si cambiaron TODAS sus filas al mismo correo (pegar una columna
  // desalineada no debe renombrar cuentas en cadena).
  let renameTo = null;
  if (has("correoTitular")) {
    const email = parseEmailField(changes.correoTitular, "Correo titular", { required: true });
    if (email !== cur.account_email) renameTo = email;
  }
  if (has("claveTitular")) {
    const password = text(changes.claveTitular);
    if (!password) throw new SheetError("La clave del titular no puede quedar vacía.");
    if (password !== cur.account_password) acc.password = password;
  }
  if (has("renuevaTitular")) {
    const date = parseDateField(changes.renuevaTitular, "Renueva titular");
    if (date !== (toDateStr(cur.owner_renewal_date) || null)) acc.ownerRenewalDate = date;
  }
  if (has("costoTitular")) {
    const cost = parseMoneyField(changes.costoTitular, "Costo titular");
    if (cost !== (Number(cur.renewal_cost) || 0)) acc.renewalCost = cost;
  }
  if (has("monedaTitular")) {
    const currency = text(changes.monedaTitular).toUpperCase() || "PEN";
    if (!CURRENCIES.includes(currency)) throw new SheetError(`Moneda: usa ${CURRENCIES.join(", ")}.`);
    if (currency !== (cur.renewal_currency || "PEN")) acc.renewalCurrency = currency;
  }
  if (has("notasTitular")) {
    const notes = text(changes.notasTitular);
    if (notes !== (cur.account_notes || "")) acc.notes = notes;
  }
  if (Object.keys(acc).length) {
    await updateFamilyAccount(cur.platform_account_id, acc, { tx });
    accountChanged = true;
  }

  // Datos del cupo.
  if (has("nombre")) changes = nombreToChanges(changes, cur);
  if (!SLOT_KEYS.some(has)) return { accountId: cur.platform_account_id, accountChanged, clearTitular, renameTo };
  if (cur.reserved_live) {
    throw new SheetError("Este cupo está apartado por una compra en curso. Espera unos minutos y vuelve a editarlo.");
  }

  const upd = {};
  const memberEmail = has("correoMiembro") ? parseEmailField(changes.correoMiembro, "Correo miembro") : cur.member_email || "";
  if (has("correoMiembro") && memberEmail !== (cur.member_email || "")) {
    if (memberEmail) await assertMemberFree(tx, memberEmail, cur.platform_code, cur.id);
    upd.memberEmail = memberEmail;
  }
  if (has("claveMiembro")) {
    const password = text(changes.claveMiembro);
    if (password !== (cur.member_password || "")) upd.memberPassword = password;
  }
  if (has("tipoCorreo")) {
    const v = text(changes.tipoCorreo).toLowerCase();
    const type = v === "propio" || v === "admin" ? "admin" : v === "cliente" || v === "client" ? "client" : null;
    if (!type) throw new SheetError("Tipo de correo: usa Propio o Cliente.");
    const curType = (cur.email_type || "admin") === "admin" ? "admin" : "client";
    if (type !== curType) upd.emailType = type;
  }

  const curStatus = cur.status === "reserved" ? "free" : cur.status;
  let nextStatus = curStatus;
  if (has("estado")) {
    const label = text(changes.estado).toLowerCase();
    if (label === "reservado") throw new SheetError("«Reservado» lo pone el sistema durante una compra; no se puede elegir.");
    nextStatus = STATUS_FROM_LABEL[label];
    if (!nextStatus) throw new SheetError("Estado: usa Libre, Activo, Falta pago o Vencido.");
  }
  const statusChanged = has("estado") && nextStatus !== cur.status;

  if (nextStatus === "free") {
    const filled = ["cliente", "whatsapp", "precio", "vence"].filter((k) => has(k) && text(changes[k]));
    if (filled.length && !has("estado")) {
      throw new SheetError("Este cupo está libre: escribe primero el NOMBRE del cliente.");
    }
    if (statusChanged) Object.assign(upd, { status: "free", clientId: null, pricePen: 0, renewalDate: null });
  } else {
    const clientTouched = statusChanged || has("cliente") || has("whatsapp");
    if (clientTouched) {
      const whatsapp = has("whatsapp") ? text(changes.whatsapp) : cur.whatsapp || "";
      const nickname = has("cliente") ? text(changes.cliente) : cur.display_name || "";
      if (digits(whatsapp).length < 6 && !nickname) {
        throw new SheetError("Para un cupo ocupado hace falta el NOMBRE del cliente (WhatsApp o usuario).");
      }
      const sameClient = cur.customer_id && digits(whatsapp) === digits(cur.whatsapp) && nickname === (cur.display_name || "");
      if (!sameClient) {
        const client = await getOrCreateClient(whatsapp, nickname, memberEmail, { tx });
        upd.clientId = client.id;
      }
    }
    if (statusChanged) upd.status = nextStatus;
    if (has("precio")) upd.pricePen = parseMoneyField(changes.precio, "Precio");
    if (has("vence")) upd.renewalDate = parseDateField(changes.vence, "Vence");
  }

  if (Object.keys(upd).length) await updateMemberProfile(cur.id, upd, { tx });
  return { accountId: cur.platform_account_id, accountChanged, clearTitular, renameTo };
}

/**
 * Aplica ediciones de la hoja. Cada una en su propia transacción: una fila con
 * error no impide las demás. Devuelve el resultado por cupo y las filas frescas
 * de todo lo afectado (y del cupo con error, para que la hoja deshaga el cambio).
 */
export async function applySheetEdits(edits) {
  const results = [];
  const touchedSlots = new Set();
  const touchedAccounts = new Set();
  const clearedByAccount = new Map(); // cuenta → cupos donde se vació el titular
  const renameByAccount = new Map(); // cuenta → { cupos, correos nuevos pedidos }

  for (const edit of edits || []) {
    const id = text(edit?.id);
    const changes = edit?.changes && typeof edit.changes === "object" ? edit.changes : {};
    if (!id) continue;
    touchedSlots.add(id);
    try {
      const known = Object.keys(changes).filter((k) => ACCOUNT_KEYS.includes(k) || SLOT_KEYS.includes(k));
      if (!known.length) {
        results.push({ id, ok: false, error: "Esa columna no se edita desde la hoja." });
        continue;
      }
      const picked = Object.fromEntries(known.map((k) => [k, changes[k]]));
      const r = await withTransaction((tx) => applyOneEdit(tx, id, picked));
      if (r.accountChanged) touchedAccounts.add(String(r.accountId));
      if (r.clearTitular) {
        const key = String(r.accountId);
        if (!clearedByAccount.has(key)) clearedByAccount.set(key, new Set());
        clearedByAccount.get(key).add(id);
      }
      if (r.renameTo) {
        const key = String(r.accountId);
        if (!renameByAccount.has(key)) renameByAccount.set(key, { ids: new Set(), targets: new Set() });
        renameByAccount.get(key).ids.add(id);
        renameByAccount.get(key).targets.add(r.renameTo);
      }
      results.push({ id, ok: true });
    } catch (error) {
      if (!(error instanceof SheetError)) console.error("[sheets] edición fallida", id, error);
      results.push({ id, ok: false, error: error instanceof SheetError ? error.message : "Error interno al guardar. Reintenta." });
    }
  }

  // Titular borrado en TODAS sus filas y cupos ya vacíos → se borra la cuenta.
  // Si no, el titular se queda y la fila lo explica (así no se pierde una cuenta con clientes).
  for (const [accountId, clearedIds] of clearedByAccount) {
    const slots = (await query(
      `select id::text as id, status, customer_id, member_email,
              (status = 'reserved' and reserved_until > now()) as reserved_live
         from account_slots where platform_account_id::text = $1`,
      [accountId]
    )).rows;
    const allCleared = slots.length > 0 && slots.every((s) => clearedIds.has(s.id));
    const allEmpty = slots.every((s) => !s.reserved_live && !s.customer_id && !text(s.member_email) &&
      (s.status === "free" || s.status === "reserved"));
    let nota;
    if (allCleared && allEmpty) {
      await deleteFamilyAccount(accountId);
      for (const s of slots) touchedSlots.add(s.id);
      nota = "titular borrado";
    } else {
      touchedAccounts.add(accountId);
      nota = allCleared
        ? "el titular no se borró: aún tiene clientes o correos (limpia sus filas completas)"
        : "el titular no se borró: para borrarlo, limpia sus 5 filas completas a la vez";
    }
    for (const r of results) if (r.ok && clearedIds.has(r.id)) r.nota = nota;
  }

  // Renombrar un titular: solo si TODAS sus filas llegaron con el mismo correo nuevo.
  for (const [accountId, { ids, targets }] of renameByAccount) {
    const slotIds = (await query(
      "select id::text as id from account_slots where platform_account_id::text = $1",
      [accountId]
    )).rows.map((s) => s.id);
    let error = null;
    if (targets.size === 1 && slotIds.length > 0 && slotIds.every((s) => ids.has(s))) {
      const [target] = targets;
      try {
        await withTransaction(async (tx) => {
          await assertTitularFree(tx, target, accountId);
          await updateFamilyAccount(accountId, { masterEmail: target }, { tx });
        });
        touchedAccounts.add(accountId);
      } catch (e) {
        if (!(e instanceof SheetError)) console.error("[sheets] renombrar titular", accountId, e);
        error = `El titular no cambió: ${e instanceof SheetError ? e.message : "error interno"} El resto de la fila sí se guardó.`;
      }
    } else {
      error = "El titular no cambió: para renombrarlo, cambia el correo en sus 5 filas a la vez. " +
        "Para pasar un cliente a otro titular usa Transferir en el panel. El resto de la fila sí se guardó.";
    }
    if (!error) continue;
    for (const r of results) {
      if (r.ok && ids.has(r.id)) {
        r.ok = false;
        r.error = error;
        delete r.nota;
      }
    }
  }

  if (touchedAccounts.size) {
    const res = await query(
      "select id::text as id from account_slots where platform_account_id::text = any($1::text[])",
      [[...touchedAccounts]]
    );
    for (const r of res.rows) touchedSlots.add(r.id);
  }
  const rows = await buildInventoryRows([...touchedSlots]);
  const existing = new Set(rows.map((r) => r.id));
  const deleted = [...touchedSlots].filter((id) => !existing.has(id));
  return { results, rows, deleted };
}

// --- Titular nuevo (panel o menú de la hoja) ---

/**
 * Crea una cuenta titular con sus 5 cupos vacíos. Sin clave usa
 * DEFAULT_TITULAR_PASSWORD del servidor (la de siempre; no vive en el código).
 * Devuelve las filas de los 5 cupos.
 */
export async function createTitular({ service = "tidal", email, password = "" } = {}) {
  const code = resolveService(service);
  if (!code) throw new SheetError(`Plataforma desconocida («${text(service)}»).`);
  const masterEmail = parseEmailField(email, "Correo titular", { required: true });
  const masterPassword = text(password) || text(process.env.DEFAULT_TITULAR_PASSWORD);
  if (!masterPassword) {
    throw new SheetError("Falta la clave del titular: escríbela o configura DEFAULT_TITULAR_PASSWORD en el servidor.");
  }
  const accountId = await withTransaction(async (tx) => {
    await assertTitularFree(tx, masterEmail, null);
    const created = await createFamilyAccount({
      service: code, masterEmail, password: masterPassword, ownerRenewalDate: plus30(), renewalCost: 0, notes: "",
    }, { tx });
    await tx.query(
      `insert into account_slots(platform_account_id, slot_number, status, email_type, member_email, member_password)
       select $1, n, 'free', 'admin', '', '' from generate_series(1, 5) as n`,
      [created.id]
    );
    return created.id;
  });
  const ids = await query("select id::text as id from account_slots where platform_account_id = $1", [accountId]);
  return buildInventoryRows(ids.rows.map((r) => r.id));
}

// --- Alta masiva desde la hoja «Cargar» ---

const plus30 = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return toDateStr(d);
};

async function loadOneRow(tx, row, { defaultPassword = "", notes = "Cargada desde Google Sheets." } = {}) {
  const service = resolveService(row.plataforma);
  if (!service) {
    throw new SheetError(`Plataforma desconocida («${text(row.plataforma)}»). Usa ${sheetServices().map((s) => s.name).join(", ")}.`);
  }
  const masterEmail = parseEmailField(row.correoTitular, "Correo titular", { required: true });
  const masterPassword = text(row.claveTitular);
  const renewal = parseDateField(row.renuevaTitular, "Renueva titular");
  const cost = text(row.costoTitular) ? parseMoneyField(row.costoTitular, "Costo titular") : null;
  const memberEmail = parseEmailField(row.correoMiembro, "Correo miembro");
  const memberPassword = text(row.claveMiembro);
  if (memberEmail && !memberPassword) throw new SheetError("Falta la clave del miembro.");
  if (!memberEmail && memberPassword) throw new SheetError("Falta el correo del miembro.");

  const found = (await tx.query(
    `select id, platform_code, account_password, owner_renewal_date, renewal_cost from platform_accounts
      where lower(account_email) = lower($1) order by id limit 1 for update`,
    [masterEmail]
  )).rows[0];

  const parts = [];
  let accountId;
  if (found) {
    if (found.platform_code !== service) {
      throw new SheetError(`Ese titular ya está registrado en ${serviceName(found.platform_code)}.`);
    }
    accountId = found.id;
    const acc = {};
    if (masterPassword && masterPassword !== found.account_password) acc.password = masterPassword;
    if (renewal && renewal !== toDateStr(found.owner_renewal_date)) acc.ownerRenewalDate = renewal;
    if (cost != null && cost !== (Number(found.renewal_cost) || 0)) acc.renewalCost = cost;
    if (Object.keys(acc).length) {
      await updateFamilyAccount(accountId, acc, { tx });
      parts.push("titular actualizado");
    }
  } else {
    const password = masterPassword || defaultPassword;
    if (!password) throw new SheetError("Falta la clave del titular (es una cuenta nueva).");
    const created = await createFamilyAccount({
      service, masterEmail, password, ownerRenewalDate: renewal || plus30(), renewalCost: cost || 0, notes,
    }, { tx });
    accountId = created.id;
    await tx.query(
      `insert into account_slots(platform_account_id, slot_number, status, email_type, member_email, member_password)
       select $1, n, 'free', 'admin', '', '' from generate_series(1, 5) as n`,
      [accountId]
    );
    parts.push("cuenta nueva con 5 cupos");
  }

  let sellable = 0;
  let slotId = null;
  if (memberEmail) {
    const same = (await tx.query(
      `select s.id, s.slot_number, s.member_password, s.platform_account_id, pa.account_email
         from account_slots s join platform_accounts pa on pa.id = s.platform_account_id
        where pa.platform_code = $1 and lower(s.member_email) = lower($2)
        order by s.id limit 1 for update of s`,
      [service, memberEmail]
    )).rows[0];

    if (same && String(same.platform_account_id) !== String(accountId)) {
      throw new SheetError(`El correo miembro ya está en la cuenta de ${same.account_email}.`);
    }
    if (same) {
      slotId = same.id;
      if (same.member_password !== memberPassword) {
        await updateMemberProfile(same.id, { memberPassword }, { tx });
        parts.push(`clave del cupo ${same.slot_number} actualizada`);
      } else {
        parts.push(`el miembro ya estaba en el cupo ${same.slot_number}`);
      }
    } else {
      const empty = (await tx.query(
        `select id, slot_number from account_slots
          where platform_account_id = $1 and status = 'free'
            and btrim(coalesce(member_email, '')) = '' and customer_id is null
          order by slot_number nulls last, id limit 1 for update`,
        [accountId]
      )).rows[0];
      if (!empty) throw new SheetError("Esa cuenta ya no tiene cupos vacíos.");
      slotId = empty.id;
      await updateMemberProfile(empty.id, { memberEmail, memberPassword, emailType: "admin" }, { tx });
      parts.push(`cupo ${empty.slot_number} listo para vender`);
      sellable = 1;
    }
  }

  return { service, sellable, slotId, accountId, message: parts.length ? parts.join(" · ") : "sin cambios" };
}

// --- Filas nuevas de la pestaña «Clientes» (sin ID) ---

/** «g.etmushroom7572@gmail.com - IO» → correo y etiqueta («IO»), que queda como nota del titular. */
function splitTitular(value) {
  const raw = text(value);
  const email = /[^\s@]+@[^\s@]+\.[^\s@]+/.exec(raw)?.[0] || raw;
  const label = raw.replace(email, "").replace(/^[\s\-–—:|]+|[\s\-–—:|]+$/g, "").trim();
  return { email: email.replace(/[.,;]+$/, ""), label };
}

async function importOneRow(tx, row) {
  const { email, label } = splitTitular(row.correoTitular);
  if (!email) throw new SheetError("Falta el CORREO TITULAR.");
  const nombre = text(row.nombre);
  const hasSlotData = nombre || text(row.precio) || text(row.vence);
  if (hasSlotData && !text(row.correoMiembro)) {
    throw new SheetError("Falta el CORREO CLIENTE: sin él no hay cupo donde poner esta fila.");
  }
  const loaded = await loadOneRow(tx, {
    plataforma: row.plataforma || "tidal",
    correoTitular: email,
    correoMiembro: row.correoMiembro,
    claveMiembro: row.claveMiembro,
  }, { defaultPassword: text(process.env.DEFAULT_TITULAR_PASSWORD), notes: label });

  if (loaded.slotId && hasSlotData) {
    const changes = { nombre };
    if (text(row.precio)) changes.precio = row.precio;
    if (text(row.vence)) changes.vence = row.vence;
    await applyOneEdit(tx, loaded.slotId, changes);
  }
  return { ...loaded, sellable: loaded.sellable && !nombre ? 1 : 0 };
}

/**
 * Filas pegadas en «Clientes» sin ID: crea el titular si no existe (5 cupos,
 * clave DEFAULT_TITULAR_PASSWORD) y pone la fila en su primer cupo libre.
 * Si el correo cliente ya estaba en ese titular, actualiza ese cupo (pegar dos
 * veces no duplica). Cada fila en su transacción.
 */
export async function importSheetRows(rows) {
  const results = [];
  const sellableByService = {};
  const accounts = new Set();
  for (const row of rows || []) {
    const fila = row?.fila ?? null;
    try {
      const r = await withTransaction((tx) => importOneRow(tx, row || {}));
      accounts.add(String(r.accountId));
      if (r.sellable) sellableByService[r.service] = (sellableByService[r.service] || 0) + 1;
      results.push({ fila, ok: true, mensaje: r.message });
    } catch (error) {
      if (!(error instanceof SheetError)) console.error("[sheets] fila nueva fallida", fila, error);
      results.push({ fila, ok: false, mensaje: error instanceof SheetError ? error.message : "Error interno al guardar. Reintenta." });
    }
  }
  let slotRows = [];
  if (accounts.size) {
    const ids = await query(
      "select id::text as id from account_slots where platform_account_id::text = any($1::text[])",
      [[...accounts]]
    );
    slotRows = await buildInventoryRows(ids.rows.map((r) => r.id));
  }
  return { results, rows: slotRows, sellableByService };
}

/** Procesa filas de «Cargar». Cada fila en su transacción; devuelve el resultado por fila. */
export async function loadSheetRows(rows) {
  const results = [];
  const sellableByService = {};
  for (const row of rows || []) {
    const fila = row?.fila ?? null;
    try {
      const r = await withTransaction((tx) => loadOneRow(tx, row || {}));
      if (r.sellable) sellableByService[r.service] = (sellableByService[r.service] || 0) + r.sellable;
      results.push({ fila, ok: true, mensaje: r.message });
    } catch (error) {
      if (!(error instanceof SheetError)) console.error("[sheets] carga fallida", fila, error);
      results.push({ fila, ok: false, mensaje: error instanceof SheetError ? error.message : "Error interno al guardar. Reintenta." });
    }
  }
  return { results, sellableByService };
}
