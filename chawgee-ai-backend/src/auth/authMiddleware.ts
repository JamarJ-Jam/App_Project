import type { NextFunction, Request, RequestHandler, Response } from 'express';
import {
  AuthenticationError,
  parseBearerToken,
  type VerifiedIdentity,
} from './tokenVerifier.js';
import type { ResolvedAccountIdentity } from '../repositories/identityRepository.js';

export interface AuthenticatedContext {
  identity: VerifiedIdentity;
  accountId: string;
  accountStatus: 'active';
}

export class AuthorizationError extends Error {
  constructor() {
    super('Forbidden');
    this.name = 'AuthorizationError';
  }
}

export interface AuthenticationMiddlewareDependencies {
  verifyAccessToken: (token: string) => Promise<VerifiedIdentity>;
  resolveIdentity: (identity: VerifiedIdentity) => Promise<ResolvedAccountIdentity>;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedContext;
    }
  }
}

const sendFailure = (res: Response, status: 401 | 403 | 500, error: string): void => {
  res.status(status).json({ success: false, error });
};

const toAuthenticatedContext = (resolved: ResolvedAccountIdentity): AuthenticatedContext => {
  if (resolved.accountStatus !== 'active') throw new AuthorizationError();

  return {
    identity: resolved.identity,
    accountId: resolved.accountId,
    accountStatus: 'active',
  };
};

export const createAuthenticationMiddleware = (
  dependencies: AuthenticationMiddlewareDependencies,
): RequestHandler => async (req: Request, res: Response, next: NextFunction) => {
  let identity: VerifiedIdentity;
  try {
    const token = parseBearerToken(req.headers.authorization);
    identity = await dependencies.verifyAccessToken(token);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendFailure(res, 401, 'Unauthorized');
      return;
    }

    sendFailure(res, 500, 'Internal server error');
    return;
  }

  try {
    const resolved = await dependencies.resolveIdentity(identity);
    req.auth = toAuthenticatedContext(resolved);
    next();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      sendFailure(res, 403, 'Forbidden');
      return;
    }

    sendFailure(res, 500, 'Internal server error');
  }
};