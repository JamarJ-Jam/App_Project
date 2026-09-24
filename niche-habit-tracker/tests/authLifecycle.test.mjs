import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADMISSION_RECEIPT_KEY, AuthLifecycleCoordinator } from '../src/auth/authLifecycle.ts';

const receiptStorage = (items = new Map()) => ({
  getItem: async (key) => items.get(key) ?? null,
  setItem: async (key, value) => { items.set(key, value); },
  removeItem: async (key) => { items.delete(key); },
});

test('current generation may commit', () => {
  const lifecycle = new AuthLifecycleCoordinator();
  const generation = lifecycle.beginSession('user-a', 'token-a');
  assert.equal(lifecycle.isCurrent(generation, 'user-a', 'token-a'), true);
});

test('logout invalidates a pending bootstrap success', () => {
  const lifecycle = new AuthLifecycleCoordinator();
  const generation = lifecycle.beginSession('user-a', 'token-a');
  lifecycle.invalidate();
  assert.equal(lifecycle.isCurrent(generation, 'user-a', 'token-a'), false);
});

test('logout invalidates a pending bootstrap failure', () => {
  const lifecycle = new AuthLifecycleCoordinator();
  const generation = lifecycle.beginSession('user-a', 'token-a');
  lifecycle.invalidate();
  assert.equal(lifecycle.isCurrent(generation, 'user-a', 'token-a'), false);
});

test('a newer account cannot be overwritten by an older success or failure', () => {
  const lifecycle = new AuthLifecycleCoordinator();
  const accountAGeneration = lifecycle.beginSession('user-a', 'token-a');
  const accountBGeneration = lifecycle.beginSession('user-b', 'token-b');
  assert.equal(lifecycle.isCurrent(accountAGeneration, 'user-a', 'token-a'), false);
  assert.equal(lifecycle.isCurrent(accountBGeneration, 'user-b', 'token-b'), true);
});

test('guest transition invalidates a pending authenticated bootstrap', () => {
  const lifecycle = new AuthLifecycleCoordinator();
  const generation = lifecycle.beginSession('user-a', 'token-a');
  lifecycle.invalidate();
  assert.equal(lifecycle.isCurrent(generation, 'user-a', 'token-a'), false);
});

test('refreshing a token for the same identity invalidates older token work', () => {
  const lifecycle = new AuthLifecycleCoordinator();
  const oldGeneration = lifecycle.beginSession('user-a', 'token-a');
  const refreshedGeneration = lifecycle.beginSession('user-a', 'token-b');
  assert.notEqual(refreshedGeneration, oldGeneration);
  assert.equal(lifecycle.isCurrent(oldGeneration, 'user-a', 'token-a'), false);
  assert.equal(lifecycle.isCurrent(refreshedGeneration, 'user-a', 'token-b'), true);
});

test('same-token reconciliation keeps the same generation for deduplication', () => {
  const lifecycle = new AuthLifecycleCoordinator();
  const firstGeneration = lifecycle.beginSession('user-a', 'token-a');
  const secondGeneration = lifecycle.beginSession('user-a', 'token-a');
  assert.equal(secondGeneration, firstGeneration);
});

test('admission receipt authorizes only its exact subject and malformed receipts fail closed', async () => {
  const items = new Map([[ADMISSION_RECEIPT_KEY, '{"version":1,"subject":"user-a"}']]);
  const restored = new AuthLifecycleCoordinator(receiptStorage(items));
  await restored.checkInterruption();
  assert.equal(restored.hasAdmissionReceipt('user-a'), true);
  assert.equal(restored.hasAdmissionReceipt('user-b'), false);

  const malformed = new AuthLifecycleCoordinator(receiptStorage(new Map([[ADMISSION_RECEIPT_KEY, '{not-json}']])));
  await malformed.checkInterruption();
  assert.equal(malformed.hasAdmissionReceipt('user-a'), false);

  const unsupported = new AuthLifecycleCoordinator(receiptStorage(new Map([[ADMISSION_RECEIPT_KEY, '{"version":2,"subject":"user-a"}']])));
  await unsupported.checkInterruption();
  assert.equal(unsupported.hasAdmissionReceipt('user-a'), false);
});

test('admission receipts are written by the current operation and cleared on sign-out', async () => {
  const items = new Map();
  const lifecycle = new AuthLifecycleCoordinator(receiptStorage(items));
  await lifecycle.runExclusive(async () => {
    await lifecycle.checkInterruption();
    const owner = lifecycle.nextOperation();
    await lifecycle.beginAdmission(owner);
    await lifecycle.recordAdmission(owner, 'user-a');
  });
  assert.equal(items.get(ADMISSION_RECEIPT_KEY), '{"version":1,"subject":"user-a"}');
  assert.equal(lifecycle.hasAdmissionReceipt('user-a'), true);
  await lifecycle.clearAdmissionReceipt();
  assert.equal(items.has(ADMISSION_RECEIPT_KEY), false);
  assert.equal(lifecycle.hasAdmissionReceipt('user-a'), false);
});

test('admission-cleanup interruption retries receipt and SDK cleanup before release', async () => {
  const items = new Map();
  const lifecycle = new AuthLifecycleCoordinator(receiptStorage(items));
  await lifecycle.runExclusive(async () => {
    await lifecycle.checkInterruption();
    await lifecycle.interruptSession(true);
  });
  let receiptCleanupCalls = 0;
  let sdkCleanupCalls = 0;
  await lifecycle.runExclusive(async () => {
    await lifecycle.resolveInterruption(
      async () => { sdkCleanupCalls += 1; },
      async () => { receiptCleanupCalls += 1; },
    );
  });
  assert.equal(receiptCleanupCalls, 1);
  assert.equal(sdkCleanupCalls, 1);
  assert.equal(items.has('chawgee.auth.callback-interruption.v1'), false);
});