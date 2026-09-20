import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

/**
 * Crypto Foundation Tests
 *
 * Tests the public API of the crypto foundation:
 * - initializeCryptoFoundation()
 * - isCryptoReady()
 * - getCryptoReadinessStatus()
 */

const sourceNative = readFileSync(new URL('../src/auth/cryptoFoundation.native.ts', import.meta.url), 'utf8');
const sourceWeb = readFileSync(new URL('../src/auth/cryptoFoundation.ts', import.meta.url), 'utf8');

/**
 * Create a test harness for the native crypto foundation
 */
function createNativeHarness(options = {}) {
  const {
    randomFails = false,
    digestFails = false,
    missingTextEncoder = false,
    missingBtoa = false,
  } = options;

  const { outputText } = ts.transpileModule(sourceNative, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });

  const logs = [];
  const calls = { random: 0, digest: 0 };

  const globals = {
    __DEV__: true,
    console: { error: (...args) => logs.push(['error', ...args]) },
    TextEncoder,
    btoa,
    ArrayBuffer,
    DOMException,
    calls,
    digestFails,
    hostWebcrypto: webcrypto,
  };

  if (missingTextEncoder) {
    delete globals.TextEncoder;
  }
  if (missingBtoa) {
    delete globals.btoa;
  }

  const context = createContext(globals);
  runInContext(`
    globalThis.expoCryptoMock = {
      __esModule: true, // Match actual Expo exports: no default export.
      CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
      getRandomValues(array) {
        calls.random++;
        if (${randomFails}) throw new Error('expo-crypto.getRandomValues failed');
        array.fill(7);
        return array;
      },
      async digest(algorithm, data) {
        calls.digest++;
        if (digestFails) throw new Error('expo-crypto.digest failed');
        return hostWebcrypto.subtle.digest(algorithm, data);
      },
    };
    globalThis.require = (specifier) => {
      if (specifier === 'expo-crypto') return globalThis.expoCryptoMock;
      throw new Error('Unexpected require: ' + specifier);
    };
  `, context);

  const exports = {};
  context.exports = exports;
  runInContext(outputText, context);

  return {
    exports,
    logs,
    calls,
    context,
  };
}

/**
 * Create a test harness for the web crypto foundation
 */
function createWebHarness(options = {}) {
  const { digestFails = false, missingDigest = false } = options;

  const { outputText } = ts.transpileModule(sourceWeb, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });

  const logs = [];

  const globals = {
    __DEV__: true,
    TextEncoder,
    btoa,
    ArrayBuffer,
    DOMException,
    digestFails,
    missingDigest,
    hostWebcrypto: webcrypto,
    console: { error: (...args) => logs.push(['error', ...args]) },
  };

  const context = createContext(globals);
  runInContext(`
    globalThis.crypto = missingDigest ? undefined : {
      subtle: {
        async digest(algorithm, data) {
          if (digestFails) throw new Error('crypto.subtle.digest failed');
          return hostWebcrypto.subtle.digest(algorithm, data);
        },
      },
      getRandomValues(array) {
        hostWebcrypto.getRandomValues(array);
        return array;
      },
    };
  `, context);

  const exports = {};
  context.exports = exports;
  runInContext(outputText, context);

  return { exports, logs };
}

// ==== NATIVE CRYPTO FOUNDATION TESTS ====

test('native: initializeCryptoFoundation succeeds when crypto available', async () => {
  const harness = createNativeHarness();

  await harness.exports.initializeCryptoFoundation();
  assert.equal(harness.exports.isCryptoReady(), true);
  assert.equal(harness.calls.random, 1, 'Should test random');
  assert.equal(harness.calls.digest, 1, 'Should test digest');
});

test('native: getCryptoReadinessStatus returns ready after initialization', async () => {
  const harness = createNativeHarness();

  await harness.exports.initializeCryptoFoundation();
  const status = await harness.exports.getCryptoReadinessStatus();
  assert.equal(status.ready, true);
  assert.equal(status.randomAvailable, true);
  assert.equal(status.digestAvailable, true);
});

test('native: initializeCryptoFoundation fails if random unavailable', async () => {
  const harness = createNativeHarness({ randomFails: true });

  await assert.rejects(() => harness.exports.initializeCryptoFoundation());
  assert.equal(harness.exports.isCryptoReady(), false);
});

test('native: initializeCryptoFoundation fails if digest unavailable', async () => {
  const harness = createNativeHarness({ digestFails: true });

  await assert.rejects(() => harness.exports.initializeCryptoFoundation());
  assert.equal(harness.exports.isCryptoReady(), false);
});

test('native: initializeCryptoFoundation fails if TextEncoder missing', async () => {
  const harness = createNativeHarness({ missingTextEncoder: true });

  await assert.rejects(() => harness.exports.initializeCryptoFoundation());
});

test('native: initializeCryptoFoundation fails if btoa missing', async () => {
  const harness = createNativeHarness({ missingBtoa: true });

  await assert.rejects(() => harness.exports.initializeCryptoFoundation());
});

test('native: isCryptoReady is false initially', async () => {
  const harness = createNativeHarness();

  assert.equal(harness.exports.isCryptoReady(), false);
});

test('native: concurrent readiness calls share initialization', async () => {
  const harness = createNativeHarness();

  const [result1, result2, result3] = await Promise.all([
    harness.exports.initializeCryptoFoundation(),
    harness.exports.initializeCryptoFoundation(),
    harness.exports.initializeCryptoFoundation(),
  ]);

  assert.equal(result1, undefined);
  assert.equal(result2, undefined);
  assert.equal(result3, undefined);

  // Should only have called functions once despite concurrent calls
  assert.equal(harness.calls.random, 1);
  assert.equal(harness.calls.digest, 1);
});

test('native: repeated initialization after success returns immediately', async () => {
  const harness = createNativeHarness();

  await harness.exports.initializeCryptoFoundation();
  const firstCallCount = harness.calls.random;

  await harness.exports.initializeCryptoFoundation();
  assert.equal(harness.calls.random, firstCallCount, 'Should not re-initialize');
});

test('native: getCryptoReadinessStatus validates and reports readiness', async () => {
  const harness = createNativeHarness();

  const status = await harness.exports.getCryptoReadinessStatus();
  assert.equal(status.ready, true);
  assert.equal(harness.exports.isCryptoReady(), true);
});

test('native: getCryptoReadinessStatus returns not ready if init fails', async () => {
  const harness = createNativeHarness({ randomFails: true });

  await assert.rejects(() => harness.exports.initializeCryptoFoundation());
  const status = await harness.exports.getCryptoReadinessStatus();
  assert.equal(status.ready, false);
});

// ==== WEB CRYPTO FOUNDATION TESTS ====

test('web: initializeCryptoFoundation validates browser WebCrypto', async () => {
  const harness = createWebHarness();

  await harness.exports.initializeCryptoFoundation();
  assert.equal(harness.exports.isCryptoReady(), true);
});

test('web: initializeCryptoFoundation fails if WebCrypto unavailable', async () => {
  const harness = createWebHarness({ missingDigest: true });

  await assert.rejects(() => harness.exports.initializeCryptoFoundation());
  assert.equal(harness.exports.isCryptoReady(), false);
});

test('web: isCryptoReady reflects readiness state', async () => {
  const harness = createWebHarness();

  assert.equal(harness.exports.isCryptoReady(), false);
  await harness.exports.initializeCryptoFoundation();
  assert.equal(harness.exports.isCryptoReady(), true);
});

test('web: concurrent readiness calls share initialization', async () => {
  const harness = createWebHarness();

  const [result1, result2, result3] = await Promise.all([
    harness.exports.initializeCryptoFoundation(),
    harness.exports.initializeCryptoFoundation(),
    harness.exports.initializeCryptoFoundation(),
  ]);

  assert.equal(result1, undefined);
  assert.equal(result2, undefined);
  assert.equal(result3, undefined);
});

// Pre-build regressions: exercise installed export shape and actual globals.
test('native: readiness installs the interface used by Supabase before reporting true', async () => {
  const h = createNativeHarness();
  const status = await h.exports.getCryptoReadinessStatus();
  assert.equal(status.ready, true);
  assert.equal(runInContext('typeof crypto.getRandomValues', h.context), 'function');
  assert.equal(runInContext('typeof crypto.subtle.digest', h.context), 'function');
  assert.deepEqual(h.logs, []);
});

test('native: failed global installation cannot report ready', async () => {
  const h = createNativeHarness();
  runInContext("Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: false })", h.context);
  await assert.rejects(h.exports.initializeCryptoFoundation());
  assert.equal(h.exports.isCryptoReady(), false);
  assert.equal((await h.exports.getCryptoReadinessStatus()).ready, false);
  assert.deepEqual(h.logs, []);
});

test('native: unknown existing provider is preserved but never trusted by shape alone', async () => {
  const h = createNativeHarness();
  runInContext('globalThis.originalCrypto = { getRandomValues: a => a, subtle: { digest: async () => new ArrayBuffer(32) } }; globalThis.crypto = originalCrypto;', h.context);
  await assert.rejects(h.exports.initializeCryptoFoundation());
  assert.equal(runInContext('crypto === originalCrypto', h.context), true);
  assert.equal(h.exports.isCryptoReady(), false);
});

test('native: changing validated globals invalidates readiness', async () => {
  const h = createNativeHarness();
  await h.exports.initializeCryptoFoundation();
  runInContext("Object.defineProperty(crypto, 'getRandomValues', { value: a => a, configurable: true })", h.context);
  assert.equal(h.exports.isCryptoReady(), false);
  await assert.rejects(h.exports.initializeCryptoFoundation());
  assert.equal((await h.exports.getCryptoReadinessStatus()).ready, false);
});

test('native: exact Uint32Array view is filled without Math.random', async () => {
  const h = createNativeHarness();
  runInContext("Math.random = () => { throw new Error('Forbidden fallback'); };", h.context);
  await h.exports.initializeCryptoFoundation();
  assert.equal(runInContext(`(() => {
    const backing = new Uint32Array(58);
    const view = backing.subarray(1, 57);
    return crypto.getRandomValues(view) === view && backing[0] === 0 &&
      backing[57] === 0 && view.every(v => v === 7);
  })()`, h.context), true);
});

