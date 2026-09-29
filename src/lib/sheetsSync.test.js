import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../test/pgliteDb";
import { createFamilyAccount, createMemberProfile, getOrCreateClient, updateMemberProfile } from "./db";
import { applySheetEdits, buildInventoryRows, createTitular, loadSheetRows } from "./sheetsSync";
import { signSheets, verifySheetsRequest } from "./sheetsAuth";
import { __resetSheetsPushState, flushSheetOutbox } from "./sheetsPush";
import { query } from "./pg";

const SECRET = "s".repeat(40);
const URL = "https://script.google.com/macros/s/AKfy-test_123/exec";

let db;
beforeAll(async () => { db = await createTestDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.reset();
  __resetSheetsPushState();
  vi.stubEnv("GOOGLE_SHEETS_SECRET", SECRET);
  vi.stubEnv("GOOGLE_SHEETS_WEBAPP_URL", URL);
});
afterEach(() => { vi.unstubAllEnvs(); });

let seq = 0;
async function seedAccount({ service = "tidal", members = 2 } = {}) {
  const acc = await createFamilyAccount({ service, masterEmail: `titular${++seq}@x.com`, password: "tpass" });
  const slots = [];
  for (let i = 1; i <= 5; i++) {
    slots.push(await createMemberProfile({
      familyAccountId: acc.id, slotNumber: i, status: "free", emailType: "admin",
      memberEmail: i <= members ? `m${seq}-${i}@x.com` : "", memberPassword: i <= members ? `p${i}` : "",
    }));
  }
  return { acc, slots };
}

const outboxSlots = async () => (await query("select distinct slot_id from sheet_outbox order by slot_id")).rows.map((r) => r.slot_id);
const clearOutbox = () => query("delete from sheet_outbox");

describe("triggers de sheet_outbox", () => {
  it("encolan el cupo al editar cupo, cuenta, suscripción y cliente", async () => {
    const { acc, slots } = await seedAccount();
    await clearOutbox();

    await query("update account_slots set member_password = 'nueva' where id = $1", [slots[0].id]);
    expect(await outboxSlots()).toEqual([String(slots[0].id)]);

    await clearOutbox();
    await query("update platform_accounts set account_password = 'otra' where id = $1", [acc.id]);
    expect((await outboxSlots()).length).toBe(5);

    await clearOutbox();
    const client = await getOrCreateClient("51999111222", "Ana", "");
    await updateMemberProfile(slots[1].id, { clientId: client.id, status: "active", pricePen: 6, renewalDate: "2026-10-24" });
    expect(await outboxSlots()).toEqual([String(slots[1].id)]);

    await clearOutbox();
    await query("update customers set display_name = 'Ana María' where id = $1", [client.id]);
    expect(await outboxSlots()).toEqual([String(slots[1].id)]);

    await clearOutbox();
    await query("delete from account_slots where id = $1", [slots[4].id]);
    expect(await outboxSlots()).toEqual([String(slots[4].id)]);
  });
});

describe("buildInventoryRows", () => {
  it("arma una fila por cupo con los datos del titular y del cliente", async () => {
    const { slots } = await seedAccount();
    const client = await getOrCreateClient("51999111222", "Ana", "");
    await updateMemberProfile(slots[0].id, { clientId: client.id, status: "active", pricePen: 6, renewalDate: "2026-10-24" });

    const rows = await buildInventoryRows();
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({
      plataforma: "Tidal", claveTitular: "tpass", cupo: 1, estado: "Activo",
      claveMiembro: "p1", tipoCorreo: "Propio", cliente: "Ana", whatsapp: "51999111222", precio: 6, vence: "2026-10-24",
    });
    expect(rows[2]).toMatchObject({ estado: "Libre", correoMiembro: "", cliente: "", precio: "", vence: "" });
    expect(rows[0].version).toMatch(/^[0-9a-f]{16}$/);
    expect(rows[0].version).not.toBe(rows[1].version);
  });
});

describe("applySheetEdits", () => {
  it("cambia la clave del miembro y devuelve la fila fresca", async () => {
    const { slots } = await seedAccount();
    const r = await applySheetEdits([{ id: String(slots[0].id), changes: { claveMiembro: "cambiada" } }]);
    expect(r.results).toEqual([{ id: String(slots[0].id), ok: true }]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].claveMiembro).toBe("cambiada");
  });

  it("un dato del titular actualiza la cuenta y devuelve sus 5 filas", async () => {
    const { acc, slots } = await seedAccount();
    const r = await applySheetEdits([{ id: String(slots[0].id), changes: { claveTitular: "nuevaT", renuevaTitular: "15/11/2026" } }]);
    expect(r.results[0].ok).toBe(true);
    expect(r.rows).toHaveLength(5);
    expect(r.rows.every((row) => row.claveTitular === "nuevaT" && row.renuevaTitular === "2026-11-15")).toBe(true);
    const saved = (await query("select account_password from platform_accounts where id = $1", [acc.id])).rows[0];
    expect(saved.account_password).toBe("nuevaT");
  });

  it("activar un cupo exige WhatsApp y crea la suscripción", async () => {
    const { slots } = await seedAccount();
    const id = String(slots[0].id);

    const bad = await applySheetEdits([{ id, changes: { estado: "Activo" } }]);
    expect(bad.results[0]).toMatchObject({ ok: false, error: expect.stringContaining("WhatsApp") });
    expect(bad.rows[0].estado).toBe("Libre"); // la hoja deshace el cambio con esta fila

    const good = await applySheetEdits([{ id, changes: { estado: "Activo", cliente: "Luis", whatsapp: "+51 988 777 666", precio: "9", vence: "01/12/2026" } }]);
    expect(good.results[0].ok).toBe(true);
    expect(good.rows[0]).toMatchObject({ estado: "Activo", cliente: "Luis", precio: 9, vence: "2026-12-01" });
  });

  it("pasar a Libre limpia cliente, precio y vencimiento", async () => {
    const { slots } = await seedAccount();
    const id = String(slots[0].id);
    await applySheetEdits([{ id, changes: { estado: "Activo", cliente: "Luis", whatsapp: "51988777666", precio: 9, vence: "2026-12-01" } }]);
    const r = await applySheetEdits([{ id, changes: { estado: "Libre" } }]);
    expect(r.rows[0]).toMatchObject({ estado: "Libre", cliente: "", precio: "", vence: "" });
    const live = await query("select count(*)::int as n from subscriptions where account_slot_id = $1 and subscription_status in ('active','pending_payment')", [slots[0].id]);
    expect(live.rows[0].n).toBe(0);
  });

  it("rechaza datos inválidos sin tocar nada", async () => {
    const { slots } = await seedAccount();
    const other = await seedAccount();
    const id = String(slots[0].id);
    const r = await applySheetEdits([
      { id, changes: { correoMiembro: "no-es-correo" } },
      { id, changes: { correoMiembro: other.slots[0].memberEmail } },
      { id, changes: { correoTitular: other.acc.masterEmail } },
      { id, changes: { renuevaTitular: "mañana" } },
      { id, changes: { precio: "-3" } },
      { id: "999999", changes: { claveMiembro: "x" } },
    ]);
    expect(r.results.map((x) => x.ok)).toEqual([false, false, false, false, false, false]);
    expect(r.deleted).toEqual(["999999"]);
    const row = (await buildInventoryRows([id]))[0];
    expect(row.correoMiembro).toBe(slots[0].memberEmail);
  });

  it("no toca un cupo apartado por una compra en curso", async () => {
    const { slots } = await seedAccount();
    await query("update account_slots set status = 'reserved', reserved_until = now() + interval '10 minutes' where id = $1", [slots[0].id]);
    const r = await applySheetEdits([{ id: String(slots[0].id), changes: { claveMiembro: "x" } }]);
    expect(r.results[0]).toMatchObject({ ok: false, error: expect.stringContaining("apartado") });
  });
});

describe("loadSheetRows", () => {
  it("crea la cuenta con 5 cupos y va llenando cupos vacíos", async () => {
    const r = await loadSheetRows([
      { fila: 2, plataforma: "Tidal", correoTitular: "nuevo@x.com", claveTitular: "tp", renuevaTitular: "2026-11-01", correoMiembro: "a@x.com", claveMiembro: "pa" },
      { fila: 3, plataforma: "tidal", correoTitular: "NUEVO@x.com", correoMiembro: "b@x.com", claveMiembro: "pb" },
      { fila: 4, plataforma: "Tidal", correoTitular: "nuevo@x.com", correoMiembro: "a@x.com", claveMiembro: "pa2" },
    ]);
    expect(r.results.map((x) => x.ok)).toEqual([true, true, true]);
    expect(r.results[0].mensaje).toContain("cuenta nueva");
    expect(r.results[1].mensaje).toContain("cupo 2 listo");
    expect(r.results[2].mensaje).toContain("clave del cupo 1");
    expect(r.sellableByService).toEqual({ tidal: 2 });

    const rows = await buildInventoryRows();
    expect(rows).toHaveLength(5);
    expect(rows.slice(0, 2).map((x) => [x.correoMiembro, x.claveMiembro])).toEqual([["a@x.com", "pa2"], ["b@x.com", "pb"]]);
  });

  it("explica cada fila que no puede cargar", async () => {
    await seedAccount({ service: "deezer", members: 5 });
    const deezerTitular = `titular${seq}@x.com`;
    const r = await loadSheetRows([
      { fila: 2, plataforma: "Spotify", correoTitular: "a@x.com", claveTitular: "x" },
      { fila: 3, plataforma: "Tidal", correoTitular: "sinclave@x.com" },
      { fila: 4, plataforma: "Tidal", correoTitular: deezerTitular, claveTitular: "x" },
      { fila: 5, plataforma: "Deezer", correoTitular: deezerTitular, correoMiembro: "extra@x.com", claveMiembro: "x" },
      { fila: 6, plataforma: "Tidal", correoTitular: "t@x.com", claveTitular: "x", correoMiembro: "m@x.com" },
    ]);
    expect(r.results.map((x) => x.ok)).toEqual([false, false, false, false, false]);
    expect(r.results[0].mensaje).toContain("Plataforma desconocida");
    expect(r.results[1].mensaje).toContain("clave del titular");
    expect(r.results[2].mensaje).toContain("Deezer");
    expect(r.results[3].mensaje).toContain("cupos vacíos");
    expect(r.results[4].mensaje).toContain("clave del miembro");
    expect((await query("select count(*)::int as n from platform_accounts")).rows[0].n).toBe(1);
  });
});

describe("firma de la hoja", () => {
  it("acepta una firma válida una sola vez y rechaza las demás", async () => {
    const now = Date.now();
    const body = JSON.stringify({ action: "ping" });
    const signature = signSheets(now, body, SECRET);
    expect(await verifySheetsRequest({ timestamp: now, signature, body, now })).toEqual({ ok: true });
    expect((await verifySheetsRequest({ timestamp: now, signature, body, now })).reason).toBe("replay");
    expect((await verifySheetsRequest({ timestamp: now, signature, body: body + " ", now })).reason).toBe("bad_signature");
    const old = now - 10 * 60 * 1000;
    expect((await verifySheetsRequest({ timestamp: old, signature: signSheets(old, body, SECRET), body, now })).reason).toBe("stale");
  });
});

describe("flushSheetOutbox", () => {
  it("manda las filas pendientes firmadas y vacía la cola", async () => {
    const { acc, slots } = await seedAccount();
    await query("update platform_accounts set notes = 'Año nuevo, José' where id = $1", [acc.id]);
    await query("delete from account_slots where id = $1", [slots[4].id]);
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    const r = await flushSheetOutbox({ fetchImpl });
    expect(r.pushed).toBe(4);
    expect(r.deleted).toBe(1);
    expect(calls[0].url).toBe(URL);
    const { ts, sig, payload } = calls[0].body;
    expect(sig).toBe(signSheets(ts, payload, SECRET));
    expect(JSON.parse(payload).deleted).toEqual([String(slots[4].id)]);
    expect(/^[\x00-\x7f]*$/.test(payload)).toBe(true); // tildes escapadas: la firma no depende del charset
    expect(JSON.parse(payload).rows[0].notasTitular).toBe("Año nuevo, José");
    expect((await query("select count(*)::int as n from sheet_outbox")).rows[0].n).toBe(0);
  });

  it("si la hoja falla, conserva la cola y espera antes de reintentar", async () => {
    await seedAccount();
    const failing = async () => new Response("<html>login</html>", { status: 200 });
    await expect(flushSheetOutbox({ fetchImpl: failing })).rejects.toThrow("Cualquier persona");
    expect((await query("select count(*)::int as n from sheet_outbox")).rows[0].n).toBeGreaterThan(0);
    expect((await flushSheetOutbox({ fetchImpl: failing })).waiting).toBe(true);
  });

  it("sin configuración descarta la cola", async () => {
    vi.stubEnv("GOOGLE_SHEETS_WEBAPP_URL", "");
    await seedAccount();
    const r = await flushSheetOutbox({ fetchImpl: () => { throw new Error("no debe llamarse"); } });
    expect(r.discarded).toBeGreaterThan(0);
  });
});

describe("columna NOMBRE (formato tabla)", () => {
  const row = async (id) => (await buildInventoryRows([String(id)]))[0];

  it("un número ocupa el cupo como WhatsApp; borrarlo lo libera", async () => {
    const { slots } = await seedAccount();
    const id = String(slots[0].id);

    let r = await applySheetEdits([{ id, changes: { nombre: "961416008", precio: "15", vence: "08/11/26" } }]);
    expect(r.results[0]).toEqual({ id, ok: true });
    let fila = await row(id);
    expect(fila).toMatchObject({ estado: "Activo", nombre: "961416008", whatsapp: "961416008", precio: 15, vence: "2026-11-08" });

    // Mismo valor: no cambia nada.
    r = await applySheetEdits([{ id, changes: { nombre: "961416008" } }]);
    expect(r.results[0].ok).toBe(true);
    expect((await row(id)).version).toBe(fila.version);

    r = await applySheetEdits([{ id, changes: { nombre: "" } }]);
    expect(r.results[0].ok).toBe(true);
    fila = await row(id);
    expect(fila).toMatchObject({ estado: "Libre", nombre: "", precio: "", vence: "" });
    expect(fila.correoMiembro).not.toBe("");
  });

  it("un @usuario ocupa el cupo sin WhatsApp", async () => {
    const { slots } = await seedAccount();
    const id = String(slots[1].id);
    const r = await applySheetEdits([{ id, changes: { nombre: "@MYKLRoberto" } }]);
    expect(r.results[0]).toEqual({ id, ok: true });
    expect(await row(id)).toMatchObject({ estado: "Activo", nombre: "@MYKLRoberto", cliente: "@MYKLRoberto", whatsapp: "" });
  });

  it("otro número en un cupo ocupado cambia de cliente sin heredar el nombre", async () => {
    const { slots } = await seedAccount();
    const id = String(slots[0].id);
    const ana = await getOrCreateClient("51999111222", "Ana", "");
    await updateMemberProfile(slots[0].id, { clientId: ana.id, status: "active", pricePen: 9, renewalDate: "2026-10-24" });

    await applySheetEdits([{ id, changes: { nombre: "987654321" } }]);
    const fila = await row(id);
    expect(fila.nombre).toBe("987654321");
    expect(fila.cliente).not.toBe("Ana");
  });

  it("precio en un cupo libre sin NOMBRE se rechaza", async () => {
    const { slots } = await seedAccount();
    const id = String(slots[2].id);
    const r = await applySheetEdits([{ id, changes: { precio: "9" } }]);
    expect(r.results[0].ok).toBe(false);
    expect(r.results[0].error).toMatch(/NOMBRE/);
  });
});

describe("createTitular", () => {
  it("crea la cuenta con 5 cupos y la clave por defecto del servidor", async () => {
    vi.stubEnv("DEFAULT_TITULAR_PASSWORD", "clave-de-siempre");
    const rows = await createTitular({ email: "nuevo@x.com" });
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ plataforma: "Tidal", correoTitular: "nuevo@x.com", claveTitular: "clave-de-siempre", estado: "Libre" });
    await expect(createTitular({ email: "NUEVO@x.com" })).rejects.toThrow(/ya existe/);
  });

  it("sin clave ni DEFAULT_TITULAR_PASSWORD, avisa", async () => {
    vi.stubEnv("DEFAULT_TITULAR_PASSWORD", "");
    await expect(createTitular({ email: "otro@x.com" })).rejects.toThrow(/DEFAULT_TITULAR_PASSWORD/);
  });
});

describe("marca de cambios de la tabla del panel", () => {
  it("la secuencia de sheet_outbox avanza con cada cambio aunque se vacíe la cola", async () => {
    const { slots } = await seedAccount();
    const stamp = async () => (await query("select last_value::text as v from sheet_outbox_id_seq")).rows[0].v;
    const a = await stamp();
    await clearOutbox();
    await query("update account_slots set member_password = 'x' where id = $1", [slots[0].id]);
    await clearOutbox();
    expect(Number(await stamp())).toBeGreaterThan(Number(a));
  });
});
