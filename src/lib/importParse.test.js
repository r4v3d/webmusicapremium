import { describe, expect, it } from "vitest";
import { previewImport } from "./importParse";

describe("previewImport", () => {
  it("acepta titulares con correo y clave", () => {
    const rows = previewImport("master_accounts", "a@x.com\tclave123\t25/06");
    expect(rows).toHaveLength(1);
    expect(rows[0].ok).toBe(true);
    expect(rows[0].fields.email).toBe("a@x.com");
  });

  it("marca error si faltan columnas", () => {
    const rows = previewImport("active_members", "solo-una-columna");
    expect(rows[0].ok).toBe(false);
  });
});

describe("fechas que no existen", () => {
  it("30/02, 31/04 o 29/02 de un año no bisiesto no son fechas", async () => {
    const { parseDateInput, isRealDate } = await import("./importParse");
    expect(parseDateInput("30/02/27")).toBeNull();
    expect(parseDateInput("31/04/2026")).toBeNull();
    expect(parseDateInput("29/02/27")).toBeNull();
    expect(parseDateInput("29/02/28")).toBe("2028-02-29");
    expect(parseDateInput("28/02/27")).toBe("2027-02-28");
    expect(parseDateInput("2027-02-30")).toBeNull();
    expect(isRealDate("2026-12-31")).toBe(true);
  });
});
