import { createRemoteJWKSet, jwtVerify, } from 'jose';
import { getAuthConfig } from '../config.js';
export class AuthenticationError extends Error {
    constructor() {
        super('Unauthorized');
        this.name = 'AuthenticationError';
    }
}
export const parseBearerToken = (authorization) => {
    if (typeof authorization !== 'string')
        throw new AuthenticationError();
    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match)
        throw new AuthenticationError();
    return match[1];
};
const toVerifiedIdentity = (payload, config) => {
    if (typeof payload.iss !== 'string' ||
        payload.iss !== config.issuer ||
        typeof payload.sub !== 'string' ||
        payload.sub.trim() === '') {
        throw new AuthenticationError();
    }
    return { issuer: payload.iss, subject: payload.sub, authProvider: 'supabase' };
};
export const createTokenVerifier = (config = getAuthConfig(), getKey = createRemoteJWKSet(new URL(config.jwksUrl))) => ({
    verify: async (token) => {
        try {
            const { payload } = await jwtVerify(token, getKey, {
                algorithms: [...config.allowedAlgorithms],
                issuer: config.issuer,
                audience: config.audience,
            });
            return toVerifiedIdentity(payload, config);
        }
        catch {
            throw new AuthenticationError();
        }
    },
});
export const publicAuthenticationFailure = () => ({
    status: 401,
    body: { success: false, error: 'Unauthorized' },
});
