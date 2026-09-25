/** Canonical credential string: `email:password`. */

export function formatAssignedAccount(email, password) {
  return `${email || ""}:${password || ""}`;
}

/**
 * Parses stored credential strings, including the legacy
 * `Correo: x | Clave: y` format used before the canonical `email:password`.
 */
export function parseAssignedAccount(assignedAccount) {
  if (!assignedAccount || typeof assignedAccount !== "string") {
    return { email: "", password: "" };
  }

  const legacy = assignedAccount.match(/Correo:\s*(.+?)\s*\|\s*Clave:\s*([\s\S]+)/i);
  if (legacy) {
    return { email: legacy[1].trim(), password: legacy[2].trim() };
  }

  const colon = assignedAccount.indexOf(":");
  if (colon === -1) {
    return { email: assignedAccount.trim(), password: "" };
  }

  return {
    email: assignedAccount.slice(0, colon).trim(),
    password: assignedAccount.slice(colon + 1).trim(),
  };
}

/**
 * Única regla de qué credencial se entrega para un cupo (§14.1).
 * SIEMPRE el correo y la clave del miembro. Los datos del titular
 * (platform_accounts) administran la familia entera y nunca se entregan.
 *
 * email_type solo dice de quién es el correo del miembro: "admin" = correo
 * propio del negocio ("PROPIO" en el panel), "client"/"customer" = del cliente.
 * No cambia qué se entrega. El segundo argumento se ignora a propósito.
 *
 * Consumidores: settlePayment, /api/client/dashboard, el correo, el checkout y el bot.
 */
export function resolveSlotCredentials(slot, _account) {
  return {
    email: String(slot?.member_email || "").trim(),
    password: String(slot?.member_password || ""),
  };
}

/** Un cupo solo se puede vender si tiene credenciales propias de miembro. */
export function slotHasCredentials(slot) {
  return Boolean(String(slot?.member_email || "").trim() && String(slot?.member_password || ""));
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
