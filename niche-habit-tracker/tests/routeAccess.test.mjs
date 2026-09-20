import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyRoute, resolveRouteAccess } from '../src/auth/routeAccess.ts';

const decision = (state, route) => resolveRouteAccess(state, route);

test('loading holds every route to prevent protected content flashing', () => {
  assert.deepEqual(decision('loading', 'protected'), { type: 'hold' });
});

test('unauthenticated users can access public/onboarding but not protected routes', () => {
  assert.deepEqual(decision('unauthenticated', 'public'), { type: 'allow' });
  assert.deepEqual(decision('unauthenticated', 'onboarding'), { type: 'allow' });
  assert.deepEqual(decision('unauthenticated', 'protected'), { type: 'redirect', href: '/(tabs)' });
});

test('verification-required and bootstrap-failed states cannot access application routes', () => {
  for (const state of ['verification_required', 'bootstrap_failed']) {
    assert.deepEqual(decision(state, 'public'), { type: 'allow' });
    assert.deepEqual(decision(state, 'onboarding'), { type: 'redirect', href: '/auth/login' });
    assert.deepEqual(decision(state, 'protected'), { type: 'redirect', href: '/auth/login' });
  }
});

test('authenticated users can access onboarding and protected routes, but not public entry', () => {
  assert.deepEqual(decision('authenticated', 'protected'), { type: 'allow' });
  assert.deepEqual(decision('authenticated', 'onboarding'), { type: 'allow' });
  assert.deepEqual(decision('authenticated', 'public'), { type: 'redirect', href: '/(tabs)/dashboard' });
});

test('guest users retain local application access', () => {
  assert.deepEqual(decision('guest', 'protected'), { type: 'allow' });
  assert.deepEqual(decision('guest', 'onboarding'), { type: 'allow' });
  assert.deepEqual(decision('guest', 'public'), { type: 'redirect', href: '/(tabs)/dashboard' });
});

test('logout is represented by the unauthenticated policy', () => {
  assert.deepEqual(decision('unauthenticated', 'protected'), { type: 'redirect', href: '/(tabs)' });
});

test('route classification keeps public, onboarding, and protected groups distinct', () => {
  assert.equal(classifyRoute(['auth', 'login']), 'public');
  assert.equal(classifyRoute(['auth', 'signup']), 'public');
  assert.equal(classifyRoute(['auth', 'onboarding']), 'onboarding');
  assert.equal(classifyRoute(['(tabs)', 'index']), 'public');
  assert.equal(classifyRoute(['(tabs)']), 'public');
  assert.equal(classifyRoute(['(tabs)', 'dashboard']), 'protected');
  assert.equal(classifyRoute(['(tabs)', 'fitness']), 'protected');
  assert.equal(classifyRoute(['(tabs)', 'nutrition']), 'protected');
  assert.equal(classifyRoute(['(tabs)', 'efficiency']), 'protected');
  assert.equal(classifyRoute(['(tabs)', 'account']), 'protected');
});

test('unauthenticated canonical tabs index is allowed without self-redirect', () => {
  assert.deepEqual(resolveRouteAccess('unauthenticated', classifyRoute(['(tabs)'])), {
    type: 'allow',
  });
});

test('policy does not accept identity values as authorization inputs', () => {
  assert.deepEqual(decision('unauthenticated', 'protected'), { type: 'redirect', href: '/(tabs)' });
  assert.deepEqual(decision('verification_required', 'protected'), { type: 'redirect', href: '/auth/login' });
});