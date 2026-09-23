import { beforeEach, describe, expect, it } from "vitest";
import { isAdminSessionToken, isCustomerSessionPayload, signToken, verifyToken } from "./session";
import { _resetRateLimitForTests, rateLimit } from "./rateLimit";

describe("signed sessions", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret";
  });

  it("signs and verifies an admin token", async () => {
    const token = await signToken({ role: "admin", timestamp: Date.now() });
    expect(token).not.toBe("authenticated");
    expect(await isAdminSessionToken(token)).toBe(true);
    expect(await isAdminSessionToken("authenticated")).toBe(false);
  });

  it("rejects a tampered payload", async () => {
    const token = await signToken({ customerId: "abc", timestamp: Date.now() });
    const payload = await verifyToken(token);
    expect(isCustomerSessionPayload(payload)).toBe(true);
    const broken = token.replace(/A/g, "B");
    expect(await verifyToken(broken)).toBeNull();
  });
});

describe("rateLimit", () => {
  beforeEach(() => {
    _resetRateLimitForTests();
  });

  it("allows up to the limit and then blocks", () => {
    expect(rateLimit("ip:login", { limit: 2, windowMs: 60_000 }).ok).toBe(true);
    expect(rateLimit("ip:login", { limit: 2, windowMs: 60_000 }).ok).toBe(true);
    const blocked = rateLimit("ip:login", { limit: 2, windowMs: 60_000 });
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });
});
