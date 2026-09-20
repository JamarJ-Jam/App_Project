import { Router } from 'express';
import { bootstrapTrace } from './bootstrapTrace.js';
export const createBootstrapRouter = (authenticationMiddleware) => {
    const router = Router();
    router.post('/api/auth/bootstrap', (_req, _res, next) => {
        bootstrapTrace('REQUEST_ENTERED');
        next();
    }, authenticationMiddleware, (req, res) => {
        bootstrapTrace('HANDLER_ENTERED');
        const auth = req.auth;
        if (!auth) {
            res.status(500).json({ success: false, error: 'Internal server error' });
            bootstrapTrace('HANDLER_COMPLETED status=500');
            return;
        }
        res.status(200).json({
            success: true,
            account: {
                id: auth.accountId,
                status: auth.accountStatus,
            },
        });
        bootstrapTrace('HANDLER_COMPLETED status=200');
    });
    return router;
};
