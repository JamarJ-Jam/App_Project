import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import type { Store } from 'express-rate-limit';
import {
  createIdentityResolutionMiddleware,
  createTokenAdmissionMiddleware,
} from '../src/auth/authMiddleware.js';
import { createBootstrapSubjectLimiter } from '../src/auth/bootstrapRateLimit.js';
import { createBootstrapRouter } from '../src/auth/bootstrapRoute.js';
import { AuthenticationError, type VerifiedIdentity } from '../src/auth/tokenVerifier.js';
import type { ResolvedAccountIdentity } from '../src/repositories/identityRepository.js';

const SUBJECT_A = '11111111-1111-4111-8111-111111111111';
const SUBJECT_B = '22222222-2222-4222-8222-222222222222';

const identityFor = (subject: string): VerifiedIdentity => ({
  issuer: 'https://project.supabase.co/auth/v1',
  subject,
  authProvider: 'supabase',
});

const resolved = (identity: VerifiedIdentity, accountStatus: ResolvedAccountIdentity['accountStatus'] = 'active'): ResolvedAccountIdentity => ({
  accountId: `account-${identity.subject}`,
  accountStatus,
  identity,
});

class ControlledStore implements Store {
  localKeys = true;
  private windowMs = 0;
  private now = 0;
  private readonly entries = new Map<string, { hits: number; resetAt: number }>();

  init(options: { windowMs: number }): void {
    this.windowMs = options.windowMs;
  }

  increment(key: string) {
    const entry = this.entries.get(key);
    const active = entry && entry.resetAt > this.now
      ? entry
      : { hits: 0, resetAt: this.now + this.windowMs };
    active.hits += 1;
    this.entries.set(key, active);
    return { totalHits: active.hits, resetTime: new Date(active.resetAt) };
  }

  decrement(key: string): void {
    const entry = this.entries.get(key);
    if (entry) entry.hits = Math.max(0, entry.hits - 1);
  }

  resetKey(key: string): void {
    this.entries.delete(key);
  }

  advance(milliseconds: number): void {
    this.now += milliseconds;
  }
}

interface TestAppOptions {
  limit?: number;
  windowMs?: number;
  store?: Store;
  resolveIdentity?: (identity: VerifiedIdentity) => Promise<ResolvedAccountIdentity>;
}

const start = async (options: TestAppOptions = {}): Promise<Server> => {
  const app = express();
  const admitToken = createTokenAdmissionMiddleware({
    verifyAccessToken: async (token) => {
      if (token === `valid:${SUBJECT_A}`) return identityFor(SUBJECT_A);
      if (token === `valid:${SUBJECT_B}`) return identityFor(SUBJECT_B);
      throw new AuthenticationError();
    },
  });
  const limiter = createBootstrapSubjectLimiter({
    limit: options.limit,
    windowMs: options.windowMs,
    store: options.store,
  });
  const resolveIdentity = createIdentityResolutionMiddleware({
    resolveIdentity: options.resolveIdentity ?? (async (identity) => resolved(identity)),
  });
  app.use(createBootstrapRouter(admitToken, limiter, resolveIdentity));
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
};

const close = async (server: Server): Promise<void> => {
  server.close();
  await once(server, 'close');
};

const request = async (
  server: Server,
  token: string,
  headers: Record<string, string> = {},
) => {
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/bootstrap`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, ...headers },
  });
  return { response, body: await response.json() };
};

test('normal verified bootstrap succeeds with standard rate limit headers', async () => {
  const server = await start();
  try {
    const { response, body } = await request(server, `valid:${SUBJECT_A}`);
    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      success: true,
      account: { id: `account-${SUBJECT_A}`, status: 'active' },
    });
    assert.ok(response.headers.get('ratelimit'));
    assert.ok(response.headers.get('ratelimit-policy'));
  } finally {
    await close(server);
  }
});

test('first thirty verified bootstrap requests pass and request thirty-one is safely limited', async () => {
  const server = await start();
  try {
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      const { response } = await request(server, `valid:${SUBJECT_A}`);
      assert.equal(response.status, 200, `attempt ${attempt}`);
    }
    const { response, body } = await request(server, `valid:${SUBJECT_A}`);
    assert.equal(response.status, 429);
    assert.deepEqual(body, { success: false, error: 'Too many requests. Please try again later.' });
    assert.ok(response.headers.get('ratelimit'));
    assert.ok(response.headers.get('ratelimit-policy'));
    assert.ok(response.headers.get('retry-after'));
  } finally {
    await close(server);
  }
});

test('forwarding headers cannot change verified-subject limiter isolation', async () => {
  const server = await start({ limit: 1 });
  try {
    const first = await request(server, `valid:${SUBJECT_A}`, {
      'x-forwarded-for': '198.51.100.1',
      'x-real-ip': '198.51.100.1',
    });
    assert.equal(first.response.status, 200);

    const sameSubject = await request(server, `valid:${SUBJECT_A}`, {
      'x-forwarded-for': '203.0.113.99',
      'x-real-ip': '203.0.113.99',
    });
    assert.equal(sameSubject.response.status, 429);

    const differentSubject = await request(server, `valid:${SUBJECT_B}`, {
      'x-forwarded-for': '198.51.100.1',
      'x-real-ip': '198.51.100.1',
    });
    assert.equal(differentSubject.response.status, 200);
  } finally {
    await close(server);
  }
});

test('invalid or forged tokens fail before they can consume or select a subject bucket', async () => {
  const server = await start({ limit: 1 });
  try {
    const invalid = await request(server, `forged:${SUBJECT_A}`, {
      'x-forwarded-for': '203.0.113.7',
    });
    assert.equal(invalid.response.status, 401);
    assert.deepEqual(invalid.body, { success: false, error: 'Unauthorized' });

    const valid = await request(server, `valid:${SUBJECT_A}`);
    assert.equal(valid.response.status, 200);
    const limited = await request(server, `valid:${SUBJECT_A}`);
    assert.equal(limited.response.status, 429);
  } finally {
    await close(server);
  }
});

test('verified requests that later return 403 or 500 still consume the subject budget', async () => {
  for (const failure of ['forbidden', 'failure'] as const) {
    const server = await start({
      limit: 1,
      resolveIdentity: async (identity) => {
        if (failure === 'forbidden') return resolved(identity, 'suspended');
        throw new Error('identity storage unavailable');
      },
    });
    try {
      const first = await request(server, `valid:${SUBJECT_A}`);
      assert.equal(first.response.status, failure === 'forbidden' ? 403 : 500);
      const second = await request(server, `valid:${SUBJECT_A}`);
      assert.equal(second.response.status, 429);
    } finally {
      await close(server);
    }
  }
});

test('window expiry permits a verified subject to retry deterministically', async () => {
  const store = new ControlledStore();
  const server = await start({ limit: 1, windowMs: 1000, store });
  try {
    assert.equal((await request(server, `valid:${SUBJECT_A}`)).response.status, 200);
    assert.equal((await request(server, `valid:${SUBJECT_A}`)).response.status, 429);
    store.advance(1000);
    assert.equal((await request(server, `valid:${SUBJECT_A}`)).response.status, 200);
  } finally {
    await close(server);
  }
});

test('verified token context alone cannot bypass identity resolution or account status enforcement', async () => {
  const app = express();
  let resolutionCalls = 0;
  app.use((req, _res, next) => {
    req.verifiedToken = { identity: identityFor(SUBJECT_A) };
    next();
  });
  app.use(createBootstrapRouter(createIdentityResolutionMiddleware({
    resolveIdentity: async (identity) => {
      resolutionCalls += 1;
      return resolved(identity, 'suspended');
    },
  })));
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/bootstrap`, { method: 'POST' });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { success: false, error: 'Forbidden' });
    assert.equal(resolutionCalls, 1);
  } finally {
    await close(server);
  }
});