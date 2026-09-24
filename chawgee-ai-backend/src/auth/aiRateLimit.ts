import type { RequestHandler } from 'express';
import { rateLimit, type Store } from 'express-rate-limit';

export const ONBOARDING_AI_RATE_LIMIT = Object.freeze({
  windowMs: 30 * 60 * 1000,
  limit: 60,
  identifier: 'onboarding-ai-subject',
});

export const BRIEFING_AI_RATE_LIMIT = Object.freeze({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  identifier: 'briefing-ai-subject',
});

export interface AiSubjectRateLimitOptions {
  windowMs?: number;
  limit?: number;
  store?: Store;
}

export const createAuthenticatedSubjectLimiter = (
  policy: Readonly<{ windowMs: number; limit: number; identifier: string }>,
  options: AiSubjectRateLimitOptions = {},
): RequestHandler => {
  const limiter = rateLimit({
    windowMs: options.windowMs ?? policy.windowMs,
    limit: options.limit ?? policy.limit,
    ...(options.store ? { store: options.store } : {}),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    identifier: policy.identifier,
    keyGenerator: (req) => req.auth!.identity.subject,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.',
      });
    },
  });

  return (req, res, next) => {
    if (!req.auth) {
      res.status(500).json({ success: false, error: 'Internal server error' });
      return;
    }
    limiter(req, res, next);
  };
};