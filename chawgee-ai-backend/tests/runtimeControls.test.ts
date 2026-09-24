import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import express from 'express';
import { createBriefingRouter } from '../src/briefingRoute.js';
import { createOnboardingRouter } from '../src/chawgeeOnboardingRoute.js';
import {
  ConfigurationError,
  getServerRuntimeConfig,
} from '../src/config.js';
import {
  createReadinessHandler,
  healthHandler,
  JSON_BODY_LIMIT,
  jsonBodyErrorHandler,
  sendInternalServerError,
} from '../src/http.js';

const productionEnv = {
  NODE_ENV: 'production',
  PORT: '4000',
  SUPABASE_AUTH_ISSUER: 'https://project.supabase.co/auth/v1',
  SUPABASE_AUTH_JWKS_URL: 'https://project.supabase.co/auth/v1/.well-known/jwks.json',
  SUPABASE_AUTH_AUDIENCE: 'authenticated',
  SUPABASE_AUTH_ALLOWED_ALGORITHMS: 'ES256',
  DATABASE_URL: 'postgresql://runtime@localhost/chawgee',
} satisfies NodeJS.ProcessEnv;

const start = async (app: express.Express): Promise<Server> => {
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
};

const close = async (server: Server): Promise<void> => {
  server.close();
  await once(server, 'close');
};

const url = (server: Server, path: string): string => {
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}${path}`;
};

test('production runtime configuration validates auth and verified database TLS before listen', () => {
  const runtime = getServerRuntimeConfig(productionEnv);
  assert.equal(runtime.environment, 'production');
  assert.equal(runtime.port, 4000);
  assert.equal(runtime.auth?.audience, 'authenticated');
  assert.deepEqual(runtime.database?.ssl, { rejectUnauthorized: true });
});

test('production runtime configuration fails closed for missing auth or database configuration', () => {
  const { SUPABASE_AUTH_ISSUER: _issuer, ...withoutIssuer } = productionEnv;
  assert.throws(() => getServerRuntimeConfig(withoutIssuer), ConfigurationError);
  const { DATABASE_URL: _databaseUrl, ...withoutDatabase } = productionEnv;
  assert.throws(() => getServerRuntimeConfig(withoutDatabase), ConfigurationError);
  assert.throws(() => getServerRuntimeConfig({
    ...withoutDatabase,
    CHAWGEE_IT_RUNTIME_DATABASE_URL: 'postgresql://integration@localhost/integration',
  }), ConfigurationError);
});

test('environment mode is explicit and production rejects disabled database TLS', () => {
  assert.throws(() => getServerRuntimeConfig({ ...productionEnv, DATABASE_SSL_MODE: 'disable' }), ConfigurationError);
  assert.deepEqual(getServerRuntimeConfig({ NODE_ENV: 'development' }), {
    environment: 'development',
    port: 4000,
  });
  assert.deepEqual(getServerRuntimeConfig({ NODE_ENV: 'test' }), {
    environment: 'test',
    port: 4000,
  });
  assert.throws(() => getServerRuntimeConfig({}), ConfigurationError);
  assert.throws(() => getServerRuntimeConfig({ NODE_ENV: '   ' }), ConfigurationError);
  assert.throws(() => getServerRuntimeConfig({ NODE_ENV: 'prod' }), ConfigurationError);
});

test('normal server startup cannot listen with unset, blank, or invalid NODE_ENV', () => {
  const sourceIndex = new URL('../src/index.ts', import.meta.url);
  for (const nodeEnvironment of [undefined, '', 'prod']) {
    const environment = {
      PATH: process.env.PATH,
      OPENROUTER_API_KEY: 'test-key',
      ...(nodeEnvironment === undefined ? {} : { NODE_ENV: nodeEnvironment }),
    };
    const result = spawnSync(process.execPath, ['--import', 'tsx', sourceIndex.pathname], {
      cwd: mkdtempSync(join(tmpdir(), 'chawgee-startup-')),
      env: environment,
      encoding: 'utf8',
      timeout: 5_000,
    });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /Backend running on port/);
  }
});

test('fresh production start command cleans and rebuilds dist before execution', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    scripts: { build: string; start: string };
  };
  assert.match(packageJson.scripts.build, /rmSync\('dist'/);
  assert.equal(packageJson.scripts.start, 'npm run build && node dist/index.js');
});

test('explicit JSON boundary accepts valid input and safely rejects malformed or oversized input', async () => {
  const app = express();
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.post('/echo', (req, res) => res.json({ success: true, value: req.body.value }));
  app.use(jsonBodyErrorHandler);
  const server = await start(app);
  try {
    const valid = await fetch(url(server, '/echo'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'accepted' }),
    });
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), { success: true, value: 'accepted' });

    const malformed = await fetch(url(server, '/echo'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { success: false, error: 'Invalid request body.' });

    const oversized = await fetch(url(server, '/echo'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(65 * 1024) }),
    });
    assert.equal(oversized.status, 413);
    assert.deepEqual(await oversized.json(), { success: false, error: 'Request body too large.' });
  } finally {
    await close(server);
  }
});

test('safe internal errors and health/readiness responses expose no internals', async () => {
  const app = express();
  app.get('/failure', (_req, res) => sendInternalServerError(res));
  app.get('/health', healthHandler);
  app.get('/ready', createReadinessHandler(async () => false));
  const server = await start(app);
  try {
    const failure = await fetch(url(server, '/failure'));
    assert.equal(failure.status, 500);
    assert.deepEqual(await failure.json(), { success: false, error: 'Internal server error' });

    const health = await fetch(url(server, '/health'));
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { success: true, message: 'Chawgee backend is alive' });

    const ready = await fetch(url(server, '/ready'));
    assert.equal(ready.status, 503);
    assert.deepEqual(await ready.json(), { success: false });
  } finally {
    await close(server);
  }
});

test('briefing and onboarding provider failures keep sensitive content out of responses and logs', async () => {
  const sensitiveMarker = 'provider-error token=secret prompt=user@example.test';
  const failGeneration = async () => { throw new Error(sensitiveMarker); };
  const app = express();
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(createBriefingRouter(failGeneration));
  app.use(createOnboardingRouter(failGeneration));
  const server = await start(app);
  const originalError = console.error;
  const logs: string[] = [];
  console.error = (message?: unknown) => { logs.push(String(message)); };
  try {
    const briefing = await fetch(url(server, '/api/chawgee/briefing'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userContext: { private: sensitiveMarker }, userQuery: sensitiveMarker }),
    });
    assert.equal(briefing.status, 500);
    assert.deepEqual(await briefing.json(), { success: false, error: 'Internal server error' });

    const onboarding = await fetch(url(server, '/api/chawgee/onboarding'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: sensitiveMarker, expectedField: 'primaryGoal', profile: {} }),
    });
    assert.equal(onboarding.status, 500);
    assert.deepEqual(await onboarding.json(), { error: 'Unable to process onboarding response.' });

    const observed = logs.join('\n');
    assert.equal(observed.includes(sensitiveMarker), false);
    assert.deepEqual(logs, ['Chawgee briefing request failed.', 'Chawgee onboarding request failed.']);
  } finally {
    console.error = originalError;
    await close(server);
  }
});