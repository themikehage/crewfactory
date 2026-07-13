import { describe, it, expect } from "bun:test";
import {
  extractToken,
  parseExpiresAt,
  isExpired,
  getSessionTokensFromCookieHeader,
  parseCookieHeader,
} from "../lib/auth-helpers";

describe("auth-helpers", () => {
  describe("extractToken", () => {
    it("should trim and decode token", () => {
      expect(extractToken("  abc123  ")).toBe("abc123");
      expect(extractToken("hello%20world")).toBe("hello world");
    });

    it("should NOT split on dot (JWT leftover removed)", () => {
      const tokenWithDots = "abc.def.ghi";
      expect(extractToken(tokenWithDots)).toBe("abc.def.ghi");
    });

    it("should return empty for empty input", () => {
      expect(extractToken("")).toBe("");
      expect(extractToken("   ")).toBe("");
    });
  });

  describe("parseExpiresAt", () => {
    it("should handle number in ms", () => {
      const now = Date.now();
      expect(parseExpiresAt(now)).toBe(now);
    });

    it("should handle number in seconds (convert to ms)", () => {
      const sec = Math.floor(Date.now() / 1000);
      const parsed = parseExpiresAt(sec);
      expect(parsed).toBe(sec * 1000);
    });

    it("should handle ISO string", () => {
      const iso = new Date().toISOString();
      const parsed = parseExpiresAt(iso);
      expect(parsed).toBeGreaterThan(0);
    });

    it("should handle Date object", () => {
      const d = new Date();
      expect(parseExpiresAt(d)).toBe(d.getTime());
    });

    it("should handle numeric string", () => {
      const ms = Date.now();
      expect(parseExpiresAt(String(ms))).toBe(ms);
    });
  });

  describe("isExpired", () => {
    it("should return true for past expiration", () => {
      const past = Date.now() - 10000;
      expect(isExpired(past)).toBe(true);
    });

    it("should return false for future expiration", () => {
      const future = Date.now() + 10000;
      expect(isExpired(future)).toBe(false);
    });

    it("should return false for null/undefined (no expiry)", () => {
      expect(isExpired(null)).toBe(false);
      expect(isExpired(undefined)).toBe(false);
    });
  });

  describe("getSessionTokensFromCookieHeader", () => {
    it("should extract better-auth.session_token", () => {
      const header = "better-auth.session_token=abc123; other=xyz";
      const tokens = getSessionTokensFromCookieHeader(header);
      expect(tokens).toContain("abc123");
    });

    it("should extract __Secure-better-auth.session_token prefix", () => {
      const header = "__Secure-better-auth.session_token=secure123; other=xyz";
      const tokens = getSessionTokensFromCookieHeader(header);
      expect(tokens).toContain("secure123");
    });

    it("should extract both cookies when present", () => {
      const header =
        "better-auth.session_token=token1; __Secure-better-auth.session_token=token2";
      const tokens = getSessionTokensFromCookieHeader(header);
      expect(tokens).toContain("token1");
      expect(tokens).toContain("token2");
      expect(tokens).toHaveLength(2);
    });

    it("should return empty for no session cookies", () => {
      const header = "other=value; another=123";
      const tokens = getSessionTokensFromCookieHeader(header);
      expect(tokens).toHaveLength(0);
    });

    it("should handle null/undefined", () => {
      expect(getSessionTokensFromCookieHeader(null)).toHaveLength(0);
      expect(getSessionTokensFromCookieHeader(undefined)).toHaveLength(0);
    });
  });

  describe("parseCookieHeader", () => {
    it("should parse cookie header into map", () => {
      const header = "a=1; b=2; c=3";
      const map = parseCookieHeader(header);
      expect(map.get("a")).toBe("1");
      expect(map.get("b")).toBe("2");
      expect(map.get("c")).toBe("3");
    });

    it("should handle values with equals sign", () => {
      const header = "token=abc=def; other=xyz";
      const map = parseCookieHeader(header);
      expect(map.get("token")).toBe("abc=def");
    });
  });
});
