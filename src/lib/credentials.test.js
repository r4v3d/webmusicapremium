import { describe, expect, it } from "vitest";
import { escapeHtml, formatAssignedAccount, parseAssignedAccount } from "./credentials";

describe("formatAssignedAccount / parseAssignedAccount", () => {
  it("round-trips email:password", () => {
    const stored = formatAssignedAccount("user@tidal.com", "secret:pass");
    expect(stored).toBe("user@tidal.com:secret:pass");
    expect(parseAssignedAccount(stored)).toEqual({
      email: "user@tidal.com",
      password: "secret:pass",
    });
  });

  it("parses the legacy Correo | Clave format", () => {
    expect(parseAssignedAccount("Correo:  a@b.com | Clave:  xyz")).toEqual({
      email: "a@b.com",
      password: "xyz",
    });
  });
});

describe("escapeHtml", () => {
  it("escapes markup in names", () => {
    expect(escapeHtml(`Ana <script>alert(1)</script>`)).toBe(
      "Ana &lt;script&gt;alert(1)&lt;/script&gt;"
    );
  });
});
