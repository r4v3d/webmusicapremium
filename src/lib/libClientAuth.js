import crypto from "crypto";
import { cookies } from "next/headers";

const SECRET = process.env.ADMIN_PASSWORD || "web_music_premium_fallback_secret_key_123456789";

/**
 * Generates a SHA-256 hash of a 6-digit PIN string.
 * @param {string} pin - The 6-digit PIN.
 * @returns {string} The hex hash.
 */
export function hashPin(pin) {
  if (!pin) return "";
  return crypto.createHash("sha256").update(pin).digest("hex");
}

/**
 * Signs a payload object and returns a base64 session token.
 * @param {object} payload - The data to sign.
 * @returns {string} The base64 session token.
 */
export function signToken(payload) {
  const data = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", SECRET).update(data).digest("hex");
  return Buffer.from(JSON.stringify({ data, signature })).toString("base64");
}

/**
 * Verifies a base64 session token and returns the payload if valid.
 * @param {string} token - The base64 token.
 * @returns {object|null} The verified payload or null.
 */
export function verifyToken(token) {
  try {
    if (!token) return null;
    const json = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const expectedSignature = crypto.createHmac("sha256", SECRET).update(json.data).digest("hex");
    if (json.signature === expectedSignature) {
      return JSON.parse(json.data);
    }
  } catch (e) {
    console.error("Token verification failed:", e);
  }
  return null;
}

/**
 * Sets the customer session cookie.
 * @param {string} customerId - The UUID of the authenticated customer.
 */
export async function setCustomerSession(customerId) {
  try {
    const token = signToken({ customerId, timestamp: Date.now() });
    const cookieStore = await cookies();
    cookieStore.set("customer_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/"
    });
  } catch (e) {
    console.error("Error setting customer session cookie:", e);
  }
}

/**
 * Retrieves the authenticated customer ID from the session cookie.
 * @returns {Promise<string|null>} The customer ID or null.
 */
export async function getCustomerSession() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("customer_session");
    if (!sessionCookie || !sessionCookie.value) return null;
    
    const payload = verifyToken(sessionCookie.value);
    if (!payload || !payload.customerId) return null;
    
    // Check if session is older than 7 days
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - payload.timestamp > sevenDaysMs) {
      return null;
    }
    
    return payload.customerId;
  } catch (e) {
    console.error("Error reading customer session cookie:", e);
    return null;
  }
}

/**
 * Clears the customer session cookie.
 */
export async function clearCustomerSession() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("customer_session");
  } catch (e) {
    console.error("Error clearing customer session cookie:", e);
  }
}
