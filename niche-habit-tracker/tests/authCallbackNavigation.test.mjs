import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as routeAccess from '../src/auth/routeAccess.ts';

// Execute the actual guard and its effect with controlled hook inputs. The
// production route policy runs unchanged; no native modules or network load.
const source = readFileSync(new URL('../components/AuthRouteGuard.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
});
function guardHarness() {
  const input = {
    authState: 'verification_required',
    callback: { status: 'processing' },
    segments: ['auth', 'callback'],
    pathname: '/auth/callback',
  };
  const replacements = [];
  const redirectRef = { current: null };
  let effect;
  const exports = {};
  const react = {
    createElement: () => null,
    useRef: () => redirectRef,
    useEffect: (next) => { effect = next; },
  };
  runInNewContext(outputText, {
    exports,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react-native') return {
        ActivityIndicator: 'ActivityIndicator', View: 'View',
        StyleSheet: { absoluteFill: {}, create: (styles) => styles },
      };
      if (name === 'expo-router') return {
        useRouter: () => ({ replace: (href) => replacements.push(href) }),
        useSegments: () => input.segments,
        usePathname: () => input.pathname,
      };
      if (name.endsWith('/AuthContext')) return { useAuth: () => input };
      if (name.endsWith('/AuthCallbackHandoffContext')) return { useAuthCallbackHandoff: () => input.callback };
      if (name.endsWith('/routeAccess')) return routeAccess;
      throw new Error('Unexpected guard dependency');
    },
  });
  return { input, replacements, render() { exports.default(); effect(); } };
}

test('guard replaces exactly once after both success conditions, with no destination loop', () => {
  const h = guardHarness();
  h.render();
  h.input.authState = 'authenticated';
  h.render(); // Reconciliation result is not yet complete.
  assert.deepEqual(h.replacements, []);
  h.input.callback = { status: 'complete', result: { status: 'authenticated' } };
  h.render();
  h.render(); // Re-render / effect replay before navigation commits.
  assert.deepEqual(h.replacements, ['/(tabs)/dashboard']);
  h.input.pathname = '/dashboard';
  h.input.segments = ['(tabs)', 'dashboard'];
  h.render();
  h.render();
  assert.deepEqual(h.replacements, ['/(tabs)/dashboard']);
});

test('successful result arriving before authoritative auth state waits', () => {
  const h = guardHarness();
  h.input.callback = { status: 'complete', result: { status: 'authenticated' } };
  h.render();
  assert.deepEqual(h.replacements, []);
  h.input.authState = 'authenticated';
  h.render();
  h.render();
  assert.deepEqual(h.replacements, ['/(tabs)/dashboard']);
});

test('guard leaves failed, restricted, conflicting, stale, and replayed results visible', () => {
  const h = guardHarness();
  for (const authState of ['authenticated', 'bootstrap_failed', 'verification_required']) {
    h.input.authState = authState;
    for (const result of [
      { status: 'verification_required' }, { status: 'replayed', reason: 'replayed' },
      ...['invalid_callback', 'verification_failed', 'stale_operation', 'bootstrap_failed',
        'device_verifier_missing', 'conflicting_identity', 'recovery_not_supported']
        .map((reason) => ({ status: 'failed', reason })),
    ]) {
      h.input.callback = { status: 'complete', result };
      h.render();
      h.render();
    }
  }
  assert.deepEqual(h.replacements, []);
});

test('recovery guard replaces once only after both success conditions and has no destination loop', () => {
  const h = guardHarness();
  h.input.authState = 'recovery_processing';
  h.render();
  h.input.authState = 'recovery';
  h.render();
  assert.deepEqual(h.replacements, []);
  h.input.callback = { status: 'complete', result: { status: 'recovery' } };
  h.render(); h.render();
  assert.deepEqual(h.replacements, ['/auth/reset-password']);
  h.input.pathname = '/auth/reset-password';
  h.input.segments = ['auth', 'reset-password'];
  h.render(); h.render();
  assert.deepEqual(h.replacements, ['/auth/reset-password']);
});

test('stale recovery success cannot redirect logout, guest or a newer login to reset', () => {
  for (const state of ['unauthenticated', 'guest', 'authenticated', 'recovery_interrupted']) {
    const h = guardHarness();
    h.input.callback = { status: 'complete', result: { status: 'recovery' } };
    h.input.authState = state;
    h.render(); h.render();
    assert.deepEqual(h.replacements, []);
    if (state === 'authenticated' || state === 'guest') {
      h.input.pathname = '/dashboard';
      h.input.segments = ['(tabs)', 'dashboard'];
      h.render();
      assert.deepEqual(h.replacements, []);
    }
  }
});

test('direct reset route is denied by the actual guard outside recovery', () => {
  for (const [state, target] of [
    ['unauthenticated', '/auth/login'], ['verification_required', '/auth/login'],
    ['bootstrap_failed', '/auth/login'], ['recovery_interrupted', '/auth/login'],
    ['guest', '/(tabs)/dashboard'], ['authenticated', '/(tabs)/dashboard'],
  ]) {
    const h = guardHarness();
    h.input.authState = state;
    h.input.pathname = '/auth/reset-password';
    h.input.segments = ['auth', 'reset-password'];
    h.render(); h.render();
    assert.deepEqual(h.replacements, [target]);
  }
});
