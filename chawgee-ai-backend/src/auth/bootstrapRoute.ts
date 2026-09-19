import { Router, type RequestHandler } from 'express';

export const createBootstrapRouter = (authenticationMiddleware: RequestHandler): Router => {
  const router = Router();

  router.post('/api/auth/bootstrap', authenticationMiddleware, (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(500).json({ success: false, error: 'Internal server error' });
      return;
    }

    res.json({
      success: true,
      account: {
        id: auth.accountId,
        status: auth.accountStatus,
      },
    });
  });

  return router;
};