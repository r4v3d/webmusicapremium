import { describe, expect, it } from "vitest";
import { moveSlotInAccounts } from "./moveSlot";

const accounts = [
  {
    id: "a1",
    profiles: [
      { id: "s1", status: "active", clientId: { nickname: "Ana" }, memberEmail: "ana@x.com", memberPassword: "p1", pricePen: 15, renewalDate: "2026-09-20" },
      { id: "s2", status: "free", clientId: null, memberEmail: "", memberPassword: "" },
    ],
  },
  {
    id: "a2",
    profiles: [
      { id: "s3", status: "free", clientId: null, memberEmail: "" },
    ],
  },
];

describe("moveSlotInAccounts", () => {
  it("mueve el cliente al hueco libre y deja el origen vacío", () => {
    const next = moveSlotInAccounts(accounts, "s1", "s3");
    expect(next[0].profiles[0].status).toBe("free");
    expect(next[0].profiles[0].clientId).toBeNull();
    expect(next[1].profiles[0].status).toBe("active");
    expect(next[1].profiles[0].memberEmail).toBe("ana@x.com");
    expect(next[1].profiles[0].clientId.nickname).toBe("Ana");
  });

  it("no muta si el origen no existe", () => {
    const next = moveSlotInAccounts(accounts, "missing", "s3");
    expect(next).toBe(accounts);
  });
});
