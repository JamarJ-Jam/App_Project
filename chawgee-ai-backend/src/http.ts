import type { ErrorRequestHandler, RequestHandler, Response } from 'express';

export const JSON_BODY_LIMIT = '64kb';

const parserStatus = (error: unknown): 400 | 413 | undefined => {
  if (!error || typeof error !== 'object') return undefined;
  const status = Reflect.get(error, 'status');
  return status === 400 || status === 413 ? status : undefined;
};

export const jsonBodyErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  const status = parserStatus(error);
  if (!status) {
    next(error);
    return;
  }

  res.status(status).json({
    success: false,
    error: status === 413 ? 'Request body too large.' : 'Invalid request body.',
  });
};

export const sendInternalServerError = (res: Response): void => {
  res.status(500).json({ success: false, error: 'Internal server error' });
};

export const logOperationalFailure = (category: string): void => {
  console.error(`${category} failed.`);
};

export const healthHandler: RequestHandler = (_req, res) => {
  res.json({ success: true, message: 'Chawgee backend is alive' });
};

export const createReadinessHandler = (isReady: () => Promise<boolean>): RequestHandler => async (_req, res) => {
  const ready = await isReady();
  res.status(ready ? 200 : 503).json({ success: ready });
};