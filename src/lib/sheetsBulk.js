// Sincronización completa de Google Sheets («la hoja manda»).
//
// Para cuando se reemplaza la hoja entera pegando datos arreglados: las filas
// no se atan a un ID sino a su contenido. En «Clientes» un cliente es el par
// (correo titular, correo cliente); en «Titulares», el correo titular. El orden
// de las filas no importa.
//
// Flujo (lo maneja Codigo.gs):
//   1. previewBulk: lee todo y dice qué va a pasar, sin cambiar nada.
//   2. liberar: en los titulares de la hoja, los clientes que ya no están en
//      ella dejan libre su cupo. Va primero para que un cliente pueda pasar de
//      un titular a otro en el mismo pegado.
//   3. aplicar: crea titulares, pone cada cliente en su cupo (o en uno libre)
//      y actualiza lo que cambió. Lo que no cambió no se toca.
//   4. titulares: fecha de renovación y tarjeta.
// Los titulares del panel que no están en la hoja no se tocan.
import { query, withTransaction } from "./pg";
import { createFamilyAccount, toDateStr, updateFamilyAccount, updateMemberProfile } from "./db";
import { parseDateInput } from "./importParse";
import {
  SheetError, applyOneEdit, buildInventoryRows, parseDateField, parseEmailField, plus30, splitTitular, text,
} from "./sheetsSync";

const CUPOS_POR_CUENTA = 5;
const CLIENTE_KEYS = ["correoTitular", "nombre", "correoMiembro", "claveMiembro", "precio", "vence"];

const lower = (v) => text(v).toLowerCase();

// --- Planificar (sin tocar la base) ---

/**
 * Agrupa las filas de «Clientes» por titular y valida cada una.
 * keep = correos de cliente que aparecen en la hoja para ese titular (aunque la
 * fila tenga un error): esos cupos nunca se liberan por culpa de un error.
 */
export function planClientes(rows) {
  const groups = new Map();
  const errors = [];
  const seen = new Map(); // correo cliente → { key, fila }
  for (const row of rows || []) {
    const fila = row?.fila ?? null;
    if (!CLIENTE_KEYS.some((k) => text(row?.[k]) !== "")) continue;
    const { email } = splitTitular(row.correoTitular);
    if (!email) { errors.push({ fila, mensaje: "Falta el CORREO TITULAR." }); continue; }
    let titular;
    try { titular = parseEmailField(email, "Correo titular", { required: true }); } catch (e) { errors.push({ fila, mensaje: e.message }); continue; }
    const key = titular.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, { key, email: titular, label: splitTitular(row.correoTitular).label, members: [], keep: new Set() });
    }
    const g = groups.get(key);

    const member = text(row.correoMiembro);
    if (!member) {
      if (["nombre", "claveMiembro", "precio", "vence"].some((k) => text(row[k]))) {
        errors.push({ fila, mensaje: "Falta el CORREO CLIENTE." });
      }
      continue; // fila de cupo vacío: solo asegura que el titular exista
    }
    const mk = member.toLowerCase();
    g.keep.add(mk);
    try { parseEmailField(member, "Correo cliente"); } catch (e) { errors.push({ fila, mensaje: e.message }); continue; }
    if (!text(row.claveMiembro)) { errors.push({ fila, mensaje: "Falta la CONTRASEÑA." }); continue; }
    if (text(row.vence)) {
      try { parseDateField(row.vence, "RENOVACIÓN"); } catch (e) { errors.push({ fila, mensaje: e.message }); continue; }
    }
    const prev = seen.get(mk);
    if (prev) {
      errors.push({
        fila,
        mensaje: prev.key === key
          ? `Correo cliente repetido (también está en la fila ${prev.fila}).`
          : `${member} también está en la fila ${prev.fila}, con otro titular. Déjalo en uno solo.`,
      });
      continue;
    }
    seen.set(mk, { key, fila });
    if (g.members.length >= CUPOS_POR_CUENTA) {
      errors.push({ fila, mensaje: `Este titular ya tiene ${CUPOS_POR_CUENTA} clientes en la hoja.` });
      continue;
    }
    g.members.push({ fila, key: mk, row });
  }
  return { groups: [...groups.values()], errors };
}

/** Filas de «Titulares»: una por correo. */
export function planTitulares(rows) {
  const items = [];
  const errors = [];
  const seen = new Map();
  for (const row of rows || []) {
    const fila = row?.fila ?? null;
    if (!["correoTitular", "renuevaTitular", "tarjetaTitular"].some((k) => text(row?.[k]) !== "")) continue;
    const { email } = splitTitular(row.correoTitular);
    if (!email) { errors.push({ fila, mensaje: "Falta el CORREO TITULAR." }); continue; }
    let titular;
    try { titular = parseEmailField(email, "Correo titular", { required: true }); } catch (e) { errors.push({ fila, mensaje: e.message }); continue; }
    const key = titular.toLowerCase();
    if (seen.has(key)) { errors.push({ fila, mensaje: `Titular repetido (también está en la fila ${seen.get(key)}).` }); continue; }
    seen.set(key, fila);
    let fecha = null;
    try { fecha = parseDateField(row.renuevaTitular, "Fecha renovación"); } catch (e) { errors.push({ fila, mensaje: e.message }); continue; }
    const tarjeta = text(row.tarjetaTitular);
    if (tarjeta.length > 40) { errors.push({ fila, mensaje: "Tarjeta: máximo 40 caracteres." }); continue; }
    items.push({ fila, key, email: titular, fecha, tarjeta });
  }
  return { items, errors };
}

function normDate(v) {
  const t = text(v);
  if (!t) return "";
  return parseDateInput(t) || t;
}

function normMoney(v) {
  const t = text(v).replace(",", ".").replace(/^s\/\.?\s*/i, "");
  if (!t) return "";
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : t;
}

/** Qué columnas de la fila difieren del cupo actual. {} = sin cambios. */
export function diffCliente(row, cur) {
  const changes = {};
  if (text(row.claveMiembro) !== text(cur.claveMiembro)) changes.claveMiembro = text(row.claveMiembro);
  if (text(row.nombre) !== text(cur.nombre)) changes.nombre = text(row.nombre);
  const precio = normMoney(row.precio);
  const curPrecio = cur.precio === "" || cur.precio == null ? "" : Number(cur.precio);
  if (text(row.nombre) && String(precio) !== String(curPrecio)) changes.precio = text(row.precio);
  const vence = normDate(row.vence);
  if (text(row.nombre) && vence !== text(cur.vence)) changes.vence = text(row.vence);
  return changes;
}

async function cuentasPorCorreo(keys) {
  if (!keys.length) return new Map();
  const { rows } = await query(
    `select id::text as id, lower(account_email) as k, account_email, platform_code, owner_renewal_date, renewal_card
       from platform_accounts where lower(account_email) = any($1::text[])`,
    [keys]
  );
  return new Map(rows.map((r) => [r.k, r]));
}

function slotsPorCuenta(inventory) {
  const map = new Map();
  for (const r of inventory) {
    if (!map.has(r.cuenta)) map.set(r.cuenta, []);
    map.get(r.cuenta).push(r);
  }
  return map;
}

/**
 * Qué pasaría si se aplica la hoja. No cambia nada.
 * Devuelve un resumen y los errores por fila (hoja «Clientes» o «Titulares»).
 */
export async function previewBulk({ clientes = [], titulares = [] } = {}) {
  const { groups, errors } = planClientes(clientes);
  const tplan = planTitulares(titulares);
  const inventory = await buildInventoryRows();
  const bySlotAccount = slotsPorCuenta(inventory);
  const memberOwner = new Map(); // correo cliente → cuenta que lo tiene hoy
  for (const r of inventory) if (text(r.correoMiembro)) memberOwner.set(lower(r.correoMiembro), r);
  const allKeys = [...new Set([...groups.map((g) => g.key), ...tplan.items.map((t) => t.key)])];
  const accounts = await cuentasPorCorreo(allKeys);
  const groupByKey = new Map(groups.map((g) => [g.key, g]));

  const s = {
    titularesNuevos: 0, clientesNuevos: 0, clientesActualizados: 0, sinCambios: 0, cuposLiberados: 0,
    titularesActualizados: 0, ausentes: 0,
  };
  const errores = errors.map((e) => ({ hoja: "Clientes", ...e }));

  for (const g of groups) {
    const acc = accounts.get(g.key);
    const slots = acc ? bySlotAccount.get(acc.id) || [] : [];
    if (!acc) s.titularesNuevos++;
    let libres = acc ? 0 : CUPOS_POR_CUENTA;
    for (const slot of slots) {
      const mk = lower(slot.correoMiembro);
      if (slot.estado === "Reservado") continue;
      if (!mk) { if (!slot.nombre) libres++; continue; }
      if (!g.keep.has(mk)) { s.cuposLiberados++; libres++; }
    }
    for (const m of g.members) {
      const own = slots.find((x) => lower(x.correoMiembro) === m.key);
      if (own) {
        if (Object.keys(diffCliente(m.row, own)).length) s.clientesActualizados++;
        else s.sinCambios++;
        continue;
      }
      const other = memberOwner.get(m.key);
      if (other) {
        const otherGroup = groupByKey.get(lower(other.correoTitular));
        if (!otherGroup) {
          errores.push({ hoja: "Clientes", fila: m.fila, mensaje: `${m.row.correoMiembro} está en la cuenta de ${other.correoTitular}, que no está en tu hoja. Quítalo de allá o agrega ese titular a la hoja.` });
          continue;
        }
      }
      if (libres <= 0) {
        errores.push({ hoja: "Clientes", fila: m.fila, mensaje: "Este titular no tiene cupos libres para este cliente." });
        continue;
      }
      libres--;
      s.clientesNuevos++;
    }
  }

  for (const t of tplan.items) {
    const acc = accounts.get(t.key);
    if (!acc) {
      if (!groupByKey.has(t.key)) s.titularesNuevos++;
      if (t.fecha || t.tarjeta) s.titularesActualizados++;
      continue;
    }
    const fechaCambia = t.fecha && t.fecha !== (toDateStr(acc.owner_renewal_date) || "");
    const tarjetaCambia = t.tarjeta && t.tarjeta !== (acc.renewal_card || "");
    if (fechaCambia || tarjetaCambia) s.titularesActualizados++;
  }
  errores.push(...tplan.errors.map((e) => ({ hoja: "Titulares", ...e })));

  const presentes = new Set(allKeys);
  const { rows: [{ n }] } = await query(
    "select count(*)::int as n from platform_accounts where not (lower(account_email) = any($1::text[]))",
    [[...presentes]]
  );
  s.ausentes = n;
  return { resumen: s, errores };
}

// --- Aplicar (por lotes de titulares completos) ---

async function crearCuenta(tx, email, label) {
  const password = text(process.env.DEFAULT_TITULAR_PASSWORD);
  if (!password) throw new SheetError("Falta la clave de los titulares nuevos: configura DEFAULT_TITULAR_PASSWORD en el servidor.");
  const created = await createFamilyAccount({
    service: "tidal", masterEmail: email, password, ownerRenewalDate: plus30(), renewalCost: 0, notes: label || "",
  }, { tx });
  await tx.query(
    `insert into account_slots(platform_account_id, slot_number, status, email_type, member_email, member_password)
     select $1, n, 'free', 'admin', '', '' from generate_series(1, ${CUPOS_POR_CUENTA}) as n`,
    [created.id]
  );
  return String(created.id);
}

/**
 * Paso 2: en los titulares de estas filas, libera los cupos cuyo cliente ya no
 * está en la hoja. Las filas deben traer los grupos completos (todas las filas
 * de cada titular). Devuelve cuántos cupos liberó.
 */
export async function bulkLiberar(rows) {
  const { groups } = planClientes(rows);
  const accounts = await cuentasPorCorreo(groups.map((g) => g.key));
  const ids = [...accounts.values()].map((a) => a.id);
  if (!ids.length) return { liberados: 0 };
  const { rows: slots } = await query(
    `select s.id::text as id, s.platform_account_id::text as cuenta, lower(s.member_email) as mk
       from account_slots s
      where s.platform_account_id = any($1::bigint[]) and btrim(coalesce(s.member_email, '')) <> ''
        and not (s.status = 'reserved' and s.reserved_until > now())`,
    [ids]
  );
  const keepByAccount = new Map(groups.filter((g) => accounts.has(g.key)).map((g) => [accounts.get(g.key).id, g.keep]));
  let liberados = 0;
  for (const slot of slots) {
    const keep = keepByAccount.get(slot.cuenta);
    if (!keep || keep.has(slot.mk)) continue;
    await withTransaction((tx) => updateMemberProfile(slot.id, {
      clientId: null, memberEmail: "", memberPassword: "", status: "free", pricePen: 0, renewalDate: null,
    }, { tx }));
    liberados++;
  }
  return { liberados };
}

/**
 * Paso 3: crea titulares y pone cada cliente en su cupo. Solo escribe lo que
 * cambió. Un error en una fila no frena las demás. Devuelve el resultado por fila.
 */
export async function bulkAplicar(rows) {
  const { groups, errors } = planClientes(rows);
  const results = errors.map((e) => ({ ...e, ok: false }));
  const accounts = await cuentasPorCorreo(groups.map((g) => g.key));

  // Titulares nuevos.
  for (const g of groups) {
    if (accounts.has(g.key)) continue;
    try {
      const id = await withTransaction((tx) => crearCuenta(tx, g.email, g.label));
      accounts.set(g.key, { id, account_email: g.email, platform_code: "tidal" });
    } catch (error) {
      const mensaje = error instanceof SheetError ? error.message : "No se pudo crear el titular.";
      if (!(error instanceof SheetError)) console.error("[sheets] crear titular", g.email, error);
      for (const m of g.members) results.push({ fila: m.fila, ok: false, mensaje });
      g.members = [];
    }
  }

  const ids = groups.map((g) => accounts.get(g.key)?.id).filter(Boolean);
  const { rows: slotIdRows } = ids.length
    ? await query("select id::text as id from account_slots where platform_account_id = any($1::bigint[])", [ids])
    : { rows: [] };
  const bySlotAccount = slotsPorCuenta(await buildInventoryRows(slotIdRows.map((r) => r.id)));

  for (const g of groups) {
    const acc = accounts.get(g.key);
    if (!acc) continue;
    const slots = bySlotAccount.get(acc.id) || [];
    const libres = slots.filter((x) => !text(x.correoMiembro) && !x.nombre && x.estado !== "Reservado");
    for (const m of g.members) {
      try {
        const own = slots.find((x) => lower(x.correoMiembro) === m.key);
        if (own) {
          const changes = diffCliente(m.row, own);
          if (Object.keys(changes).length) await withTransaction((tx) => applyOneEdit(tx, own.id, changes));
          results.push({ fila: m.fila, ok: true });
          continue;
        }
        const slot = libres.shift();
        if (!slot) throw new SheetError("Este titular no tiene cupos libres para este cliente.");
        await withTransaction(async (tx) => {
          const other = (await tx.query(
            `select pa.account_email from account_slots s join platform_accounts pa on pa.id = s.platform_account_id
              where lower(s.member_email) = $1 and s.platform_account_id <> $2 limit 1`,
            [m.key, acc.id]
          )).rows[0];
          if (other) throw new SheetError(`${m.row.correoMiembro} está en la cuenta de ${other.account_email}, que no está en tu hoja.`);
          await updateMemberProfile(slot.id, {
            memberEmail: text(m.row.correoMiembro), memberPassword: text(m.row.claveMiembro), emailType: "admin",
          }, { tx });
          const rest = {};
          if (text(m.row.nombre)) {
            rest.nombre = text(m.row.nombre);
            if (text(m.row.precio)) rest.precio = text(m.row.precio);
            if (text(m.row.vence)) rest.vence = text(m.row.vence);
          }
          if (Object.keys(rest).length) await applyOneEdit(tx, slot.id, rest);
        });
        results.push({ fila: m.fila, ok: true });
      } catch (error) {
        if (!(error instanceof SheetError)) console.error("[sheets] fila", m.fila, error);
        results.push({ fila: m.fila, ok: false, mensaje: error instanceof SheetError ? error.message : "Error interno al guardar. Reintenta." });
      }
    }
  }
  return { results };
}

/** Paso 4: «Titulares». Crea el titular si falta; la fecha o tarjeta vacía no borra la del panel. */
export async function bulkTitulares(rows) {
  const { items, errors } = planTitulares(rows);
  const results = errors.map((e) => ({ ...e, ok: false }));
  const accounts = await cuentasPorCorreo(items.map((t) => t.key));
  for (const t of items) {
    try {
      await withTransaction(async (tx) => {
        let acc = accounts.get(t.key);
        if (!acc) {
          const id = await crearCuenta(tx, t.email, "");
          acc = { id, owner_renewal_date: null, renewal_card: "" };
        }
        const upd = {};
        if (t.fecha && t.fecha !== (toDateStr(acc.owner_renewal_date) || "")) upd.ownerRenewalDate = t.fecha;
        if (t.tarjeta && t.tarjeta !== (acc.renewal_card || "")) upd.renewalCard = t.tarjeta;
        if (Object.keys(upd).length) await updateFamilyAccount(acc.id, upd, { tx });
      });
      results.push({ fila: t.fila, ok: true });
    } catch (error) {
      if (!(error instanceof SheetError)) console.error("[sheets] titular", t.fila, error);
      results.push({ fila: t.fila, ok: false, mensaje: error instanceof SheetError ? error.message : "Error interno al guardar. Reintenta." });
    }
  }
  return { results };
}
