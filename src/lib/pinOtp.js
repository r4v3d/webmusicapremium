import crypto from "crypto";
import { promisify } from "util";
import { safeEqual } from "./cryptoEqual";
import { getSessionSecret } from "./session";

const scrypt = promisify(crypto.scrypt);
const SCRYPT_KEYLEN = 32;

export async function hashPin(pin) {
  if (!pin) return "";
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(String(pin), salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPin(pin, storedHash) {
  if (!pin || !storedHash) return false;

  if (storedHash.startsWith("scrypt$")) {
    const parts = storedHash.split("$");
    if (parts.length !== 3) return false;
    const salt = Buffer.from(parts[1], "hex");
    const expected = parts[2];
    const derived = await scrypt(String(pin), salt, SCRYPT_KEYLEN);
    return safeEqual(derived.toString("hex"), expected);
  }

  const legacy = crypto.createHash("sha256").update(String(pin)).digest("hex");
  return safeEqual(legacy, storedHash);
}

export function isLegacyPinHash(storedHash) {
  return Boolean(storedHash) && !storedHash.startsWith("scrypt$");
}

export function hashOtp(code) {
  const normalized = String(code ?? "").trim();
  const digest = crypto.createHmac("sha256", getSessionSecret()).update(normalized).digest("hex");
  return `hmac:${digest}`;
}

export function otpCodesMatch(storedCode, inputCode) {
  if (!storedCode || !inputCode) return false;
  const input = String(inputCode).trim();
  if (String(storedCode).startsWith("hmac:")) {
    return safeEqual(storedCode, hashOtp(input));
  }
  return safeEqual(String(storedCode).trim(), input);
}
