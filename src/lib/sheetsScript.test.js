// Codigo.gs (Apps Script) contra el servidor real (pglite), con una hoja simulada.
// Apps Script es síncrono y el servidor no: runSync corre el script, junta las
// llamadas a llamar_, las resuelve y lo vuelve a correr con las respuestas.
import fs from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createTestDb } from "../test/pgliteDb";
import { createFamilyAccount, createMemberProfile, getOrCreateClient, updateMemberProfile } from "./db";
import { query } from "./pg";
import { bulkAplicar, bulkLiberar, bulkTitulares, previewBulk } from "./sheetsBulk";
import { applySheetEdits, applyTitularEdits, buildInventoryRows, buildTitularRows } from "./sheetsSync";

let db;
beforeAll(async () => { db = await createTestDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.reset(); vi.stubEnv("DEFAULT_TITULAR_PASSWORD", "x"); });

const chain = () => new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : () => chain()), apply: () => chain() });

function makeSheet(name, ncols) {
  let grid = [];
  const at = (r) => { while (grid.length < r) grid.push([]); const row = grid[r - 1]; while (row.length < ncols) row.push(""); return row; };
  return {
    get grid() { return grid; },
    getName: () => name,
    getLastRow: () => { for (let i = grid.length; i >= 1; i--) if (grid[i - 1].some((v) => v !== "")) return i; return 0; },
    getMaxRows: () => 100000,
    getMaxColumns: () => ncols,
    insertColumnsAfter: () => {}, deleteColumns: () => {},
    insertRowsAfter: () => {},
    deleteRow: (r) => grid.splice(r - 1, 1),
    hideColumns: () => {}, setColumnWidth: () => {}, setRowHeight: () => {}, setFrozenRows: () => {},
    getProtections: () => [], setConditionalFormatRules: () => {},
    getRange: (r, c, nr = 1, nc = 1) => {
      if (typeof r === "string") return chain();
      let proxy;
      const api = {
        getValues: () => Array.from({ length: nr }, (_, i) => at(r + i).slice(c - 1, c - 1 + nc)),
        getValue: () => at(r)[c - 1],
        setValues: (vals) => { vals.forEach((row, i) => row.forEach((v, j) => { at(r + i)[c - 1 + j] = v; })); return proxy; },
        setValue: (v) => { at(r)[c - 1] = v; return proxy; },
        clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) at(r + i)[c - 1 + j] = ""; return proxy; },
        protect: () => chain(),
      };
      proxy = new Proxy(api, { get: (t, k) => (k in t ? t[k] : () => proxy) });
      return proxy;
    },
  };
}

function loadScript(sheets, { confirmar = true } = {}) {
  const src = fs.readFileSync("integrations/google-sheets/Codigo.gs", "utf8");
  const toasts = [];
  const alerts = [];
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = makeSheet(n, 26)),
    setActiveSheet() {}, getSpreadsheetLocale: () => "es_PE", toast: (m) => toasts.push(m), getSpreadsheetTimeZone: () => "America/Lima", getId: () => "x",
  };
  const ui = { createMenu: () => chain(), alert: (...a) => { alerts.push(a.join(" | ")); return "YES"; }, ButtonSet: {}, Button: { YES: confirmar ? "YES" : "NO" } };
  const SpreadsheetApp = {
    getActive: () => ss, openById: () => ss, ProtectionType: { RANGE: 1 },
    newConditionalFormatRule: () => chain(), newDataValidation: () => chain(), getUi: () => ui,
  };
  const LockService = { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) };
  const Utilities = { formatDate: (d) => d.toISOString().slice(0, 10) };
  let handler;
  const api = new Function("SpreadsheetApp", "LockService", "Utilities", "PropertiesService", "ContentService", "__call",
    src + "\nllamar_ = __call;\nreturn { alEditar, aplicarCambiosPegados, recargarInventario, prepararHoja_, push: function (msg) { var ss = SpreadsheetApp.getActive(); aplicarFilas_(CLIENTES, ss.getSheetByName('Clientes'), msg.rows, msg.deleted || [], {}); }, CLIENTES, TITULARES };")(
    SpreadsheetApp, LockService, Utilities, { getScriptProperties: () => ({ getProperty: () => null }) }, {}, (m) => handler(m));
  return { api, toasts, alerts, setHandler: (h) => { handler = h; } };
}

async function runSync(fn, setHandler, stats = {}) {
  const answers = new Map();
  for (let round = 0; round < 60; round++) {
    const asked = [];
    setHandler((msg) => {
      const key = JSON.stringify(msg);
      if (answers.has(key)) return answers.get(key);
      asked.push(msg);
      throw new Error("__pending__");
    });
    try { fn(); } catch (e) { if (e.message !== "__pending__") throw e; }
    if (!asked.length) return stats;
    for (const msg of asked) {
      stats[msg.action] = (stats[msg.action] || 0) + 1;
      let resp;
      if (msg.action === "snapshot") resp = { ok: true, rows: await buildInventoryRows(), titulares: await buildTitularRows() };
      else if (msg.action === "edit") resp = { ok: true, ...(await applySheetEdits(msg.edits)) };
      else if (msg.action === "titularEdit") resp = { ok: true, ...(await applyTitularEdits(msg.edits)) };
      else if (msg.action === "bulkPreview") resp = { ok: true, ...(await previewBulk(msg)) };
      else if (msg.action === "bulkLiberar") resp = { ok: true, ...(await bulkLiberar(msg.rows)) };
      else if (msg.action === "bulkAplicar") resp = { ok: true, ...(await bulkAplicar(msg.rows)) };
      else if (msg.action === "bulkTitulares") resp = { ok: true, ...(await bulkTitulares(msg.rows)) };
      else throw new Error("acción inesperada " + msg.action);
      answers.set(JSON.stringify(msg), resp);
    }
  }
  throw new Error("demasiadas vueltas");
}

const ev = (sheet, r0, r1, c0, c1) => ({ range: { getSheet: () => sheet, getRow: () => r0, getLastRow: () => r1, getColumn: () => c0, getLastColumn: () => c1 } });


it("pegar «Clientes» y «Titulares» arreglados y en otro orden: nada se mueve hasta aplicar; luego el panel = la hoja y el orden se respeta", async () => {
  // Panel: 3 titulares. a tiene m1 (ocupado), m2, m3; b tiene n1; z no está en la hoja (no se toca).
  const mk = async (email, members) => {
    const acc = await createFamilyAccount({ service: "tidal", masterEmail: email, password: "p" });
    for (let i = 1; i <= 5; i++) {
      const m = members[i - 1];
      const s = await createMemberProfile({ familyAccountId: acc.id, slotNumber: i, status: "free", emailType: "admin", memberEmail: m?.[0] || "", memberPassword: m?.[1] || "" });
      if (m?.[2]) {
        const c = await getOrCreateClient(m[2], "", m[0]);
        await updateMemberProfile(s.id, { clientId: c.id, status: "active", pricePen: 9, renewalDate: "2026-10-03" });
      }
    }
    return acc;
  };
  await mk("a@gmail.com", [["m1@x.com", "1", "911111111"], ["m2@x.com", "2"], ["m3@x.com", "3", "933333333"]]);
  await mk("b@gmail.com", [["n1@x.com", "1", "944444444"]]);
  await mk("z@gmail.com", [["q1@x.com", "1"]]);

  const sheets = {};
  const { api, alerts, toasts, setHandler } = loadScript(sheets);
  sheets.Clientes = makeSheet("Clientes", 11);
  sheets.Titulares = makeSheet("Titulares", 7);
  api.prepararHoja_(api.CLIENTES);
  api.prepararHoja_(api.TITULARES);
  await runSync(() => api.recargarInventario(true), setHandler);
  const C = sheets.Clientes, T = sheets.Titulares;
  expect(C.getLastRow()).toBe(16); // 15 cupos + títulos

  // Pegas encima de todo (A–F) tu versión arreglada, en TU orden: b primero, a después; m3 ya no está; m4 nuevo; m1 cambia precio.
  const pegado = [
    ["b@gmail.com", "944444444", "n1@x.com", "1", 9, "03/10/26"],
    ["b@gmail.com", "@nuevo", "n2@x.com", "c2", 25, "01/02/27"],
    ["a@gmail.com", "911111111", "m1@x.com", "1", 15, "03/10/26"],
    ["a@gmail.com", "", "m2@x.com", "2", "", ""],
    ["a@gmail.com", "955555555", "m4@x.com", "c4", 9, "05/11/26"],
    ["a@gmail.com", "", "", "", "", ""],
  ];
  C.getRange(2, 1, 15, 6).clearContent();
  C.getRange(2, 1, pegado.length, 6).setValues(pegado);
  await runSync(() => api.alEditar(ev(C, 2, 16, 1, 6)), setHandler);
  // Nada se aplicó: filas «Pegado», sin ID, en tu orden.
  expect(C.grid.slice(1, 7).every((r) => /^Pegado/.test(r[6]) && r[7] === "")).toBe(true);
  expect((await buildInventoryRows()).find((r) => r.correoMiembro === "m3@x.com")).toBeTruthy();

  // Un cambio del panel llega mientras tanto: no agrega filas ni desordena.
  await query("update account_slots set member_password = 'zz' where lower(member_email) = 'q1@x.com'");
  api.push({ rows: await buildInventoryRows(), deleted: [] });
  expect(C.getLastRow()).toBe(7);

  // Titulares: pegas tu lista en tu orden (z no está; c es nuevo).
  T.getRange(2, 1, 3, 3).setValues([["b@gmail.com", "11/10/2026", "4642"], ["a@gmail.com", "30/09/2026", "6053"], ["c@gmail.com", "14/10/2026", "8212"]]);
  T.getRange(5, 1, 5, 7).clearContent();
  await runSync(() => api.alEditar(ev(T, 2, 4, 1, 3)), setHandler);

  // Aplicar.
  await runSync(() => api.aplicarCambiosPegados(), setHandler);
  expect(alerts[0]).toMatch(/Titulares nuevos: 1/);
  expect(alerts[0]).toMatch(/Clientes nuevos: 2 · actualizados: 1/);
  expect(alerts[0]).toMatch(/quedan libres.*: 1/);
  expect(alerts[0]).toMatch(/no están en la hoja \(no se tocan\): 1/);

  // Panel = hoja.
  const inv = Object.fromEntries((await buildInventoryRows()).filter((r) => r.correoMiembro).map((r) => [r.correoMiembro, r]));
  expect(inv["m3@x.com"]).toBeUndefined();
  expect(inv["m1@x.com"]).toMatchObject({ precio: 15 });
  expect(inv["n2@x.com"]).toMatchObject({ correoTitular: "b@gmail.com", nombre: "@nuevo", vence: "2027-02-01" });
  expect(inv["m4@x.com"]).toMatchObject({ correoTitular: "a@gmail.com", nombre: "955555555" });
  expect(inv["q1@x.com"].correoTitular).toBe("z@gmail.com");

  // La hoja respeta TU orden: b, luego a; los cupos libres de cada titular debajo; z al final.
  const vis = C.grid.slice(1, C.getLastRow()).map((r) => [r[0], r[2]]);
  expect(vis.slice(0, 2)).toEqual([["b@gmail.com", "n1@x.com"], ["b@gmail.com", "n2@x.com"]]);
  expect(vis.slice(2, 5)).toEqual([["b@gmail.com", ""], ["b@gmail.com", ""], ["b@gmail.com", ""]]);
  expect(vis.slice(5, 9)).toEqual([["a@gmail.com", "m1@x.com"], ["a@gmail.com", "m2@x.com"], ["a@gmail.com", "m4@x.com"], ["a@gmail.com", ""]]);
  expect(vis[9]).toEqual(["a@gmail.com", ""]);
  // c es un titular nuevo creado desde «Titulares»: sus 5 cupos libres aparecen; z (no estaba en la hoja) al final.
  expect(vis.slice(10, 15).every((r) => r[0] === "c@gmail.com" && r[1] === "")).toBe(true);
  expect(vis.slice(15)).toEqual([["z@gmail.com", "q1@x.com"], ["z@gmail.com", ""], ["z@gmail.com", ""], ["z@gmail.com", ""], ["z@gmail.com", ""]]);
  expect(C.grid.slice(1, C.getLastRow()).every((r) => /^\d+$/.test(String(r[7])))).toBe(true);
  expect(vis).toHaveLength(20);

  const tit = T.grid.slice(1, T.getLastRow()).map((r) => r.slice(0, 3));
  expect(tit).toEqual([
    ["b@gmail.com", "2026-10-11", "4642"],
    ["a@gmail.com", "2026-09-30", "6053"],
    ["c@gmail.com", "2026-10-14", "8212"],
    ["z@gmail.com", "", ""],
  ]);
  expect(toasts.join("\n")).toMatch(/Listo\./);

  // Después, una edición de una celda vuelve a ser inmediata.
  const filaM4 = C.grid.findIndex((r) => r[2] === "m4@x.com") + 1;
  C.getRange(filaM4, 5).setValue(45);
  await runSync(() => api.alEditar(ev(C, filaM4, filaM4, 5, 5)), setHandler);
  expect((await buildInventoryRows()).find((r) => r.correoMiembro === "m4@x.com").precio).toBe(45);
}, 120000);

it("5.500 filas: pegar todo arreglado y aplicar", async () => {
  await query(`insert into platform_accounts(platform_code, account_email, account_password)
               select 'tidal', 'titular' || g || '@gmail.com', 'p' from generate_series(1, 1100) g`);
  await query(`insert into customers(display_name) select 'Cliente ' || g from generate_series(1, 4400) g`);
  await query(`insert into customer_contacts(customer_id, contact_type, contact_value, normalized_value, is_primary)
               select id, 'whatsapp', '9' || lpad(id::text, 8, '0'), '9' || lpad(id::text, 8, '0'), true from customers`);
  await query(`insert into account_slots(platform_account_id, slot_number, status, email_type, member_email, member_password, customer_id)
               select pa.id, n, case when n <= 4 then 'active' else 'free' end, 'admin', 'm' || pa.id || '_' || n || '@gmail.com', 'clave' || n,
                      case when n <= 4 then (pa.id - 1) * 4 + n end
                 from platform_accounts pa cross join generate_series(1, 5) n`);
  await query(`insert into subscriptions(customer_id, platform_code, platform_account_id, account_slot_id, plan_price, currency, start_date, renewal_date, subscription_status)
               select s.customer_id, 'tidal', s.platform_account_id, s.id, 9, 'PEN', current_date, current_date + 30, 'active'
                 from account_slots s where s.customer_id is not null`);
  const sheets = {};
  const { api, setHandler } = loadScript(sheets);
  sheets.Clientes = makeSheet("Clientes", 11);
  sheets.Titulares = makeSheet("Titulares", 7);
  api.prepararHoja_(api.CLIENTES);
  api.prepararHoja_(api.TITULARES);
  let t = Date.now();
  await runSync(() => api.recargarInventario(true), setHandler);
  const tCarga = Date.now() - t;
  const C = sheets.Clientes;
  // «Arreglar»: 10% de precios cambian, orden al revés por titular.
  const datos = C.grid.slice(1, C.getLastRow()).map((r) => r.slice(0, 6));
  const porTitular = {};
  datos.forEach((r) => (porTitular[r[0]] = porTitular[r[0]] || []).push(r));
  const pegado = Object.keys(porTitular).reverse().flatMap((k) => porTitular[k]).map((r, i) => (i % 10 === 0 && r[1] ? [r[0], r[1], r[2], r[3], 30, r[5]] : r));
  C.getRange(2, 1, pegado.length, 6).setValues(pegado);
  await runSync(() => api.alEditar(ev(C, 2, pegado.length + 1, 1, 6)), setHandler);
  t = Date.now();
  const stats = await runSync(() => api.aplicarCambiosPegados(), setHandler, {});
  const tAplicar = Date.now() - t;
  console.log(`carga inicial ${tCarga} ms · aplicar ${tAplicar} ms · llamadas`, JSON.stringify(stats));
  expect(C.grid[1][0]).toBe(pegado[0][0]); // se respeta el orden pegado
  expect(C.getLastRow()).toBe(5501);
  expect((await buildInventoryRows()).filter((r) => r.precio === 30).length).toBeGreaterThan(400);
}, 600000);

it("un cambio en lote desde el panel (300 cupos) se escribe en un solo bloque", async () => {
  await query(`insert into platform_accounts(platform_code, account_email, account_password) select 'tidal', 't' || g || '@gmail.com', 'p' from generate_series(1, 80) g`);
  await query(`insert into account_slots(platform_account_id, slot_number, status, email_type, member_email, member_password)
               select pa.id, n, 'free', 'admin', 'm' || pa.id || '_' || n || '@x.com', 'c' from platform_accounts pa cross join generate_series(1, 5) n`);
  const sheets = {};
  const { api, setHandler } = loadScript(sheets);
  sheets.Clientes = makeSheet("Clientes", 11);
  sheets.Titulares = makeSheet("Titulares", 7);
  api.prepararHoja_(api.CLIENTES);
  api.prepararHoja_(api.TITULARES);
  await runSync(() => api.recargarInventario(true), setHandler);
  await query("update account_slots set member_password = 'nueva' where id <= 300");
  const C = sheets.Clientes;
  let lecturas = 0;
  const orig = C.getRange;
  C.getRange = (...a) => { lecturas++; return orig(...a); };
  api.push({ rows: await buildInventoryRows(), deleted: [] });
  C.getRange = orig;
  expect(lecturas).toBeLessThan(10);
  expect(C.grid.slice(1).filter((r) => r[3] === "nueva")).toHaveLength(300);
  expect(C.grid.slice(1).filter((r) => r[3] === "c")).toHaveLength(100);
}, 60000);

it("una fila con fecha imposible no agrega una sexta fila ni duplica al cliente", async () => {
  const sheets = {};
  const { api, alerts, setHandler } = loadScript(sheets);
  sheets.Clientes = makeSheet("Clientes", 11);
  sheets.Titulares = makeSheet("Titulares", 7);
  api.prepararHoja_(api.CLIENTES);
  api.prepararHoja_(api.TITULARES);
  const C = sheets.Clientes;

  // Tu caso: 5 filas para titular-0374, una con 30/02/27.
  const pegado = [
    ["titular-0374@cheapmusic.best", "@drea.ncm", "andreacahuana12@gmail.com", "Andrea??32", 25, "30/02/27"],
    ["titular-0374@cheapmusic.best", "57 350 3341427", "albersi1926@gmail.com", "Estefa126", 15, "29/11/26"],
    ["titular-0374@cheapmusic.best", "989134426", "ronalhaltamirano@gmail.com", "123456", 6, "09/06/27"],
    ["titular-0374@cheapmusic.best", "Bryan Anthony Aguado", "cliente-1887@cheapmusic.best", "379676", 25, "08/03/27"],
    ["titular-0374@cheapmusic.best", "@alenuzam", "alenuz@gmail.com", "Alito,1368+", 6, "14/05/27"],
  ];
  C.getRange(2, 1, pegado.length, 6).setValues(pegado);
  await runSync(() => api.alEditar(ev(C, 2, 6, 1, 6)), setHandler);
  await runSync(() => api.aplicarCambiosPegados(), setHandler);
  expect(alerts[0]).toMatch(/Filas con error.*: 1/);

  const filas = C.grid.slice(1, C.getLastRow());
  expect(filas).toHaveLength(5); // no aparece una sexta fila vacía
  const mala = filas.find((r) => r[2] === "andreacahuana12@gmail.com");
  expect(mala[6]).toMatch(/^✗ RENOVACIÓN: «30\/02\/27» no existe/);
  expect(mala[7]).toBe("");
  expect(filas.filter((r) => /^✓ Sincronizado/.test(r[6]))).toHaveLength(4);

  // Corriges la fecha y vuelves a aplicar: entra en el cupo que quedó libre.
  const num = C.grid.findIndex((r) => r[2] === "andreacahuana12@gmail.com") + 1;
  C.getRange(num, 6).setValue("28/02/27");
  await runSync(() => api.alEditar(ev(C, num, num, 6, 6)), setHandler);
  await runSync(() => api.aplicarCambiosPegados(), setHandler);
  const despues = C.grid.slice(1, C.getLastRow());
  expect(despues).toHaveLength(5);
  expect(despues.every((r) => /^✓ Sincronizado/.test(r[6]) && /^\d+$/.test(String(r[7])))).toBe(true);
  expect((await buildInventoryRows()).find((r) => r.correoMiembro === "andreacahuana12@gmail.com").vence).toBe("2027-02-28");

  // Un cliente que ya existía y le pones una fecha imposible: su fila con error no lo duplica.
  const num2 = C.grid.findIndex((r) => r[2] === "alenuz@gmail.com") + 1;
  C.getRange(num2, 1, 1, 6).setValues([["titular-0374@cheapmusic.best", "@alenuzam", "alenuz@gmail.com", "Alito,1368+", 6, "31/04/27"]]);
  await runSync(() => api.alEditar(ev(C, num2, num2 + 1, 1, 6)), setHandler); // pegar 2 filas → quedan «Pegado»
  await runSync(() => api.aplicarCambiosPegados(), setHandler);
  const fin = C.grid.slice(1, C.getLastRow());
  expect(fin).toHaveLength(5);
  expect(fin.filter((r) => r[2] === "alenuz@gmail.com")).toHaveLength(1);
  expect(fin.find((r) => r[2] === "alenuz@gmail.com")[6]).toMatch(/«31\/04\/27» no existe/);
  expect((await buildInventoryRows()).find((r) => r.correoMiembro === "alenuz@gmail.com").vence).toBe("2027-05-14");
}, 120000);
