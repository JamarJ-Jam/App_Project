import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import type { Store } from 'express-rate-limit';
import { createAuthenticationMiddleware } from '../src/auth/authMiddleware.js';
import {
  BRIEFING_AI_RATE_LIMIT,
  createAuthenticatedSubjectLimiter,
  ONBOARDING_AI_RATE_LIMIT,
} from '../src/auth/aiRateLimit.js';
import { createBriefingRouter } from '../src/briefingRoute.js';
import { createOnboardingRouter } from '../src/chawgeeOnboardingRoute.js';
import { AuthenticationError, type VerifiedIdentity } from '../src/auth/tokenVerifier.js';
import type { ResolvedAccountIdentity } from '../src/repositories/identityRepository.js';

const SUBJECT_A = '11111111-1111-4111-8111-111111111111';
const SUBJECT_B = '22222222-2222-4222-8222-222222222222';

const identityFor = (subject: string): VerifiedIdentity => ({
  issuer: 'https://project.supabase.co/auth/v1',
  subject,
  authProvider: 'supabase',
});

const resolved = (
  identity: VerifiedIdentity,
  accountStatus: ResolvedAccountIdentity['accountStatus'] = 'active',
): ResolvedAccountIdentity => ({
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
  resolveIdentity?: (identity: VerifiedIdentity) => Promise<ResolvedAccountIdentity>;
  onboardingLimit?: number;
  briefingLimit?: number;
  onboardingStore?: Store;
  briefingStore?: Store;
  onboardingWindowMs?: number;
  briefingWindowMs?: number;
  failProviders?: boolean;
}

const start = async (options: TestAppOptions = {}) => {
  let onboardingCalls = 0;
  let briefingCalls = 0;
  let resolvedIdentity: VerifiedIdentity | undefined;
  const app = express();
  app.use(express.json());
  const authentication = createAuthenticationMiddleware({
    verifyAccessToken: async (token) => {
      if (token === `valid:${SUBJECT_A}`) return identityFor(SUBJECT_A);
      if (token === `valid:${SUBJECT_B}`) return identityFor(SUBJECT_B);
      throw new AuthenticationError();
    },
    resolveIdentity: async (identity) => {
      resolvedIdentity = identity;
      return options.resolveIdentity?.(identity) ?? resolved(identity);
    },
  });
  const onboardingLimiter = createAuthenticatedSubjectLimiter(ONBOARDING_AI_RATE_LIMIT, {
    limit: options.onboardingLimit,
    windowMs: options.onboardingWindowMs,
    store: options.onboardingStore,
  });
  const briefingLimiter = createAuthenticatedSubjectLimiter(BRIEFING_AI_RATE_LIMIT, {
    limit: options.briefingLimit,
    windowMs: options.briefingWindowMs,
    store: options.briefingStore,
  });
  app.use(createOnboardingRouter(async () => {
    onboardingCalls += 1;
    if (options.failProviders) throw new Error('provider-error token=secret');
    return { text: JSON.stringify({ intent: 'answer', updates: { primaryGoal: 'Fitness' }, assistantLead: 'Good choice.' }) };
  }, [authentication, onboardingLimiter]));
  app.use(createBriefingRouter(async () => {
    briefingCalls += 1;
    if (options.failProviders) throw new Error('provider-error token=secret');
    return { text: 'Briefing response', toolResults: [] };
  }, [authentication, briefingLimiter]));
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    server,
    calls: () => ({ onboarding: onboardingCalls, briefing: briefingCalls }),
    resolvedIdentity: () => resolvedIdentity,
  };
};

const close = async (server: Server): Promise<void> => {
  server.close();
  await once(server, 'close');
};

const request = async (
  server: Server,
  path: '/api/chawgee/onboarding' | '/api/chawgee/briefing',
  token?: string,
  headers: Record<string, string> = {},
  body: Record<string, unknown> = path.endsWith('onboarding')
    ? { message: 'Fitness', expectedField: 'primaryGoal', profile: {} }
    : { userContext: { activity: 'private' } },
) => {
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
};

test('unauthenticated and inadmissible AI requests return 401 before either provider runs', async () => {
  const { server, calls } = await start();
  try {
    for (const token of [undefined, 'malformed', 'expired', 'anonymous', 'inadmissible']) {
      for (const path of ['/api/chawgee/onboarding', '/api/chawgee/briefing'] as const) {
        const result = await request(server, path, token);
        assert.equal(result.response.status, 401);
        assert.deepEqual(result.body, { success: false, error: 'Unauthorized' });
      }
    }
    assert.deepEqual(calls(), { onboarding: 0, briefing: 0 });
  } finally {
    await close(server);
  }
});

test('active accounts can use both AI routes and request bodies cannot select another subject', async () => {
  const { server, calls, resolvedIdentity } = await start();
  try {
    const onboarding = await request(server, '/api/chawgee/onboarding', `valid:${SUBJECT_A}`, {}, {
      message: 'Fitness',
      expectedField: 'primaryGoal',
      profile: { subject: SUBJECT_B, email: 'other@example.test' },
    });
    assert.equal(onboarding.response.status, 200);
    assert.equal(onboarding.body.nextField, 'units');
    assert.equal(resolvedIdentity()?.subject, SUBJECT_A);

    const briefing = await request(server, '/api/chawgee/briefing', `valid:${SUBJECT_A}`, {}, {
      userContext: { accountId: SUBJECT_B, email: 'other@example.test' },
    });
    assert.equal(briefing.response.status, 200);
    assert.deepEqual(briefing.body, { success: true, chawgeeInsight: 'Briefing response', toolResults: [] });
    assert.deepEqual(calls(), { onboarding: 1, briefing: 1 });
  } finally {
    await close(server);
  }
});

test('unresolved and inactive accounts cannot invoke providers', async () => {
  for (const outcome of ['unresolved', 'suspended', 'pending_deletion'] as const) {
    const { server, calls } = await start({
      resolveIdentity: async (identity) => {
        if (outcome === 'unresolved') throw new Error('database detail');
        return resolved(identity, outcome);
      },
    });
    try {
      const result = await request(server, '/api/chawgee/briefing', `valid:${SUBJECT_A}`);
      assert.equal(result.response.status, outcome === 'unresolved' ? 500 : 403);
      assert.deepEqual(calls(), { onboarding: 0, briefing: 0 });
    } finally {
      await close(server);
    }
  }
});

test('onboarding admits sixty requests and safely limits request sixty-one', async () => {
  const { server, calls } = await start();
  try {
    for (let attempt = 1; attempt <= 60; attempt += 1) {
      assert.equal((await request(server, '/api/chawgee/onboarding', `valid:${SUBJECT_A}`)).response.status, 200, `attempt ${attempt}`);
    }
    const limited = await request(server, '/api/chawgee/onboarding', `valid:${SUBJECT_A}`);
    assert.equal(limited.response.status, 429);
    assert.deepEqual(limited.body, { success: false, error: 'Too many requests. Please try again later.' });
    assert.ok(limited.response.headers.get('ratelimit'));
    assert.ok(limited.response.headers.get('ratelimit-policy'));
    assert.ok(limited.response.headers.get('retry-after'));
    assert.deepEqual(calls(), { onboarding: 60, briefing: 0 });
  } finally {
    await close(server);
  }
});

test('briefing admits twelve requests, uses a separate budget, and ignores forwarding headers', async () => {
  const { server, calls } = await start({ briefingLimit: 12, onboardingLimit: 1 });
  try {
    assert.equal((await request(server, '/api/chawgee/onboarding', `valid:${SUBJECT_A}`)).response.status, 200);
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      assert.equal((await request(server, '/api/chawgee/briefing', `valid:${SUBJECT_A}`, {
        'x-forwarded-for': `198.51.100.${attempt}`,
        'x-real-ip': `203.0.113.${attempt}`,
      })).response.status, 200, `attempt ${attempt}`);
    }
    const limited = await request(server, '/api/chawgee/briefing', `valid:${SUBJECT_A}`, {
      'x-forwarded-for': '203.0.113.99',
      'x-real-ip': '198.51.100.99',
    });
    assert.equal(limited.response.status, 429);
    assert.equal((await request(server, '/api/chawgee/briefing', `valid:${SUBJECT_B}`)).response.status, 200);
    assert.deepEqual(calls(), { onboarding: 1, briefing: 13 });
  } finally {
    await close(server);
  }
});

test('AI limiter window expiry permits retry with isolated deterministic state', async () => {
  const store = new ControlledStore();
  const { server } = await start({ briefingLimit: 1, briefingWindowMs: 1000, briefingStore: store });
  try {
    assert.equal((await request(server, '/api/chawgee/briefing', `valid:${SUBJECT_A}`)).response.status, 200);
    assert.equal((await request(server, '/api/chawgee/briefing', `valid:${SUBJECT_A}`)).response.status, 429);
    store.advance(1000);
    assert.equal((await request(server, '/api/chawgee/briefing', `valid:${SUBJECT_A}`)).response.status, 200);
  } finally {
    await close(server);
  }
});

test('authenticated provider failures remain generic and redacted', async () => {
  const { server, calls } = await start({ failProviders: true });
  const originalError = console.error;
  const logs: string[] = [];
  console.error = (message?: unknown) => { logs.push(String(message)); };
  try {
    const onboarding = await request(server, '/api/chawgee/onboarding', `valid:${SUBJECT_A}`);
    const briefing = await request(server, '/api/chawgee/briefing', `valid:${SUBJECT_A}`);
    assert.equal(onboarding.response.status, 500);
    assert.deepEqual(onboarding.body, { error: 'Unable to process onboarding response.' });
    assert.equal(briefing.response.status, 500);
    assert.deepEqual(briefing.body, { success: false, error: 'Internal server error' });
    assert.equal(JSON.stringify([onboarding.body, briefing.body, logs]).includes('provider-error token=secret'), false);
    assert.deepEqual(calls(), { onboarding: 1, briefing: 1 });
  } finally {
    console.error = originalError;
    await close(server);
  }
});