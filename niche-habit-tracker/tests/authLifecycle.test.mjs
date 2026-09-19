import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuthLifecycleCoordinator } from '../src/auth/authLifecycle.ts';

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