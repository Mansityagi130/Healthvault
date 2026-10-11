import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { env } from "../config/env.js";

const shouldSkip = (req: Request) => {
  if (req.headers["x-test-rate-limit"] === "true") return false;
  // In production, rate limiting is strictly enforced and cannot be bypassed via SKIP_RATE_LIMIT
  if (env.NODE_ENV === "production") return false;
  const isTestEnv = env.NODE_ENV === "test";
  const isDevEnv = env.NODE_ENV === "development";
  const skipFlag = process.env.SKIP_RATE_LIMIT === "true";
  return skipFlag || isTestEnv || isDevEnv;
};

// Limit registration to 5 accounts per hour per IP
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Too many accounts created from this IP, please try again after an hour" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
});

// Limit login attempts to mitigate brute-force
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: "Too many login attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
});

// Limit refresh requests to prevent abuse
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many refresh requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
});

// Limit MFA verification attempts
export const mfaVerifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: { error: "Too many verification attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
});

// Limit password reset request / reset-token verification
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many password reset attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
});

// Limit password change attempts
export const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many password change attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
});

// Limit FHIR export requests to 30 per hour
export const fhirExportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { error: "Too many FHIR export requests, please try again after an hour" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
});

// Limit shared report resolution/downloads
export const sharedReportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: "Too many share access requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
});

