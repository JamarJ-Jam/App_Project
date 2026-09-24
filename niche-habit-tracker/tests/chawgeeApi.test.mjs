import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const configSource = readFileSync(new URL('../src/config/index.ts', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../src/services/chawgeeApi.ts', import.meta.url), 'utf8');
const configOutput = ts.transpileModule(configSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const apiOutput = ts.transpileModule(apiSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const loadConfig = (apiBaseUrl, isDevelopment) => {
  const exports = {};
  runInNewContext(configOutput, {
    exports,
    process: { env: apiBaseUrl === undefined ? {} : { EXPO_PUBLIC_CHAWGEE_API_BASE_URL: apiBaseUrl } },
    __DEV__: isDevelopment,
    URL,
  });
  return exports;
};

const response = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

const loadApi = ({ apiBaseUrl = 'https://api.example.test', assertTransport, fetchImpl, timers = [] }) => {
  const exports = {};
  runInNewContext(apiOutput, {
    exports,
    require(name) {
      if (name.endsWith('/config')) {
        return {
          appConfig: { apiBaseUrl },
          assertChawgeeApiTransport: assertTransport ?? (() => {}),
        };
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
    fetch: fetchImpl,
    AbortController,
    setTimeout(callback) { timers.push(callback); return callback; },
    clearTimeout() {},
  });
  return exports;
};

const account = { success: true, account: { id: 'account-id', status: 'active' } };

test('release HTTPS backend URL is accepted', () => {
  const config = loadConfig('https://api.example.test/', false);
  assert.equal(config.appConfig.apiBaseUrl, 'https://api.example.test');
});

test('release HTTP backend URL fails closed', () => {
  assert.throws(() => loadConfig('http://api.example.test', false), /HTTPS URL outside development/);
});

test('insecure authenticated release transport fails before fetch', async () => {
  const config = loadConfig('https://api.example.test', false);
  let fetchCalls = 0;
  const api = loadApi({
    apiBaseUrl: 'http://api.example.test',
    assertTransport: (value) => config.validateChawgeeApiBaseUrl(value, false),
    fetchImpl: async () => { fetchCalls += 1; return response(200, account); },
  });
  await assert.rejects(api.bootstrapChawgeeAccount('access-token'), /Unable to initialize/);
  assert.equal(fetchCalls, 0);
});

for (const [name, value] of [
  ['localhost', 'http://localhost:4000'],
  ['emulator address', 'http://10.0.2.2:4000'],
  ['LAN IPv4 address', 'http://192.168.1.10:4000'],
  ['HTTPS URL', 'https://api.example.test'],
]) {
  test(`development ${name} is accepted`, () => {
    const config = loadConfig(value, true);
    assert.equal(config.appConfig.apiBaseUrl, value);
  });
}

for (const [name, value] of [
  ['missing value', undefined],
  ['malformed URL', 'not a url'],
  ['embedded credentials', 'https://user:password@api.example.test'],
  ['query string', 'https://api.example.test?token=value'],
  ['fragment', 'https://api.example.test#fragment'],
  ['unsupported scheme', 'ftp://api.example.test'],
]) {
  test(`release ${name} is rejected`, () => {
    assert.throws(() => loadConfig(value, false));
  });
}

test('bootstrap succeeds before its timeout', async () => {
  const timers = [];
  let options;
  const api = loadApi({
    timers,
    fetchImpl: async (_url, requestOptions) => { options = requestOptions; return response(200, account); },
  });
  assert.deepEqual(await api.bootstrapChawgeeAccount('access-token'), account.account);
  assert.equal(options.headers.Authorization, 'Bearer access-token');
  assert.equal(options.signal.aborted, false);
  assert.equal(timers.length, 1);
});

for (const [name, status, message] of [
  ['401', 401, 'authentication session is no longer valid'],
  ['403', 403, 'account is currently restricted'],
  ['5xx', 500, 'Unable to initialize'],
]) {
  test(`bootstrap preserves ${name} status semantics`, async () => {
    const api = loadApi({ fetchImpl: async () => response(status, {}) });
    await assert.rejects(api.bootstrapChawgeeAccount('access-token'), new RegExp(message));
  });
}

test('bootstrap rejects malformed successful responses', async () => {
  const api = loadApi({ fetchImpl: async () => response(200, { success: true, account: {} }) });
  await assert.rejects(api.bootstrapChawgeeAccount('access-token'), /Unable to initialize/);
});

test('bootstrap normalizes network rejection', async () => {
  const api = loadApi({ fetchImpl: async () => { throw new Error('network unavailable'); } });
  await assert.rejects(api.bootstrapChawgeeAccount('access-token'), /Unable to initialize/);
});

test('bootstrap times out and aborts its request', async () => {
  const timers = [];
  let requestSignal;
  const api = loadApi({
    timers,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      requestSignal = options.signal;
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }),
  });
  const pending = api.bootstrapChawgeeAccount('access-token');
  timers[0]();
  await assert.rejects(pending, /Unable to initialize/);
  assert.equal(requestSignal.aborted, true);
});

test('already-aborted external signal prevents bootstrap startup', async () => {
  const external = new AbortController();
  external.abort();
  let fetchCalls = 0;
  const api = loadApi({ fetchImpl: async () => { fetchCalls += 1; return response(200, account); } });
  await assert.rejects(api.bootstrapChawgeeAccount('access-token', external.signal), /Unable to initialize/);
  assert.equal(fetchCalls, 0);
});

test('external cancellation aborts a pending bootstrap', async () => {
  const external = new AbortController();
  let requestSignal;
  const api = loadApi({
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      requestSignal = options.signal;
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }),
  });
  const pending = api.bootstrapChawgeeAccount('access-token', external.signal);
  external.abort();
  await assert.rejects(pending, /Unable to initialize/);
  assert.equal(requestSignal.aborted, true);
});

test('late response after external cancellation cannot become success', async () => {
  const external = new AbortController();
  let resolveFetch;
  const api = loadApi({
    fetchImpl: async () => new Promise((resolve) => { resolveFetch = resolve; }),
  });
  const pending = api.bootstrapChawgeeAccount('access-token', external.signal);
  external.abort();
  resolveFetch(response(200, account));
  await assert.rejects(pending, /Unable to initialize/);
});

test('bootstrap may retry after timeout and network failure', async () => {
  const timers = [];
  let calls = 0;
  const api = loadApi({
    timers,
    fetchImpl: async (_url, options) => {
      calls += 1;
      if (calls === 1) {
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
      }
      if (calls === 2) throw new Error('network unavailable');
      return response(200, account);
    },
  });
  const timedOut = api.bootstrapChawgeeAccount('access-token');
  timers[0]();
  await assert.rejects(timedOut, /Unable to initialize/);
  await assert.rejects(api.bootstrapChawgeeAccount('access-token'), /Unable to initialize/);
  assert.deepEqual(await api.bootstrapChawgeeAccount('access-token'), account.account);
});