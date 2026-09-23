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
