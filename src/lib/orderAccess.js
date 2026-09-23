// Lectura del pedido (§14.4). Antes bastaba acertar un MPB-###### (900 000
// combinaciones) para ver credenciales ajenas. Ahora cada pedido nace con un
// token aleatorio de 128 bits que viaja en la URL del checkout (?t=...).
import crypto from "node:crypto";
import { safeEqual } from "./cryptoEqual";

export function newAccessToken() {
  return crypto.randomBytes(18).toString("base64url");
}

/**
 * Nivel de acceso de quien pide el pedido:
 *  - "full":    token correcto, admin, o cliente dueño con sesión → puede ver credenciales
 *  - "limited": pedido anterior a los tokens (sin access_token) → estado sí, credenciales no
 *  - "none":    token ausente o incorrecto
 */
export function orderAccessLevel(orderRow, token, { isAdmin = false, sessionCustomerId = null } = {}) {
  if (!orderRow) return "none";
  if (isAdmin) return "full";
  if (sessionCustomerId && orderRow.customer_id && String(orderRow.customer_id) === String(sessionCustomerId)) return "full";
  if (!orderRow.access_token) return "limited";
  if (token && safeEqual(String(token), orderRow.access_token)) return "full";
  return "none";
}
