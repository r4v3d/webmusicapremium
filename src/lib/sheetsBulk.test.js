import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../test/pgliteDb";
import { createFamilyAccount, createMemberProfile, getOrCreateClient, updateMemberProfile } from "./db";
import { query } from "./pg";
import { bulkAplicar, bulkLiberar, bulkTitulares, diffCliente, planClientes, previewBulk } from "./sheetsBulk";
import { buildInventoryRows, buildTitularRows, inventoryChangesSince, inventoryStamp } from "./sheetsSync";

let db;
beforeAll(async () => { db = await createTestDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.reset(); vi.stubEnv("DEFAULT_TITULAR_PASSWORD", "clave-de-siempre"); });
afterEach(() => { vi.unstubAllEnvs(); });

async function cuenta(email, miembros = []) {
  const acc = await createFamilyAccount({ service: "tidal", masterEmail: email, password: "p" });
  const slots = [];
  for (let i = 1; i <= 5; i++) {
    const m = miembros[i - 1];
    slots.push(await createMemberProfile({
      familyAccountId: acc.id, slotNumber: i, status: "free", emailType: "admin",
      memberEmail: m?.email || "", memberPassword: m?.clave || "",
    }));
    if (m?.nombre) {
      const c = await getOrCreateClient(m.nombre, "", m.email);
      await updateMemberProfile(slots[i - 1].id, { clientId: c.id, status: "active", pricePen: m.precio || 9, renewalDate: m.vence || "2026-10-03" });
    }
  }
  return { acc, slots };
}

const fila = (n, titular, correo, clave, nombre = "", precio = "", vence = "") =>
  ({ fila: n, correoTitular: titular, nombre, correoMiembro: correo, claveMiembro: clave, precio, vence });

/** Lo que hace Codigo.gs: vista previa, liberar, aplicar y titulares. */
async function sincronizar(clientes, titulares = []) {
  const preview = await previewBulk({ clientes, titulares });
  const lib = await bulkLiberar(clientes);
  const apl = await bulkAplicar(clientes);
  const tit = await bulkTitulares(titulares);
  return { preview, lib, apl, tit };
}

const porCorreo = async () => Object.fromEntries((await buildInventoryRows()).filter((r) => r.correoMiembro).map((r) => [r.correoMiembro, r]));

describe("sincronización completa («la hoja manda»)", () => {
  it("crea, actualiza, libera y deja igual lo que no cambió; el orden de las filas no importa", async () => {
    await cuenta("a@gmail.com", [
      { email: "m1@x.com", clave: "1", nombre: "911111111", precio: 9 },
      { email: "m2@x.com", clave: "2", nombre: "922222222", precio: 15, vence: "2026-11-08" },
      { email: "m3@x.com", clave: "3", nombre: "933333333" },
    ]);
    const clientes = [
      fila(2, "b@gmail.com - IO", "n1@x.com", "c1", "@nuevo", "25", "01/02/27"),
      fila(3, "a@gmail.com", "m2@x.com", "2", "922222222", "15", "08/11/26"), // igual
      fila(4, "a@gmail.com", "m1@x.com", "1", "911111111", "12", "03/10/26"), // cambia el precio
      fila(5, "A@GMAIL.COM", "m4@x.com", "4", "", "", ""),                    // nuevo, libre (stock)
      fila(6, "b@gmail.com", "", "", "", "", ""),                               // cupo vacío de b
    ];
    const titulares = [
      { fila: 2, correoTitular: "a@gmail.com", renuevaTitular: "30/09/2026", tarjetaTitular: "6053" },
      { fila: 3, correoTitular: "c@gmail.com", renuevaTitular: "11/10/2026", tarjetaTitular: "4642" },
    ];
    const r = await sincronizar(clientes, titulares);
    expect(r.preview.resumen).toMatchObject({
      titularesNuevos: 2, clientesNuevos: 2, clientesActualizados: 1, sinCambios: 1, cuposLiberados: 1, titularesActualizados: 2, ausentes: 0,
    });
    expect(r.preview.errores).toEqual([]);
    expect(r.lib.liberados).toBe(1);
    expect(r.apl.results.every((x) => x.ok)).toBe(true);

    const m = await porCorreo();
    expect(m["m1@x.com"]).toMatchObject({ precio: 12, nombre: "911111111" });
    expect(m["m2@x.com"]).toMatchObject({ precio: 15, vence: "2026-11-08" });
    expect(m["m3@x.com"]).toBeUndefined();
    expect(m["m4@x.com"]).toMatchObject({ correoTitular: "a@gmail.com", nombre: "", estado: "Libre", claveMiembro: "4" });
    expect(m["n1@x.com"]).toMatchObject({ correoTitular: "b@gmail.com", nombre: "@nuevo", precio: 25, vence: "2027-02-01", claveTitular: "clave-de-siempre" });
    const tit = Object.fromEntries((await buildTitularRows()).map((t) => [t.correoTitular, t]));
    expect(tit["a@gmail.com"]).toMatchObject({ renuevaTitular: "2026-09-30", tarjetaTitular: "6053" });
    expect(tit["c@gmail.com"]).toMatchObject({ renuevaTitular: "2026-10-11", tarjetaTitular: "4642" });
    expect((await buildInventoryRows()).filter((x) => x.correoTitular === "c@gmail.com")).toHaveLength(5);

    // Volver a aplicar la misma hoja no escribe nada.
    const antes = await inventoryStamp();
    const again = await sincronizar(clientes, titulares);
    expect(again.preview.resumen).toMatchObject({ titularesNuevos: 0, clientesNuevos: 0, clientesActualizados: 0, cuposLiberados: 0, titularesActualizados: 0 });
    expect(await inventoryStamp()).toBe(antes);
  });

  it("un cliente puede pasar de un titular a otro en el mismo pegado", async () => {
    await cuenta("a@gmail.com", [{ email: "m1@x.com", clave: "1", nombre: "911111111" }, { email: "m2@x.com", clave: "2" }]);
    await cuenta("b@gmail.com", []);
    const clientes = [
      fila(2, "b@gmail.com", "m1@x.com", "1", "911111111", "9", "03/10/26"),
      fila(3, "a@gmail.com", "m2@x.com", "2"),
    ];
    const r = await sincronizar(clientes);
    expect(r.preview.errores).toEqual([]);
    expect(r.apl.results.every((x) => x.ok)).toBe(true);
    const m = await porCorreo();
    expect(m["m1@x.com"]).toMatchObject({ correoTitular: "b@gmail.com", nombre: "911111111" });
  });

  it("errores por fila: no frenan al resto y un cliente con error no pierde su cupo", async () => {
    await cuenta("a@gmail.com", [{ email: "m1@x.com", clave: "1", nombre: "911111111" }]);
    await cuenta("fuera@gmail.com", [{ email: "ajeno@x.com", clave: "9" }]);
    const clientes = [
      fila(2, "a@gmail.com", "m1@x.com", "", "911111111"), // sin contraseña → error, pero m1 NO se libera
      fila(3, "a@gmail.com", "ajeno@x.com", "5"),          // está en un titular que no está en la hoja
      fila(4, "a@gmail.com", "dup@x.com", "1"),
      fila(5, "a@gmail.com", "DUP@x.com", "1"),            // repetido
      fila(6, "", "x@x.com", "1"),                          // sin titular
      fila(7, "a@gmail.com", "", "", "999"),                // sin correo cliente
      fila(8, "a@gmail.com", "ok@x.com", "1"),
    ];
    const r = await sincronizar(clientes);
    const errFilas = r.preview.errores.map((e) => e.fila).sort();
    expect(errFilas).toEqual([2, 3, 5, 6, 7]);
    expect(r.lib.liberados).toBe(0);
    const m = await porCorreo();
    expect(m["m1@x.com"]).toMatchObject({ nombre: "911111111", claveMiembro: "1" });
    expect(m["ajeno@x.com"].correoTitular).toBe("fuera@gmail.com");
    expect(m["ok@x.com"].correoTitular).toBe("a@gmail.com");
    expect(m["dup@x.com"].correoTitular).toBe("a@gmail.com");
  });

  it("más de 5 clientes para un titular: los sobrantes salen con motivo", async () => {
    const clientes = [1, 2, 3, 4, 5, 6].map((i) => fila(i + 1, "t@gmail.com", `c${i}@x.com`, "1"));
    const { groups, errors } = planClientes(clientes);
    expect(groups[0].members).toHaveLength(5);
    expect(errors).toEqual([{ fila: 7, mensaje: "Este titular ya tiene 5 clientes en la hoja." }]);
  });

  it("diffCliente compara como se ve en la hoja (fechas y montos normalizados)", () => {
    const cur = { claveMiembro: "1", nombre: "911", precio: 15, vence: "2026-11-08" };
    expect(diffCliente({ claveMiembro: "1", nombre: "911", precio: "15", vence: "08/11/26" }, cur)).toEqual({});
    expect(diffCliente({ claveMiembro: "1", nombre: "911", precio: "15.00", vence: "2026-11-08" }, cur)).toEqual({});
    expect(diffCliente({ claveMiembro: "2", nombre: "", precio: "", vence: "" }, cur)).toEqual({ claveMiembro: "2", nombre: "" });
  });
});

describe("cambios del inventario para la tabla del panel", () => {
  it("devuelve solo los cupos tocados desde la marca; todo si la marca es muy vieja", async () => {
    const { slots } = await cuenta("a@gmail.com", [{ email: "m1@x.com", clave: "1" }]);
    const full = await inventoryChangesSince(null);
    expect(full.rows).toHaveLength(5);
    expect((await inventoryChangesSince(full.stamp)).unchanged).toBe(true);

    await query("update sheet_outbox set pushed_at = now()"); // el worker ya las envió: igual se guardan
    await query("update account_slots set member_password = 'nueva' where id = $1", [slots[0].id]);
    const d = await inventoryChangesSince(full.stamp);
    expect(d.changes.rows.map((r) => r.id)).toEqual([String(slots[0].id)]);
    expect(d.changes.rows[0].claveMiembro).toBe("nueva");

    await query("delete from account_slots where id = $1", [slots[4].id]);
    const d2 = await inventoryChangesSince(d.stamp);
    expect(d2.changes.deleted).toEqual([String(slots[4].id)]);

    // Si la cola ya no tiene lo de después de la marca (se borró a las 2 h), manda todo.
    await query("delete from sheet_outbox");
    await query("update account_slots set member_password = 'otra' where id = $1", [slots[1].id]);
    const d3 = await inventoryChangesSince(full.stamp);
    expect(d3.rows).toHaveLength(4);
  });
});
