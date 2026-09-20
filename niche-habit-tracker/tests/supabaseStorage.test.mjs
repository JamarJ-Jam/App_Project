import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the actual adapter, transpiling types only. No React Native,
// SecureStore, Supabase client, environment configuration or network is loaded.
const source = readFileSync(new URL('../src/auth/supabaseStorage.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});

const byteLength = (value) => Buffer.byteLength(value, 'utf8');
const syntheticValue = (bytes, unit = 'x') => {
  const unitBytes = byteLength(unit);
  const value = unit.repeat(Math.floor(bytes / unitBytes)) + 'x'.repeat(bytes % unitBytes);
  assert.equal(byteLength(value), bytes);
  return value;
};

function createHarness(failures = {}) {
  const entries = new Map();
  const calls = { read: 0, write: 0, delete: 0 };
  const secureStore = {
    async getItemAsync(key) {
      calls.read += 1;
      if (failures.read) throw failures.read;
      return entries.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      calls.write += 1;
      if (failures.write) throw failures.write;
      entries.set(key, value);
    },
    async deleteItemAsync(key) {
      calls.delete += 1;
      if (failures.delete) throw failures.delete;
      entries.delete(key);
    },
  };
  const exports = {};
  runInNewContext(outputText, {
    exports,
    // Capture neither values nor diagnostics; production logging is untouched.
    console: { log() {} },
    require(specifier) {
      if (specifier === 'react-native') return { Platform: { OS: 'android' } };
      if (specifier === 'expo-secure-store') return secureStore;
      throw new Error('Unexpected dependency in isolated storage test');
    },
  });
  return { storage: exports.supabaseStorage, calls, entries };
}

// Boolean comparisons keep payloads out of assertion failure output.
async function assertRoundTrip(bytes, unit = 'x') {
  const { storage, calls, entries } = createHarness();
  const value = syntheticValue(bytes, unit);
  await storage.setItem('synthetic-a', value);
  assert.ok((await storage.getItem('synthetic-a')) === value, 'exact string round trip');
  assert.equal(calls.write, 1, 'one native write per logical value');
  assert.equal(entries.size, 1, 'one physical entry per logical value');
  assert.ok(entries.get('synthetic-a') === value, 'complete unmodified value at native boundary');
}

for (const bytes of [2047, 2048, 2049]) {
  test(`PRODUCTION-CONTRACT (mocked SecureStore): accepts ${bytes} UTF-8 bytes`, async () => {
    await assertRoundTrip(bytes);
  });
}

test('PRODUCTION-CONTRACT (mocked SecureStore): empty string remains distinct from missing data', async () => {
  await assertRoundTrip(0);
});

test('PRODUCTION-CONTRACT (mocked SecureStore): multibyte text round trips across the former byte boundary', async () => {
  for (const unit of ['é', '界', '😀']) {
    for (const bytes of [2047, 2048, 2049]) await assertRoundTrip(bytes, unit);
  }
});

test('PRODUCTION-CONTRACT (mocked SecureStore): missing key returns null', async () => {
  const { storage, calls } = createHarness();
  assert.equal(await storage.getItem('synthetic-missing'), null);
  assert.equal(calls.read, 1);
});

test('PRODUCTION-CONTRACT (mocked SecureStore): overwrite replaces the complete logical value', async () => {
  const { storage, entries } = createHarness();
  await storage.setItem('synthetic-a', syntheticValue(2048));
  const replacement = syntheticValue(17, 'é');
  await storage.setItem('synthetic-a', replacement);
  assert.ok((await storage.getItem('synthetic-a')) === replacement, 'replacement round trip');
  assert.equal(entries.size, 1);
});

test('PRODUCTION-CONTRACT (mocked SecureStore): larger overwrite replaces the previous value', async () => {
  const { storage, calls, entries } = createHarness();
  await storage.setItem('synthetic-a', syntheticValue(12));
  const replacement = syntheticValue(64 * 1024, '😀');
  await storage.setItem('synthetic-a', replacement);
  assert.ok((await storage.getItem('synthetic-a')) === replacement, 'complete larger replacement');
  assert.equal(calls.write, 2);
  assert.equal(entries.size, 1);
});

test('PRODUCTION-CONTRACT (mocked SecureStore): remove deletes the logical value', async () => {
  const { storage, calls, entries } = createHarness();
  await storage.setItem('synthetic-a', syntheticValue(10));
  await storage.removeItem('synthetic-a');
  assert.equal(await storage.getItem('synthetic-a'), null);
  assert.equal(entries.size, 0);
  assert.equal(calls.delete, 1);
});

test('PRODUCTION-CONTRACT (mocked SecureStore): repeated removal succeeds for an absent value', async () => {
  const { storage, calls } = createHarness();
  await storage.removeItem('synthetic-a');
  await storage.removeItem('synthetic-a');
  assert.equal(await storage.getItem('synthetic-a'), null);
  assert.equal(calls.delete, 2);
});

test('PRODUCTION-CONTRACT (mocked SecureStore): logical keys remain independent across writes and removal', async () => {
  const { storage } = createHarness();
  const second = syntheticValue(23, '界');
  await storage.setItem('synthetic-a', syntheticValue(10));
  await storage.setItem('synthetic-b', second);
  await storage.setItem('synthetic-a', syntheticValue(15));
  assert.ok((await storage.getItem('synthetic-b')) === second, 'independent overwrite');
  await storage.removeItem('synthetic-a');
  assert.ok((await storage.getItem('synthetic-b')) === second, 'independent removal');
});

for (const operation of ['write', 'read', 'delete']) {
  test(`PRODUCTION-CONTRACT (mocked SecureStore): native ${operation} rejection propagates unchanged`, async () => {
    const failure = new Error('Synthetic storage failure');
    const failures = {};
    const { storage, calls } = createHarness(failures);
    const original = syntheticValue(10);
    await storage.setItem('synthetic-a', original);
    failures[operation] = failure;
    const invoke = {
      write: () => storage.setItem('synthetic-a', syntheticValue(64 * 1024)),
      read: () => storage.getItem('synthetic-a'),
      delete: () => storage.removeItem('synthetic-a'),
    };
    const before = calls[operation];
    await assert.rejects(invoke[operation], (error) => error === failure);
    assert.equal(calls[operation], before + 1, 'failure is not silently retried');
    delete failures[operation];
    assert.ok((await storage.getItem('synthetic-a')) === original, 'failure preserves existing data');
  });
}

// These synthetic tests exercise the real adapter through mocked SecureStore.
// Passing does NOT establish native device size limits or disk durability.
// Keep separate Android/iOS device validation as a release gate.
for (const kib of [4, 8, 16, 32, 64]) {
  test(`PRODUCTION-CONTRACT (mocked SecureStore): ${kib} KiB exact single-entry round trip`, async () => {
    await assertRoundTrip(kib * 1024);
    await assertRoundTrip(kib * 1024, '😀');
  });
}
