import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Las rutas leen cookies (sesión de cliente/admin): fuera de Next no hay petición.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));

import { createTestDb } from "../test/pgliteDb";
import { POST as createOrderRoute } from "../app/api/orders/route";
import { GET as readOrderRoute } from "../app/api/orders/[orderId]/route";

let db;
beforeAll(async () => { db = await createTestDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.reset(); });

// Todos salen por la misma IP, como clientes de datos móviles detrás de CGNAT.
const SAME_IP = "190.234.10.20";
const req = (url, { method = "GET", body, ip = SAME_IP } = {}) => new Request(`http://x${url}`, {
  method,
  headers: { "Content-Type": "application/json", "X-Real-IP": ip },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

const order = (i, extra = {}) => createOrderRoute(req("/api/orders", {
  method: "POST",
  body: { service: "tidal", planId: "tidal-1m", fullName: `Cliente ${i}`, email: `c${i}@example.com`, whatsapp: `51900${String(i).padStart(6, "0")}`, currency: "PEN", ...extra },
}));

describe("límites con clientes que comparten IP (CGNAT)", () => {
  it("30 clientes distintos desde la misma IP pueden comprar a la vez", async () => {
    const res = await Promise.all(Array.from({ length: 30 }, (_, i) => order(i)));
    expect(res.map((r) => r.status)).toEqual(Array(30).fill(201));
  });

  it("un mismo cliente sigue limitado: el 9.º pedido seguido se frena", async () => {
    const statuses = [];
    for (let k = 0; k < 9; k++) statuses.push((await order(7)).status);
    expect(statuses.slice(0, 8)).toEqual(Array(8).fill(201));
    expect(statuses[8]).toBe(429);
    // Otro cliente desde la misma IP no se ve afectado.
    expect((await order(8)).status).toBe(201);
  });

  it("3 checkouts abiertos en la misma IP consultan 15 min sin chocar entre sí", async () => {
    const created = await Promise.all([1, 2, 3].map((i) => order(100 + i).then((r) => r.json())));
    // 15 min de polling cada 5 s = 180 lecturas por pestaña (540 desde la misma IP).
    for (let round = 0; round < 180; round++) {
      const res = await Promise.all(created.map((o) => readOrderRoute(req(`/api/orders/${o.orderId}?t=${o.accessToken}`), { params: Promise.resolve({ orderId: o.orderId }) })));
      expect(res.every((r) => r.status === 200)).toBe(true);
    }
  }, 120_000);

  it("adivinar pedidos sigue bloqueado: muchos 404 desde una IP terminan en 429", async () => {
    let last;
    for (let k = 0; k < 61; k++) {
      const id = `MPB-${100000 + k}`;
      last = await readOrderRoute(req(`/api/orders/${id}?t=x`, { ip: "200.1.1.1" }), { params: Promise.resolve({ orderId: id }) });
    }
    expect(last.status).toBe(429);
  });
});
