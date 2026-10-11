/**
 * Utility for safe URL redirection to prevent Open Redirect vulnerabilities.
 * Strictly verifies that the target URL is a safe internal relative path.
 */
export function getSafeRedirectUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") {
    return null;
  }

  const trimmed = url.trim();

  // Must start with '/' but strictly not '//' (protocol-relative URLs)
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null;
  }

  // Reject backslashes (Windows path tricks or bypasses)
  if (trimmed.includes("\\")) {
    return null;
  }

  // Reject null bytes and control characters
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return null;
  }

  // Ensure parsing with a dummy origin stays strictly on the same origin
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
