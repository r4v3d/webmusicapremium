import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../test/pgliteDb";
import {
  createFamilyAccount,
  createMemberProfile,
  deleteFamilyAccount,
  extendMemberProfilesBulk,
  getFreeSlotsStock,
  getMemberProfileById,
  getOrCreateClient,
  searchClients,
  updateMemberProfile,
} from "./db";
import { query } from "./pg";

let db;
beforeAll(async () => { db = await createTestDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.reset(); });

async function seedAccount(service = "tidal", slots = 2) {
  const acc = await createFamilyAccount({ service, masterEmail: `${service}@master.com`, password: "mpass" });
  const created = [];
  for (let i = 1; i <= slots; i++) {
    created.push(await createMemberProfile({ familyAccountId: acc.id, slotNumber: i, status: "free" }));
  }
  return { acc, slots: created };
}

describe("db sobre PostgreSQL", () => {
  it("getOrCreateClient reutiliza al cliente por WhatsApp y suma correos", async () => {
    const a = await getOrCreateClient("+51 999 111 222", "Ana", "ana@x.com");
    const b = await getOrCreateClient("51999111222", "Ana", "ana2@x.com");
    expect(b.id).toBe(a.id);
    expect(b.usedEmails.sort()).toEqual(["ana2@x.com", "ana@x.com"]);
    expect(a.customerCode).toMatch(/^CLI-\d{6}$/);
    expect((await searchClients("111222")).map((c) => c.id)).toEqual([a.id]);
    expect((await searchClients("ana2@")).map((c) => c.id)).toEqual([a.id]);
  });

  it("asignar un cupo crea la suscripción pero no escribe pagos", async () => {
    const { slots } = await seedAccount();
    const client = await getOrCreateClient("51900000001", "Beto", null);
    const updated = await updateMemberProfile(slots[0].id, {
      clientId: client.id, status: "active", pricePen: 6, renewalDate: "2026-10-23",
    });
    expect(updated.pricePen).toBe(6);
    expect(updated.renewalDate).toBe("2026-10-23");
    expect(updated.clientId.id).toBe(client.id);

    // Cambiar solo el estado conserva precio y fecha
    const again = await updateMemberProfile(slots[0].id, { status: "active" });
    expect(again.pricePen).toBe(6);
    expect(again.renewalDate).toBe("2026-10-23");

    const pays = await query("select count(*)::int n from payments");
    expect(pays.rows[0].n).toBe(0);
  });

  it("reasignar el cupo a otro cliente cierra la suscripción anterior", async () => {
    const { slots } = await seedAccount();
    const c1 = await getOrCreateClient("51900000001", "Uno", null);
    const c2 = await getOrCreateClient("51900000002", "Dos", null);
    await updateMemberProfile(slots[0].id, { clientId: c1.id, status: "active", pricePen: 6, renewalDate: "2026-10-01" });
    await updateMemberProfile(slots[0].id, { clientId: c2.id, status: "active", pricePen: 9, renewalDate: "2026-11-01" });
    const live = await query(
      "select customer_id from subscriptions where account_slot_id = $1 and subscription_status = 'active'",
      [slots[0].id]
    );
    expect(live.rows.map((r) => r.customer_id)).toEqual([c2.id]);
  });

  it("la renovación manual extiende y deja un solo asiento admin_manual", async () => {
    const { slots } = await seedAccount();
    const client = await getOrCreateClient("51900000003", "Caro", null);
    await updateMemberProfile(slots[0].id, { clientId: client.id, status: "active", pricePen: 9, renewalDate: "2026-10-15" });
    await extendMemberProfilesBulk([slots[0].id], 2);
    const slot = await getMemberProfileById(slots[0].id);
    expect(slot.renewalDate).toBe("2026-12-15");
    const pays = await query("select provider, gross_amount, net_amount, currency, coverage_from, coverage_to from payments");
    expect(pays.rows).toEqual([{
      provider: "admin_manual", gross_amount: 9, net_amount: 9, currency: "PEN",
      coverage_from: "2026-10-15", coverage_to: "2026-12-15",
    }]);
  });

  it("el stock cuenta solo cupos con credenciales de miembro, y las reservas vencidas", async () => {
    const { acc, slots } = await seedAccount("tidal", 3);
    await seedAccount("deezer", 1);
    await query("update account_slots set member_email = 'm' || id || '@x.com', member_password = 'p' || id");
    // Un cupo vacío (como los 5 que se crean con cada cuenta nueva) no es stock.
    await createMemberProfile({ familyAccountId: acc.id, slotNumber: 9, status: "free" });
    await query("update account_slots set status = 'reserved', reserved_until = now() - interval '1 minute' where id = $1", [slots[1].id]);
    await query("update account_slots set status = 'reserved', reserved_until = now() + interval '10 minutes' where id = $1", [slots[2].id]);
    expect(await getFreeSlotsStock()).toEqual({ tidal: 2, deezer: 1, qobuz: 0 });
  });

  it("borrar una cuenta familiar conserva las suscripciones sin referencia", async () => {
    const { acc, slots } = await seedAccount();
    const client = await getOrCreateClient("51900000004", "Dani", null);
    await updateMemberProfile(slots[0].id, { clientId: client.id, status: "active", pricePen: 6, renewalDate: "2026-10-01" });
    await deleteFamilyAccount(acc.id);
    const subs = await query("select account_slot_id, platform_account_id from subscriptions");
    expect(subs.rows).toEqual([{ account_slot_id: null, platform_account_id: null }]);
    expect((await query("select count(*)::int n from account_slots")).rows[0].n).toBe(0);
  });
});
