import { safeEqual } from "./cryptoEqual";

const ADMIN_MAX_AGE_MS = 60 * 60 * 24 * 1000;
const CUSTOMER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function getSessionSecret() {
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (secret && secret.trim()) return secret.trim();
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET o ADMIN_PASSWORD debe estar configurado en producción.");
  }
  return "dev-only-session-secret";
}

function toBase64(value) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64");
  }
  return btoa(value);
}

function fromBase64(value) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64").toString("utf8");
  }
  return atob(value);
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return bytesToHex(new Uint8Array(signature));
}

export async function signToken(payload) {
  const data = JSON.stringify(payload);
  const signature = await hmacSha256Hex(getSessionSecret(), data);
  return toBase64(JSON.stringify({ data, signature }));
}

export async function verifyToken(token) {
  try {
    if (!token) return null;
    const json = JSON.parse(fromBase64(token));
    if (!json?.data || !json?.signature) return null;
    const expectedSignature = await hmacSha256Hex(getSessionSecret(), json.data);
    if (!safeEqual(json.signature, expectedSignature)) return null;
    return JSON.parse(json.data);
  } catch (e) {
    return null;
  }
}

export async function isAdminSessionToken(token) {
  const payload = await verifyToken(token);
  if (!payload || payload.role !== "admin" || !payload.timestamp) return false;
  return Date.now() - payload.timestamp <= ADMIN_MAX_AGE_MS;
}

export function isCustomerSessionPayload(payload) {
  if (!payload || !payload.customerId || !payload.timestamp) return false;
  return Date.now() - payload.timestamp <= CUSTOMER_MAX_AGE_MS;
}

export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24;
export const CUSTOMER_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
