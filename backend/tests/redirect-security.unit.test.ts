import { describe, it, expect } from "vitest";

// Replicate redirect security logic to test all attack vectors
function getSafeRedirectUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") {
    return null;
  }

  const trimmed = url.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null;
  }

  if (trimmed.includes("\\")) {
    return null;
  }

  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return null;
  }

  try {
    const dummyOrigin = "https://healthvault.local";
    const parsed = new URL(trimmed, dummyOrigin);
    if (parsed.origin !== dummyOrigin) {
      return null;
    }
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return null;
  }
}

describe("Open Redirect Security Guard Unit Tests", () => {
  it("permits legitimate relative application paths", () => {
    expect(getSafeRedirectUrl("/dashboard")).toBe("/dashboard");
    expect(getSafeRedirectUrl("/shared/reports/abc-123-token")).toBe("/shared/reports/abc-123-token");
    expect(getSafeRedirectUrl("/shared/reports/token?ref=qr")).toBe("/shared/reports/token?ref=qr");
    expect(getSafeRedirectUrl("/records/new#step2")).toBe("/records/new#step2");
  });

  it("rejects null, undefined, and empty string", () => {
    expect(getSafeRedirectUrl(null)).toBeNull();
    expect(getSafeRedirectUrl(undefined)).toBeNull();
    expect(getSafeRedirectUrl("")).toBeNull();
    expect(getSafeRedirectUrl("   ")).toBeNull();
  });

  it("blocks protocol-relative URLs (//evil.com)", () => {
    expect(getSafeRedirectUrl("//evil.com")).toBeNull();
    expect(getSafeRedirectUrl("//evil.com/path")).toBeNull();
    expect(getSafeRedirectUrl("///evil.com")).toBeNull();
  });

  it("blocks absolute HTTP/HTTPS and javascript: URLs", () => {
    expect(getSafeRedirectUrl("https://evil.com")).toBeNull();
    expect(getSafeRedirectUrl("http://evil.com/steal-cookie")).toBeNull();
    expect(getSafeRedirectUrl("javascript:alert(1)")).toBeNull();
    expect(getSafeRedirectUrl("data:text/html,evil")).toBeNull();
  });

  it("blocks backslash bypass attempts", () => {
    expect(getSafeRedirectUrl("/\\evil.com")).toBeNull();
    expect(getSafeRedirectUrl("/path\\with\\backslash")).toBeNull();
  });

  it("blocks null bytes and CRLF control characters", () => {
    expect(getSafeRedirectUrl("/shared/reports\0evil")).toBeNull();
    expect(getSafeRedirectUrl("/shared/reports\r\nevil")).toBeNull();
  });
});
