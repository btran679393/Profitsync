import { randomBytes } from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptToken, encryptToken, isEncryptedToken } from "@/lib/ebay/tokenCrypto";

describe("eBay token encryption", () => {
  const original = process.env.EBAY_TOKEN_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.EBAY_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });
  afterEach(() => {
    process.env.EBAY_TOKEN_ENCRYPTION_KEY = original;
  });

  it("round-trips a token", () => {
    const token = "v^1.1#i^1#p^3#r^1#I^3#f^0#t^Ul4xMF8xOjQ=";
    const stored = encryptToken(token);
    expect(isEncryptedToken(stored)).toBe(true);
    expect(stored).not.toContain(token);
    expect(decryptToken(stored)).toBe(token);
  });

  it("gives a different result each time", () => {
    expect(encryptToken("same")).not.toBe(encryptToken("same"));
  });

  it("still reads tokens saved before encryption", () => {
    expect(decryptToken("plain-old-token")).toBe("plain-old-token");
  });

  it("rejects a tampered token", () => {
    const stored = encryptToken("secret");
    const parts = stored.split(":");
    parts[4] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptToken(parts.join(":"))).toThrow();
  });

  it("rejects the wrong key", () => {
    const stored = encryptToken("secret");
    process.env.EBAY_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decryptToken(stored)).toThrow();
  });

  it("refuses to save without a key", () => {
    delete process.env.EBAY_TOKEN_ENCRYPTION_KEY;
    expect(() => encryptToken("secret")).toThrow(/EBAY_TOKEN_ENCRYPTION_KEY/);
  });
});
