import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from 'jose';
import { getAuthConfig, type AuthConfig } from '../config.js';

export interface VerifiedIdentity {
  issuer: string;
  subject: string;
  authProvider: 'supabase';
}

export class AuthenticationError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'AuthenticationError';
  }
}

export const parseBearerToken = (authorization: string | string[] | undefined): string => {
  if (typeof authorization !== 'string') throw new AuthenticationError();
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match) throw new AuthenticationError();
  return match[1];
};

const toVerifiedIdentity = (payload: JWTPayload, config: AuthConfig): VerifiedIdentity => {
  if (
    typeof payload.iss !== 'string' ||
    payload.iss !== config.issuer ||
    typeof payload.sub !== 'string' ||
    payload.sub.trim() === ''
  ) {
    throw new AuthenticationError();
  }

  return { issuer: payload.iss, subject: payload.sub, authProvider: 'supabase' };
};

export const createTokenVerifier = (
  config: AuthConfig = getAuthConfig(),
  getKey: JWTVerifyGetKey = createRemoteJWKSet(new URL(config.jwksUrl)),
) => ({
  verify: async (token: string): Promise<VerifiedIdentity> => {
    try {
      const { payload } = await jwtVerify(token, getKey, {
        algorithms: [...config.allowedAlgorithms],
        issuer: config.issuer,
        audience: config.audience,
      });
      return toVerifiedIdentity(payload, config);
    } catch {
      throw new AuthenticationError();
    }
  },
});

export const publicAuthenticationFailure = () => ({
  status: 401,
  body: { success: false, error: 'Unauthorized' },
} as const);