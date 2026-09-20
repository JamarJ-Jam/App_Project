import { AuthenticationError, parseBearerToken, } from './tokenVerifier.js';
import { bootstrapTrace } from './bootstrapTrace.js';
export class AuthorizationError extends Error {
    constructor() {
        super('Forbidden');
        this.name = 'AuthorizationError';
    }
}
const sendFailure = (res, status, error) => {
    res.status(status).json({ success: false, error });
};
const toAuthenticatedContext = (resolved) => {
    bootstrapTrace('ACCOUNT_STATUS_CHECK_ENTERED');
    if (resolved.accountStatus !== 'active')
        throw new AuthorizationError();
    bootstrapTrace('ACCOUNT_STATUS_CHECK_COMPLETED');
    return {
        identity: resolved.identity,
        accountId: resolved.accountId,
        accountStatus: 'active',
    };
};
export const createAuthenticationMiddleware = (dependencies) => async (req, res, next) => {
    bootstrapTrace('AUTH_MIDDLEWARE_ENTERED');
    let identity;
    try {
        const token = parseBearerToken(req.headers.authorization);
        identity = await dependencies.verifyAccessToken(token);
        bootstrapTrace('AUTH_MIDDLEWARE_COMPLETED');
    }
    catch (error) {
        if (error instanceof AuthenticationError) {
            sendFailure(res, 401, 'Unauthorized');
            return;
        }
        sendFailure(res, 500, 'Internal server error');
        return;
    }
    try {
        bootstrapTrace('IDENTITY_RESOLUTION_ENTERED');
        const resolved = await dependencies.resolveIdentity(identity);
        bootstrapTrace('IDENTITY_RESOLUTION_COMPLETED');
        req.auth = toAuthenticatedContext(resolved);
        next();
    }
    catch (error) {
        if (error instanceof AuthorizationError) {
            sendFailure(res, 403, 'Forbidden');
            return;
        }
        sendFailure(res, 500, 'Internal server error');
    }
};
