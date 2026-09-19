import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { createAuthenticationMiddleware } from '../src/auth/authMiddleware.js';
import { createBootstrapRouter } from '../src/auth/bootstrapRoute.js';
import { AuthenticationError, type VerifiedIdentity } from '../src/auth/tokenVerifier.js';
import type { ResolvedAccountIdentity } from '../src/repositories/identityRepository.js';
import { IdentityResolutionConcurrencyError } from '../src/services/identityService.js';

const identity: VerifiedIdentity = {
  issuer: 'https://project.supabase.co/auth/v1',
  subject: 'verified-subject',
  authProvider: 'supabase',
};

const resolved = (status: ResolvedAccountIdentity['accountStatus'] = 'active'): ResolvedAccountIdentity => ({
  accountId: 'permanent-account-id',
  accountStatus: status,
  identity,
});

const jsonRequest = (
  server: Server,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: unknown,
) => new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
  const address = server.address();
  if (!address || typeof address === 'string') return reject(new Error('Test server has no TCP address.'));
  const request = fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  request.then(async (response) => {
    const text = await response.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // Non-JSON responses are useful for asserting unsupported methods.
    }
    resolve({ status: response.status, body });
  }).catch(reject);
});

const startWithVerifier = async (
  verifyAccessToken: (token: string) => Promise<VerifiedIdentity>,
  resolver: (identity: VerifiedIdentity) => Promise<ResolvedAccountIdentity>,
) => {
  const app = express();
  app.use(express.json());
  app.use(createBootstrapRouter(createAuthenticationMiddleware({ verifyAccessToken, resolveIdentity: resolver })));
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
};

const closeServer = async (server: Server) => {
  server.close();
  await once(server, 'close');
};

test('active authenticated bootstrap returns only permanent account identity', async () => {
  const server = await startWithVerifier(async () => identity, async (verified) => ({ ...resolved(), identity: verified }));
  try {
    const response = await jsonRequest(server, 'POST', '/api/auth/bootstrap', {
      authorization: 'Bearer token',
    }, {
      accountId: 'client-account',
      userId: 'client-user',
      email: 'client@example.invalid',
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      success: true,
      account: { id: 'permanent-account-id', status: 'active' },
    });
    assert.equal(JSON.stringify(response.body).includes('verified-subject'), false);
    assert.equal(JSON.stringify(response.body).includes('Bearer'), false);
  } finally {
    await closeServer(server);
  }
});

test('missing and invalid authentication return 401', async () => {
  for (const authorization of [undefined, 'Basic token']) {
    const server = await startWithVerifier(async () => { throw new AuthenticationError(); }, async () => resolved());
    try {
      const headers = authorization ? { authorization } : {};
      const response = await jsonRequest(server, 'POST', '/api/auth/bootstrap', headers);
      assert.equal(response.status, 401);
      assert.deepEqual(response.body, { success: false, error: 'Unauthorized' });
    } finally {
      await closeServer(server);
    }
  }
});

test('suspended and pending-deletion accounts return 403', async () => {
  for (const status of ['suspended', 'pending_deletion'] as const) {
    const server = await startWithVerifier(async () => identity, async () => resolved(status));
    try {
      const response = await jsonRequest(server, 'POST', '/api/auth/bootstrap', { authorization: 'Bearer token' });
      assert.equal(response.status, 403);
      assert.deepEqual(response.body, { success: false, error: 'Forbidden' });
    } finally {
      await closeServer(server);
    }
  }
});

test('identity and database failures return generic 500', async () => {
  for (const failure of [new Error('database detail'), new IdentityResolutionConcurrencyError()]) {
    const server = await startWithVerifier(async () => identity, async () => { throw failure; });
    try {
      const response = await jsonRequest(server, 'POST', '/api/auth/bootstrap', { authorization: 'Bearer token' });
      assert.equal(response.status, 500);
      assert.deepEqual(response.body, { success: false, error: 'Internal server error' });
    } finally {
      await closeServer(server);
    }
  }
});

test('bootstrap uses POST and does not provide an alternate ownership source', async () => {
  let receivedIdentity: VerifiedIdentity | undefined;
  const server = await startWithVerifier(
    async () => identity,
    async (verified) => {
      receivedIdentity = verified;
      return resolved();
    },
  );
  try {
    const getResponse = await jsonRequest(server, 'GET', '/api/auth/bootstrap', { authorization: 'Bearer token' });
    assert.equal(getResponse.status, 404);
    const postResponse = await jsonRequest(server, 'POST', '/api/auth/bootstrap', { authorization: 'Bearer token' }, {
      accountId: 'attacker-account',
      userId: 'attacker-user',
    });
    assert.equal(postResponse.body.account && (postResponse.body.account as Record<string, unknown>).id, 'permanent-account-id');
    assert.deepEqual(receivedIdentity, identity);
  } finally {
    await closeServer(server);
  }
});