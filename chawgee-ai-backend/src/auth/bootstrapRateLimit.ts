import type { RequestHandler } from 'express';
import { rateLimit, type Store } from 'express-rate-limit';

export const BOOTSTRAP_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
export const BOOTSTRAP_RATE_LIMIT_MAX_REQUESTS = 30;

export interface BootstrapRateLimitOptions {
  windowMs?: number;
  limit?: number;
  store?: Store;
}

export const createBootstrapSubjectLimiter = (
  options: BootstrapRateLimitOptions = {},
): RequestHandler => {
  const limiter = rateLimit({
    windowMs: options.windowMs ?? BOOTSTRAP_RATE_LIMIT_WINDOW_MS,
    limit: options.limit ?? BOOTSTRAP_RATE_LIMIT_MAX_REQUESTS,
    ...(options.store ? { store: options.store } : {}),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    identifier: 'bootstrap-subject',
    keyGenerator: (req) => req.verifiedToken!.identity.subject,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.',
      });
    },
  });

  return (req, res, next) => {
    if (!req.verifiedToken) {
      res.status(500).json({ success: false, error: 'Internal server error' });
      return;
    }
    limiter(req, res, next);
  };
};