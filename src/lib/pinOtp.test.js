import { beforeEach, describe, expect, it } from "vitest";
import { hashOtp, hashPin, isLegacyPinHash, otpCodesMatch, verifyPin } from "./pinOtp";

describe("PIN hashing", () => {
  it("stores a salted scrypt hash and verifies it", async () => {
    const stored = await hashPin("123456");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(await verifyPin("123456", stored)).toBe(true);
    expect(await verifyPin("000000", stored)).toBe(false);
  });

  it("still accepts legacy unsalted SHA-256 hashes", async () => {
    const { createHash } = await import("crypto");
    const legacy = createHash("sha256").update("654321").digest("hex");
    expect(isLegacyPinHash(legacy)).toBe(true);
    expect(await verifyPin("654321", legacy)).toBe(true);
    expect(await verifyPin("123456", legacy)).toBe(false);
  });
});

describe("OTP hashing", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret";
  });

  it("does not store the plaintext code", () => {
    const hashed = hashOtp("482910");
    expect(hashed.startsWith("hmac:")).toBe(true);
    expect(hashed.includes("482910")).toBe(false);
    expect(otpCodesMatch(hashed, "482910")).toBe(true);
    expect(otpCodesMatch(hashed, "000000")).toBe(false);
  });

  it("accepts a leftover plaintext OTP from before the migration", () => {
    expect(otpCodesMatch("123456", "123456")).toBe(true);
  });
});
