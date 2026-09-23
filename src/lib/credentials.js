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
 * email_type = "admin": el cliente entra con el correo maestro de la cuenta.
 * Cualquier otro valor: entra con el correo del miembro.
 * Consumidores: settlePayment, /api/client/dashboard, el correo, el checkout y el bot.
 */
export function resolveSlotCredentials(slot, account) {
  const useMaster = (slot?.email_type || "admin") === "admin";
  const email = useMaster
    ? (account?.account_email || slot?.member_email || "")
    : (slot?.member_email || account?.account_email || "");
  const password = slot?.member_password || account?.account_password || "";
  return { email: String(email).trim(), password: String(password) };
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
