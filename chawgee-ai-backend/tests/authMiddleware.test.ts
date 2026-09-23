import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { AuthenticationError, type VerifiedIdentity } from '../src/auth/tokenVerifier.js';
import {
  AuthorizationError,
  createAuthenticationMiddleware,
  type AuthenticatedContext,
} from '../src/auth/authMiddleware.js';
import type { ResolvedAccountIdentity } from '../src/repositories/identityRepository.js';
import { IdentityResolutionConcurrencyError } from '../src/services/identityService.js';

const identity: VerifiedIdentity = {
  issuer: 'https://project.supabase.co/auth/v1',
  subject: 'verified-subject',
  authProvider: 'supabase',
};

const resolved = (accountStatus: ResolvedAccountIdentity['accountStatus'] = 'active'): ResolvedAccountIdentity => ({
  accountId: 'account-123',
  accountStatus,
  identity,
});

const request = (authorization = 'Bearer test-token', body?: unknown): Request => ({
  headers: { authorization },
  body,
} as Request);

const response = () => {
  const calls: Array<{ status: number; body: unknown }> = [];
  const res = {
    locals: {} as Record<string, unknown>,
    status(statusCode: number) {
      return {
        json(body: unknown) {
          calls.push({ status: statusCode, body });
          return res;
        },
      };
    },
  } as unknown as Response;
  return { res, calls };
};

const run = async (
  authorization: string | string[] | undefined,
  verifyAccessToken: (token: string) => Promise<VerifiedIdentity>,
  resolveIdentity: (value: VerifiedIdentity) => Promise<ResolvedAccountIdentity>,
  body?: unknown,
) => {
  const req = request(authorization as string, body);
  (req.headers as unknown as Record<string, string | string[] | undefined>).authorization = authorization;
  const { res, calls } = response();
  let nextCalls = 0;
  const next: NextFunction = () => { nextCalls += 1; };
  await createAuthenticationMiddleware({ verifyAccessToken, resolveIdentity })(req, res, next);
  return { req, calls, nextCalls };
};

test('valid token resolves active identity into trusted req.auth', async () => {
  let receivedToken = '';
  const result = await run(
    'Bearer verified-token',
    async (token) => { receivedToken = token; return identity; },
    async (verified) => ({ ...resolved(), identity: verified }),
    { accountId: 'client-account', userId: 'client-user', email: 'client@example.invalid' },
  );

  assert.equal(receivedToken, 'verified-token');
  assert.equal(result.nextCalls, 1);
  assert.deepEqual(result.req.auth, {
    identity,
    accountId: 'account-123',
    accountStatus: 'active',
  } satisfies AuthenticatedContext);
  assert.equal('token' in (result.req.auth ?? {}), false);
  assert.equal(result.calls.length, 0);
});

test('missing or malformed authorization returns generic 401 and skips next', async () => {
  for (const authorization of [undefined, 'Basic token', 'Bearer', 'Bearer one two']) {
    const result = await run(authorization, async () => identity, async () => resolved());
    assert.equal(result.nextCalls, 0);
    assert.deepEqual(result.calls, [{ status: 401, body: { success: false, error: 'Unauthorized' } }]);
  }
});

test('authentication failure returns 401 without exposing details', async () => {
  let resolvedCalls = 0;
  const result = await run(
    'Bearer invalid-token',
    async () => { throw new AuthenticationError(); },
    async () => { resolvedCalls += 1; return resolved(); },
  );
  assert.equal(resolvedCalls, 0);
  assert.equal(result.nextCalls, 0);
  assert.deepEqual(result.calls, [{ status: 401, body: { success: false, error: 'Unauthorized' } }]);
});

test('unexpected verifier failure returns generic 500', async () => {
  const result = await run(
    'Bearer token',
    async () => { throw new Error('private verifier detail'); },
    async () => resolved(),
  );
  assert.equal(result.nextCalls, 0);
  assert.deepEqual(result.calls, [{ status: 500, body: { success: false, error: 'Internal server error' } }]);
});

test('suspended and pending-deletion accounts return generic 403 without next', async () => {
  for (const status of ['suspended', 'pending_deletion'] as const) {
    let resolvedCalls = 0;
    const result = await run(
      'Bearer token',
      async () => identity,
      async () => { resolvedCalls += 1; return resolved(status); },
    );
    assert.equal(resolvedCalls, 1);
    assert.equal(result.nextCalls, 0);
    assert.deepEqual(result.calls, [{ status: 403, body: { success: false, error: 'Forbidden' } }]);
  }
});

test('identity resolution and concurrency failures return generic 500', async () => {
  for (const failure of [new Error('database detail'), new IdentityResolutionConcurrencyError()]) {
    const result = await run(
      'Bearer token',
      async () => identity,
      async () => { throw failure; },
    );
    assert.equal(result.nextCalls, 0);
    assert.deepEqual(result.calls, [{ status: 500, body: { success: false, error: 'Internal server error' } }]);
  }
});

test('authorization context preserves verified identity and ignores client ownership fields', async () => {
  const clientBody = {
    accountId: 'attacker-account',
    userId: 'attacker-user',
    ownerId: 'attacker-owner',
    email: 'attacker@example.invalid',
    subject: 'attacker-subject',
    issuer: 'https://attacker.invalid',
    authProvider: 'attacker',
  };
  const result = await run('Bearer token', async () => identity, async () => resolved(), clientBody);
  assert.equal(result.req.auth?.accountId, 'account-123');
  assert.deepEqual(result.req.auth?.identity, identity);
});

test('authorization error abstraction remains generic', () => {
  assert.equal(new AuthorizationError().message, 'Forbidden');
});