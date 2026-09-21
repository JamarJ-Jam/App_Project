import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as lifecycleModule from '../src/auth/authLifecycle.ts';
import * as callbackModule from '../src/auth/authCallbackCoordinator.ts';
import * as redirectModule from '../src/auth/authRedirect.ts';
import * as providerModule from '../src/auth/authProviderIdentity.ts';
import { resolveRouteAccess } from '../src/auth/routeAccess.ts';

const { RECOVERY_INTERRUPTION_KEY: markerKey, RECOVERY_INTERRUPTION_VALUE: markerValue } = lifecycleModule;
const url = (code = 'synthetic-code') => `${redirectModule.AUTH_CALLBACK_URI}?code=${code}`;
const session = (id = 'recovery', token = `${id}-synthetic-token`) => ({
  user: {
    id, email: `${id}@example.test`, email_confirmed_at: '2026-01-01', user_metadata: {},
    app_metadata: { provider: 'email', providers: ['email'] },
    identities: [{ id, identity_id: `${id}-identity`, user_id: id, provider: 'email' }],
  },
  access_token: token,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise((done) => setImmediate(done)); };
const source = readFileSync(new URL('../src/context/AuthContext.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
});

// Run the ACTUAL provider, lifecycle and callback coordinator. Hooks are controlled
// as in authCallbackNavigation; SDK mocks persist BEFORE emitting awaited events.
// Shared persistence can be handed to a new provider to model process termination.
function harness(options = {}) {
  const disk = options.disk ?? { metadata: new Map(), sdkSession: null, app: new Map() };
  const failures = options.failures ?? {};
  const calls = { bootstrap: [], exchange: 0, exchangeOptions: [], googleStart: 0, oauthOptions: [], browser: [], login: 0, signOut: [], writes: [], states: [], updateUser: [] };
  const listeners = new Set();
  const storage = {
    async getItem(key) { if (failures.read) throw new Error('synthetic storage failure'); return disk.metadata.get(key) ?? null; },
    async setItem(key, value) {
      if (failures.write) throw new Error('synthetic storage failure');
      calls.writes.push([key, value]); disk.metadata.set(key, value);
    },
    async removeItem(key) { if (failures.remove) throw new Error('synthetic storage failure'); disk.metadata.delete(key); },
  };
  const emit = async (event, value = disk.sdkSession) => {
    for (const listener of listeners) await listener(event, value);
  };
  const auth = {
    async getSession() { return { data: { session: disk.sdkSession }, error: null }; },
    onAuthStateChange(listener) {
      listeners.add(listener);
      void Promise.resolve().then(() => listener('INITIAL_SESSION', disk.sdkSession));
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    },
    async exchangeCodeForSession(_code, exchangeOptions) {
      calls.exchange += 1;
      calls.exchangeOptions.push(exchangeOptions ?? null);
      if (options.expectedFlowId) assert.equal(exchangeOptions?.flowId, options.expectedFlowId);
      assert.equal(disk.metadata.get(markerKey), markerValue, 'restriction precedes SDK persistence');
      if (options.exchangeError) return { data: { session: null }, error: options.exchangeError };
      if (options.failBeforePersistence) throw new Error('synthetic exchange failure');
      const value = options.exchangeSession ?? (exchangeOptions?.flowId ? providerSession('google') : session());
      disk.sdkSession = value;
      options.persisted?.resolve();
      for (const event of options.events ?? (exchangeOptions?.flowId ? ['SIGNED_IN'] : ['PASSWORD_RECOVERY'])) await emit(event, value);
      if (options.staleRecoveryEvent) await emit('PASSWORD_RECOVERY', options.staleRecoveryEvent);
      if (options.exchangeWait) await options.exchangeWait.promise;
      if (options.exchangeThrows) throw new Error('synthetic provider detail');
      return { data: { session: value, redirectType: options.redirectType ?? null }, error: null };
    },
    async signInWithPassword() {
      calls.login += 1;
      assert.equal(disk.metadata.has(markerKey), false, 'old restriction cleared before new login persists');
      disk.sdkSession = options.loginSession ?? session('new-login');
      await emit('SIGNED_IN');
      return { data: { session: disk.sdkSession }, error: null };
    },
    async signInWithOAuth({ provider, options: oauthOptions }) {
      calls.googleStart += 1;
      calls.oauthOptions.push({ provider, options: oauthOptions });
      assert.equal(provider, 'google');
      assert.equal(oauthOptions?.redirectTo, redirectModule.AUTH_CALLBACK_URI);
      assert.equal(oauthOptions?.skipBrowserRedirect, true);
      const redirectTo = oauthOptions?.redirectTo ?? redirectModule.AUTH_CALLBACK_URI;
      if (options.oauthError) return { data: { provider, url: null, flowId: null }, error: options.oauthError };
      const oauthUrl = options.oauthUrl ?? `${redirectTo}?code=google-oauth-code`;
      return { data: { provider, url: options.missingOauthUrl ? null : oauthUrl, flowId: options.flowIds?.[calls.googleStart - 1] ?? options.flowId ?? 'google-flow-id' }, error: null };
    },
    async signUp() { return { data: { session: null, user: { email: 'new@example.test' } }, error: null }; },
    async signOut(scope) {
      calls.signOut.push(scope ?? { scope: 'global' });
      if (options.cleanupWait) await options.cleanupWait.promise;
      if (failures.signOut) return { error: new Error('synthetic signout failure') };
      disk.sdkSession = null;
      await emit('SIGNED_OUT', null);
      return { error: null };
    },
    async updateUser(attrs) {
      calls.updateUser.push(attrs?.password);
      if (options.updateWait) await options.updateWait.promise;
      if (options.updateUserThrows) throw new Error('synthetic provider detail');
      if (options.updateUserError) return { error: options.updateUserError };
      await emit('USER_UPDATED');
      return { error: null };
    },
  };
  let cursor = 0;
  let value;
  const slots = [];
  const effects = [];
  const cleanups = [];
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    createElement: (_component, props) => { value = props.value; return null; },
    useContext: () => value,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (next) => {
        slots[index] = typeof next === 'function' ? next(slots[index]) : next;
        if (index === 1) calls.states.push(slots[index]);
      }];
    },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((dep, n) => dep !== slots[index].deps[n])) slots[index] = { callback, deps };
      return slots[index].callback;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!slots[index]) { slots[index] = deps; effects.push(effect); }
    },
  };
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require(name) {
      if (name === 'react') return react;
      if (name === '@react-native-async-storage/async-storage') return {
        getItem: async (key) => disk.app.get(key) ?? null,
        setItem: async (key, item) => { disk.app.set(key, item); },
        removeItem: async (key) => { disk.app.delete(key); },
      };
      if (name.endsWith('/supabaseClient')) return { getSupabaseClient: async () => ({ auth }) };
      if (name.endsWith('/supabaseStorage')) return { supabaseStorage: storage };
      if (name.endsWith('/authLifecycle')) return lifecycleModule;
      if (name.endsWith('/authCallbackCoordinator')) return callbackModule;
      if (name.endsWith('/authRedirect')) return redirectModule;
      if (name.endsWith('/authProviderIdentity')) return providerModule;
      if (name === 'expo-web-browser') return { WebBrowserResultType: { DISMISS: 'dismiss' }, openAuthSessionAsync: async (authorizationUrl, redirectUri) => {
        calls.browser.push([authorizationUrl, redirectUri]);
        if (options.browserError) throw options.browserError;
        const browserIndex = calls.browser.length - 1;
        if (options.browserWaits?.[browserIndex]) await options.browserWaits[browserIndex].promise;
        else if (options.browserWait) await options.browserWait.promise;
        if (options.browserResult) return options.browserResult;
        return { type: 'success', url: options.browserUrls?.[browserIndex] ?? options.googleUrl ?? `${redirectModule.AUTH_CALLBACK_URI}?code=google-oauth-code` };
      } };
      if (name.endsWith('/passwordRecoveryRequest')) return {
        isValidRecoveryEmail: (email) => email.length > 0 && !/\s/.test(email) && email.includes('@'),
        requestPasswordRecovery: async () => { throw new Error('requestPasswordRecovery must not be exercised by lifecycle tests'); },
      };
      if (name.endsWith('/passwordRecoveryCompletion')) return {
        isValidRecoveryPassword: (password) => password.trim().length > 0,
      };
      if (name.endsWith('/chawgeeApi')) return { bootstrapChawgeeAccount: async (token) => {
        calls.bootstrap.push(token);
        if (options.bootstrapWait) await options.bootstrapWait.promise;
        if (options.bootstrapFails) throw new Error('Unable to initialize your Chawgee account.');
        return { id: options.accountsByToken?.[token] ?? 'backend-account-id' };
      } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const render = () => { cursor = 0; exports.AuthProvider({ children: null }); return value; };
  render();
  for (const effect of effects.splice(0)) cleanups.push(effect());
  return { disk, calls, emit, failures, render, get value() { return render(); }, unmount() { cleanups.forEach((cleanup) => cleanup?.()); } };
}

async function started(options) { const h = harness(options); await flush(); return h; }

for (const events of [
  ['PASSWORD_RECOVERY'],
  ['SIGNED_IN', 'PASSWORD_RECOVERY'],
  ['PASSWORD_RECOVERY', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED', 'INITIAL_SESSION'],
]) {
  test(`SDK persists -> ${events.join(' -> ')} never bootstraps recovery`, async () => {
    const h = await started({ events });
    const result = await h.value.processAuthCallback(url());
    assert.equal(result.status, 'recovery');
    assert.equal(h.value.authState, 'recovery');
    assert.equal(h.value.user, null);
    assert.equal(h.calls.bootstrap.length, 0);
    assert.equal(h.disk.metadata.get(markerKey), markerValue);
    for (const event of ['INITIAL_SESSION', 'TOKEN_REFRESHED', 'USER_UPDATED', 'SIGNED_IN']) await h.emit(event);
    await flush();
    assert.equal(h.calls.bootstrap.length, 0);
    assert.equal(h.value.authState, 'recovery');
  });
}

test('exchange redirectType is SDK evidence even when event subscription misses notification', async () => {
  const h = await started({ events: [], redirectType: 'recovery' });
  await h.value.processAuthCallback(url());
  assert.equal(h.value.authState, 'recovery');
  assert.equal(h.calls.bootstrap.length, 0);
});

test('explicit URL recovery without SDK evidence cannot authorize recovery', async () => {
  const h = await started({ events: ['SIGNED_IN'] });
  const result = await h.value.processAuthCallback(`${redirectModule.AUTH_CALLBACK_URI}?type=recovery&code=synthetic`);
  assert.equal(result.reason, 'recovery_evidence_mismatch');
  assert.equal(h.calls.exchange, 1);
  assert.equal(h.calls.bootstrap.length, 0);
  assert.equal(h.value.authState, 'unauthenticated');
  assert.equal(h.disk.sdkSession, null);
  assert.equal(h.disk.metadata.size, 0);
});

test('interruption immediately after SDK persistence survives restart before recovery event', async () => {
  const persisted = deferred();
  const exchangeWait = deferred();
  const h = await started({ persisted, exchangeWait, events: [] });
  void h.value.processAuthCallback(url());
  await persisted.promise;
  h.unmount(); // abandoned exchange never completes: model terminated process
  const restarted = await started({ disk: h.disk });
  await restarted.emit('INITIAL_SESSION');
  await restarted.emit('TOKEN_REFRESHED', session());
  await restarted.emit('USER_UPDATED', session());
  await flush();
  assert.equal(restarted.calls.bootstrap.length, 0);
  assert.equal(restarted.value.authState, 'unauthenticated');
  assert.equal(restarted.disk.sdkSession, null);
  assert.equal(restarted.disk.metadata.has(markerKey), false);
  assert.equal(restarted.calls.signOut[0].scope, 'local');
});

test('marker alone, including corrupt metadata, never grants recovery', async () => {
  for (const metadata of [markerValue, 'corrupt']) {
    const disk = { metadata: new Map([[markerKey, metadata]]), sdkSession: session(), app: new Map() };
    const h = await started({ disk });
    assert.equal(h.calls.bootstrap.length, 0);
    assert.equal(h.calls.states.includes('recovery'), false);
    assert.equal(h.disk.sdkSession, null);
  }
});

for (const transition of ['signOut', 'signInAsGuest', 'signIn']) {
  test(`${transition} invalidates a pending recovery before its SDK completion`, async () => {
    const persisted = deferred(); const exchangeWait = deferred();
    const h = await started({ persisted, exchangeWait });
    const callback = h.value.processAuthCallback(url());
    await persisted.promise;
    const next = h.value[transition]('new@example.test', 'synthetic-password');
    await h.emit('PASSWORD_RECOVERY');
    exchangeWait.resolve();
    assert.equal((await callback).reason, 'stale_operation');
    await next;
    await h.emit('PASSWORD_RECOVERY', session());
    await h.emit('SIGNED_IN', session());
    await flush();
    assert.equal(h.value.authState, transition === 'signOut' ? 'unauthenticated' : transition === 'signInAsGuest' ? 'guest' : 'authenticated');
    assert.equal(h.calls.bootstrap.length, transition === 'signIn' ? 1 : 0);
    assert.equal(h.disk.metadata.has(markerKey), false);
  });
}

test('delayed cleanup cannot run after a newer login has persisted', async () => {
  const cleanupWait = deferred();
  const h = await started({ cleanupWait });
  await h.value.processAuthCallback(url());
  const login = h.value.signIn('new@example.test', 'synthetic-password');
  await flush();
  assert.equal(h.calls.signOut.length, 1);
  assert.equal(h.calls.login, 0);
  cleanupWait.resolve();
  await login;
  await h.emit('PASSWORD_RECOVERY', session());
  await flush();
  assert.equal(h.value.authState, 'authenticated');
  assert.equal(h.disk.sdkSession.user.id, 'new-login');
  assert.equal(h.calls.signOut.length, 1);
});

test('conflicting exchange identity is never reconciled or authorized', async () => {
  const disk = { metadata: new Map(), sdkSession: session('existing'), app: new Map() };
  const h = await started({ disk });
  const before = h.calls.bootstrap.length;
  const result = await h.value.processAuthCallback(url());
  assert.equal(result.reason, 'conflicting_identity');
  assert.equal(h.calls.bootstrap.length, before);
  assert.equal(h.calls.states.includes('recovery'), false);
  assert.equal(h.disk.sdkSession, null);
});

test('duplicates share admission and replay cannot revoke or reauthorize recovery', async () => {
  const persisted = deferred(); const exchangeWait = deferred();
  const h = await started({ persisted, exchangeWait });
  const first = h.value.processAuthCallback(url());
  const second = h.value.processAuthCallback(url());
  assert.equal(first, second);
  await persisted.promise;
  await h.emit('PASSWORD_RECOVERY');
  await h.emit('PASSWORD_RECOVERY');
  exchangeWait.resolve();
  await first;
  assert.equal((await h.value.processAuthCallback(url())).status, 'replayed');
  assert.equal(h.calls.exchange, 1);
  assert.equal(h.calls.states.filter((state) => state === 'recovery').length, 1);
  assert.equal(h.value.authState, 'recovery');
});

test('ordinary verification callback still bootstraps once and completes authenticated', async () => {
  const h = await started({ events: ['SIGNED_IN'], exchangeSession: session('verified') });
  assert.equal((await h.value.processAuthCallback(url())).status, 'authenticated');
  assert.equal(h.value.authState, 'authenticated');
  assert.equal(h.calls.bootstrap.length, 1);
  assert.equal(h.disk.metadata.has(markerKey), false);
  assert.equal(h.calls.signOut.length, 0);
});

test('normal restore, refresh, USER_UPDATED, logout and new login still reconcile', async () => {
  const disk = { metadata: new Map(), sdkSession: session('ordinary'), app: new Map() };
  const h = await started({ disk });
  assert.equal(h.value.authState, 'authenticated');
  disk.sdkSession = session('ordinary', 'refreshed-synthetic-token');
  await h.emit('TOKEN_REFRESHED'); await flush();
  assert.equal(h.calls.bootstrap.length, 2);
  await h.emit('USER_UPDATED'); await flush();
  assert.equal(h.calls.bootstrap.length, 3);
  await h.value.signOut();
  assert.equal(h.value.authState, 'unauthenticated');
  await h.value.signIn('new@example.test', 'synthetic-password');
  assert.equal(h.value.authState, 'authenticated');
  assert.equal(h.calls.bootstrap.length, 4);
  assert.equal(h.calls.writes.length, 0);
});

test('unverified sessions and signup without a session preserve verification_required', async () => {
  const value = session('unverified'); value.user.email_confirmed_at = null;
  const disk = { metadata: new Map(), sdkSession: value, app: new Map() };
  const h = await started({ disk });
  assert.equal(h.value.authState, 'verification_required');
  assert.equal(h.calls.bootstrap.length, 0);
  await h.value.signUp('new@example.test', 'synthetic-password');
  assert.equal(h.value.authState, 'verification_required');
});

test('durable metadata is fixed noncredential data, not a session copy or grant', async () => {
  const h = await started();
  await h.value.processAuthCallback(url());
  assert.deepEqual(h.calls.writes, [[markerKey, markerValue]]);
  assert.deepEqual(JSON.parse(markerValue), { version: 1, status: 'unresolved_callback' });
  assert.equal(h.disk.app.size, 0);
});

for (const failure of ['read', 'write', 'remove', 'signOut']) {
  test(`${failure} failure does not permit recovery bootstrap`, async () => {
    const failures = {};
    const h = await started({ failures });
    if (failure === 'read') {
      const disk = { metadata: new Map([[markerKey, markerValue]]), sdkSession: session(), app: new Map() };
      const restarted = await started({ disk, failures: { read: true } });
      await restarted.emit('INITIAL_SESSION'); await restarted.emit('TOKEN_REFRESHED');
      await flush();
      assert.equal(restarted.value.authState, 'recovery_interrupted');
      assert.equal(restarted.calls.bootstrap.length, 0);
      return;
    }
    if (failure === 'write') {
      failures.write = true;
      await h.value.processAuthCallback(url());
      assert.equal(h.calls.exchange, 0);
    } else {
      await h.value.processAuthCallback(url());
      failures[failure] = true;
      await assert.rejects(h.value.signIn('new@example.test', 'synthetic-password'));
      assert.equal(h.calls.login, 0);
      assert.equal(h.value.authState, 'recovery_interrupted');
      assert.equal(h.disk.metadata.has(markerKey), true);
    }
    await h.emit('INITIAL_SESSION'); await h.emit('TOKEN_REFRESHED'); await flush();
    assert.equal(h.calls.bootstrap.length, 0);
  });
}

test('exchange throws after persistence: cleanup occurs before any ordinary reconciliation', async () => {
  const h = await started({ exchangeThrows: true });
  assert.equal((await h.value.processAuthCallback(url())).status, 'failed');
  assert.equal(h.calls.bootstrap.length, 0);
  assert.equal(h.disk.sdkSession, null);
  assert.equal(h.disk.metadata.has(markerKey), false);
});

test('all restricted states deny application routes without adding recovery UI routes', () => {
  for (const state of ['recovery_processing', 'recovery', 'recovery_interrupted']) {
    for (const route of ['protected', 'onboarding']) assert.notEqual(resolveRouteAccess(state, route).type, 'allow');
    assert.deepEqual(resolveRouteAccess(state, 'callback'), { type: 'allow' });
  }
});

test('stale recovery event during a newer ordinary exchange is not evidence for that session', async () => {
  const h = await started({ events: ['SIGNED_IN'], exchangeSession: session('verified'), staleRecoveryEvent: session('old') });
  assert.equal((await h.value.processAuthCallback(url())).status, 'authenticated');
  assert.equal(h.value.authState, 'authenticated');
  assert.equal(h.calls.bootstrap.length, 1);
  assert.equal(h.calls.signOut.length, 0);
});

test('unexpected current SDK recovery event restricts but cannot authorize recovery', async () => {
  const h = await started();
  h.disk.sdkSession = session();
  await h.emit('PASSWORD_RECOVERY');
  await h.emit('SIGNED_IN');
  await h.emit('INITIAL_SESSION');
  await flush();
  assert.equal(h.value.authState, 'recovery_interrupted');
  assert.equal(h.calls.bootstrap.length, 0);
  assert.equal(h.disk.metadata.get(markerKey), markerValue);
});

test('failed callback that never changed SDK persistence preserves the existing session', async () => {
  const original = session('existing');
  const disk = { metadata: new Map(), sdkSession: original, app: new Map() };
  const h = await started({ disk, failBeforePersistence: true });
  assert.equal((await h.value.processAuthCallback(url())).status, 'failed');
  assert.equal(h.calls.signOut.length, 0);
  assert.equal(h.disk.sdkSession, original);
  assert.equal(h.value.authState, 'authenticated');
  assert.equal(h.disk.metadata.has(markerKey), false);
});

test('marker write failure cannot exchange or sign out an unchanged existing session', async () => {
  const original = session('existing');
  const disk = { metadata: new Map(), sdkSession: original, app: new Map() };
  const h = await started({ disk });
  h.failures.write = true;
  await h.value.processAuthCallback(url());
  assert.equal(h.calls.exchange, 0);
  assert.equal(h.calls.signOut.length, 0);
  assert.equal(h.disk.sdkSession, original);
});

test('marker removal failure after ordinary exchange still blocks bootstrap', async () => {
  const h = await started({ events: ['SIGNED_IN'], exchangeSession: session('verified') });
  h.failures.remove = true;
  await h.value.processAuthCallback(url());
  assert.equal(h.calls.bootstrap.length, 0);
  assert.equal(h.value.authState, 'recovery_interrupted');
  assert.equal(h.disk.metadata.has(markerKey), true);
});

test('restart cleanup failure retains restriction through all auth events', async () => {
  const disk = { metadata: new Map([[markerKey, markerValue]]), sdkSession: session(), app: new Map() };
  const h = await started({ disk, failures: { signOut: true } });
  for (const event of ['INITIAL_SESSION', 'TOKEN_REFRESHED', 'USER_UPDATED', 'SIGNED_IN']) await h.emit(event);
  await flush();
  assert.equal(h.value.authState, 'recovery_interrupted');
  assert.equal(h.calls.bootstrap.length, 0);
  assert.equal(h.disk.metadata.has(markerKey), true);
});

test('bootstrap failure outside recovery remains bootstrap_failed', async () => {
  const h = await started({ events: ['SIGNED_IN'], exchangeSession: session('verified'), bootstrapFails: true });
  assert.equal((await h.value.processAuthCallback(url())).status, 'failed');
  assert.equal(h.value.authState, 'bootstrap_failed');
  assert.equal(h.disk.metadata.has(markerKey), false);
});

test('logout during ordinary bootstrap prevents a late authenticated commit', async () => {
  const bootstrapWait = deferred();
  const h = await started({ bootstrapWait });
  const login = h.value.signIn('new@example.test', 'synthetic-password');
  await flush();
  const logout = h.value.signOut();
  bootstrapWait.resolve();
  await login;
  await logout;
  assert.equal(h.value.authState, 'unauthenticated');
  assert.equal(h.calls.states.includes('authenticated'), false);
});

test('refresh arriving during ordinary bootstrap invalidates the older token work', async () => {
  const bootstrapWait = deferred();
  const h = await started({ bootstrapWait });
  const login = h.value.signIn('new@example.test', 'synthetic-password');
  await flush();
  h.disk.sdkSession = session('new-login', 'new-refreshed-synthetic-token');
  await h.emit('TOKEN_REFRESHED');
  await flush();
  bootstrapWait.resolve();
  await login;
  await flush();
  assert.equal(h.calls.bootstrap.length, 2);
  assert.equal(h.value.authState, 'authenticated');
  assert.equal(h.calls.states.filter((state) => state === 'authenticated').length, 1);
});

test('external SDK logout still invalidates ordinary bootstrap while it is pending', async () => {
  const bootstrapWait = deferred();
  const h = await started({ bootstrapWait });
  const login = h.value.signIn('new@example.test', 'synthetic-password');
  await flush();
  h.disk.sdkSession = null;
  await h.emit('SIGNED_OUT', null);
  await flush();
  bootstrapWait.resolve();
  await login;
  assert.equal(h.value.authState, 'unauthenticated');
  assert.equal(h.calls.states.includes('authenticated'), false);
});

const recoveryUrl = (code = 'explicit-recovery') => `${redirectModule.AUTH_CALLBACK_URI}?type=recovery&code=${code}`;

for (const options of [
  { events: ['PASSWORD_RECOVERY'] },
  { events: [], redirectType: 'recovery' },
  { events: ['SIGNED_IN', 'PASSWORD_RECOVERY', 'USER_UPDATED', 'TOKEN_REFRESHED'], redirectType: 'recovery' },
]) {
  test('explicit recovery uses SDK-confirmed admission and a minimal safe result', async () => {
    const h = await started(options);
    const result = await h.value.processAuthCallback(recoveryUrl());
    assert.equal(JSON.stringify(result), '{"status":"recovery"}');
    assert.equal(h.value.authState, 'recovery');
    assert.equal(h.calls.bootstrap.length, 0);
    assert.equal(h.disk.metadata.get(markerKey), markerValue);
    assert.deepEqual(resolveRouteAccess(h.value.authState, 'callback', { status: 'complete', result }), {
      type: 'redirect', href: '/auth/reset-password',
    });
  });
}

for (const [incoming, options] of [
  [recoveryUrl(), { events: ['SIGNED_IN'] }],
  [recoveryUrl(), { events: [], staleRecoveryEvent: session('different') }],
  [`${url('signup-conflict')}&type=signup`, { events: ['PASSWORD_RECOVERY'], redirectType: 'recovery' }],
  [recoveryUrl(), { events: ['PASSWORD_RECOVERY'], redirectType: 'signup' }],
]) {
  test('conflicting URL intent or SDK evidence fails closed with owned cleanup', async () => {
    const h = await started(options);
    const result = await h.value.processAuthCallback(incoming);
    assert.equal(result.reason, 'recovery_evidence_mismatch');
    assert.equal(result.intent, 'recovery');
    assert.equal(h.calls.bootstrap.length, 0);
    assert.equal(h.calls.states.includes('recovery'), false);
    assert.equal(h.disk.sdkSession, null);
  });
}

for (const transition of ['signOut', 'signInAsGuest', 'signIn']) {
  test(`explicit recovery ${transition} race cannot admit or route an older callback`, async () => {
    const persisted = deferred(); const exchangeWait = deferred();
    const h = await started({ persisted, exchangeWait, redirectType: 'recovery' });
    const pending = h.value.processAuthCallback(recoveryUrl());
    await persisted.promise;
    const next = h.value[transition]('new@example.test', 'synthetic-password');
    exchangeWait.resolve();
    const result = await pending;
    await next;
    assert.equal(result.reason, 'stale_operation');
    assert.equal(h.calls.states.includes('recovery'), false);
    assert.deepEqual(resolveRouteAccess(h.value.authState, 'callback', { status: 'complete', result }), { type: 'allow' });
    assert.equal(h.calls.bootstrap.length, transition === 'signIn' ? 1 : 0);
  });
}

test('new login synchronously revokes recovery navigation before delayed cleanup', async () => {
  const cleanupWait = deferred();
  const h = await started({ cleanupWait });
  const result = await h.value.processAuthCallback(recoveryUrl());
  const login = h.value.signIn('new@example.test', 'synthetic-password');
  assert.equal(h.value.authState, 'recovery_interrupted');
  assert.deepEqual(resolveRouteAccess(h.value.authState, 'callback', { status: 'complete', result }), { type: 'allow' });
  await flush();
  assert.equal(h.calls.login, 0);
  cleanupWait.resolve();
  await login;
  assert.equal(h.disk.sdkSession.user.id, 'new-login');
  assert.equal(h.calls.signOut.length, 1);
});

test('explicit recovery duplicates exchange once; replay after logout cannot reopen recovery', async () => {
  const persisted = deferred(); const exchangeWait = deferred();
  const h = await started({ persisted, exchangeWait });
  const first = h.value.processAuthCallback(recoveryUrl());
  const second = h.value.processAuthCallback(recoveryUrl());
  assert.equal(first, second);
  await persisted.promise;
  exchangeWait.resolve();
  await first;
  await h.value.signOut();
  const replay = await h.value.processAuthCallback(recoveryUrl());
  assert.equal(replay.status, 'replayed');
  assert.equal(h.calls.exchange, 1);
  assert.equal(h.value.authState, 'unauthenticated');
});

test('duplicate code with conflicting intent cannot borrow another callback result', async () => {
  const persisted = deferred(); const exchangeWait = deferred();
  const h = await started({ persisted, exchangeWait });
  const first = h.value.processAuthCallback(recoveryUrl('same'));
  await persisted.promise;
  const conflict = await h.value.processAuthCallback(`${url('same')}&type=signup`);
  assert.equal(conflict.reason, 'recovery_evidence_mismatch');
  exchangeWait.resolve();
  assert.equal((await first).status, 'recovery');
  assert.equal(h.calls.exchange, 1);
});

for (const error of [
  { code: 'flow_state_not_found', message: 'PKCE code verifier missing: synthetic provider detail' },
  { code: 'otp_expired', message: 'synthetic expired provider detail' },
]) {
  test('recovery exchange failures expose only safe classification', async () => {
    const h = await started({ exchangeError: error });
    const result = await h.value.processAuthCallback(recoveryUrl());
    assert.equal(result.status, 'failed');
    assert.equal(result.intent, 'recovery');
    assert.equal(result.reason, error.code === 'otp_expired' ? 'verification_failed' : 'device_verifier_missing');
    assert.equal(JSON.stringify(result).includes('synthetic'), false);
    assert.equal(h.calls.bootstrap.length, 0);
    assert.equal(h.disk.sdkSession, null);
  });
}

// #7A-8D: completePasswordRecovery must independently enforce authorization
// using the same generation/ownership contract established above, not the route.
const newPassword = 'Synthetic-New-Password-1';

test('recovery-completion authorization boundary only admits the exact "recovery" phase', async () => {
  const storage = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
  const lifecycle = new lifecycleModule.AuthLifecycleCoordinator(storage);
  await lifecycle.checkInterruption();
  assert.equal(lifecycle.recoveryPhase, 'none');
  const owner = lifecycle.nextOperation();
  await lifecycle.runExclusive(async () => { await lifecycle.beginCallback(owner, null); });
  assert.equal(lifecycle.recoveryPhase, 'processing');
  await lifecycle.runExclusive(async () => {
    const recovery = await lifecycle.finishCallback(owner, { user: { id: 'u' }, access_token: 't' }, 'recovery');
    assert.equal(recovery, true);
  });
  assert.equal(lifecycle.recoveryPhase, 'recovery');
  lifecycle.nextOperation();
  assert.equal(lifecycle.recoveryPhase, 'interrupted');
});

test('completePasswordRecovery is exposed through AuthContext', async () => {
  const h = await started();
  assert.equal(typeof h.value.completePasswordRecovery, 'function');
});

test('guest session cannot use recovery completion', async () => {
  const h = await started();
  await h.value.signInAsGuest();
  const result = await h.value.completePasswordRecovery(newPassword);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'not_authorized');
  assert.equal(h.calls.updateUser.length, 0);
});

test('ordinary authenticated session cannot use recovery completion', async () => {
  const disk = { metadata: new Map(), sdkSession: session('ordinary'), app: new Map() };
  const h = await started({ disk });
  assert.equal(h.value.authState, 'authenticated');
  const result = await h.value.completePasswordRecovery(newPassword);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'not_authorized');
  assert.equal(h.calls.updateUser.length, 0);
});

test('recovery_interrupted cannot use recovery completion', async () => {
  const h = await started();
  h.disk.sdkSession = session();
  await h.emit('PASSWORD_RECOVERY');
  await h.emit('SIGNED_IN');
  await flush();
  assert.equal(h.value.authState, 'recovery_interrupted');
  const result = await h.value.completePasswordRecovery(newPassword);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'not_authorized');
  assert.equal(h.calls.updateUser.length, 0);
});

test('no active recovery: completion fails before touching updateUser', async () => {
  const h = await started();
  const result = await h.value.completePasswordRecovery(newPassword);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'not_authorized');
  assert.equal(h.calls.updateUser.length, 0);
});

test('direct reset-password navigation cannot authorize update without authoritative recovery', async () => {
  const h = await started();
  assert.notEqual(h.value.authState, 'recovery');
  const result = await h.value.completePasswordRecovery(newPassword);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'not_authorized');
});

test('blank password is rejected locally before touching the lifecycle', async () => {
  const h = await started();
  await h.value.processAuthCallback(recoveryUrl());
  const result = await h.value.completePasswordRecovery('   ');
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'invalid_password');
  assert.equal(h.calls.updateUser.length, 0);
  assert.equal(h.value.authState, 'recovery');
});

test('authoritative recovery calls updateUser exactly once and transitions out of recovery to Login', async () => {
  const h = await started();
  await h.value.processAuthCallback(recoveryUrl());
  const result = await h.value.completePasswordRecovery(newPassword);
  assert.equal(result.status, 'completed');
  assert.deepEqual(h.calls.updateUser, [newPassword]);
  assert.equal(h.value.authState, 'unauthenticated');
  assert.equal(h.value.user, null);
  assert.equal(h.calls.bootstrap.length, 0);
});

test('successful completion safely signs out only the owned recovery session', async () => {
  const h = await started();
  await h.value.processAuthCallback(recoveryUrl());
  await h.value.completePasswordRecovery(newPassword);
  assert.equal(h.calls.signOut.length, 1);
  assert.equal(h.calls.signOut[0].scope, 'local');
  assert.equal(h.disk.sdkSession, null);
  assert.equal(h.disk.metadata.has(markerKey), false);
});

test('USER_UPDATED during the recovery update never bootstraps or reaches authenticated state', async () => {
  const h = await started();
  await h.value.processAuthCallback(recoveryUrl());
  await h.value.completePasswordRecovery(newPassword);
  assert.equal(h.calls.bootstrap.length, 0);
  assert.equal(h.calls.states.includes('authenticated'), false);
});

test('stale/superseded recovery cannot complete', async () => {
  const h = await started();
  await h.value.processAuthCallback(recoveryUrl('first'));
  await h.value.signOut();
  const result = await h.value.completePasswordRecovery(newPassword);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'not_authorized');
  assert.equal(h.calls.updateUser.length, 0);
});

test('logout during a pending update invalidates completion and cannot restore recovery', async () => {
  const updateWait = deferred();
  const h = await started({ updateWait });
  await h.value.processAuthCallback(recoveryUrl());
  const completion = h.value.completePasswordRecovery(newPassword);
  await flush();
  const logout = h.value.signOut();
  updateWait.resolve();
  const result = await completion;
  await logout;
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'not_authorized');
  assert.equal(h.value.authState, 'unauthenticated');
});

test('guest transition during a pending update invalidates completion', async () => {
  const updateWait = deferred();
  const h = await started({ updateWait });
  await h.value.processAuthCallback(recoveryUrl());
  const completion = h.value.completePasswordRecovery(newPassword);
  await flush();
  const guest = h.value.signInAsGuest();
  updateWait.resolve();
  const result = await completion;
  await guest;
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'not_authorized');
  assert.equal(h.value.authState, 'guest');
});

test('a newer login survives a delayed recovery completion attempt', async () => {
  const updateWait = deferred();
  const h = await started({ updateWait });
  await h.value.processAuthCallback(recoveryUrl());
  const completion = h.value.completePasswordRecovery(newPassword);
  await flush();
  const login = h.value.signIn('new@example.test', 'synthetic-password');
  updateWait.resolve();
  const result = await completion;
  await login;
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'not_authorized');
  assert.equal(h.value.authState, 'authenticated');
  assert.equal(h.disk.sdkSession.user.id, 'new-login');
});

test('a newer recovery survives cleanup from an older, superseded completion attempt', async () => {
  const updateWait = deferred();
  const h = await started({ updateWait });
  await h.value.processAuthCallback(recoveryUrl('older'));
  const completion = h.value.completePasswordRecovery(newPassword);
  await flush();
  const newer = h.value.processAuthCallback(recoveryUrl('newer'));
  await flush();
  updateWait.resolve();
  const result = await completion;
  await newer;
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'not_authorized');
  assert.equal(h.value.authState, 'recovery');
});

test('a genuine provider/network update failure is normalized safely, and retry is allowed while still authoritative', async () => {
  const h = await started({ updateUserError: { code: 'network_error', message: 'synthetic provider detail' } });
  await h.value.processAuthCallback(recoveryUrl());
  const failure = await h.value.completePasswordRecovery(newPassword);
  assert.equal(failure.status, 'failed');
  assert.equal(failure.reason, 'update_failed');
  assert.equal(JSON.stringify(failure).includes('synthetic'), false);
  assert.equal(h.value.authState, 'recovery');
});

test('cleanup failure remains fail closed without claiming ordinary authenticated success', async () => {
  const h = await started({ failures: { signOut: true } });
  await h.value.processAuthCallback(recoveryUrl());
  const result = await h.value.completePasswordRecovery(newPassword);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'cleanup_failed');
  assert.equal(h.calls.updateUser.length, 1);
  assert.notEqual(h.value.authState, 'authenticated');
  assert.equal(h.calls.bootstrap.length, 0);
});

test('no password or recovery credential ever appears in durable storage', async () => {
  const h = await started();
  await h.value.processAuthCallback(recoveryUrl());
  await h.value.completePasswordRecovery(newPassword);
  for (const [, value] of h.disk.metadata) assert.equal(String(value).includes(newPassword), false);
  for (const [, value] of h.disk.app) assert.equal(String(value).includes(newPassword), false);
  assert.equal(h.calls.writes.some(([, value]) => String(value).includes(newPassword)), false);
});

const providerSession = (provider, id = provider) => {
  const value = session(id);
  value.user.email = 'same@example.test';
  value.user.app_metadata = { provider, providers: [provider] };
  value.user.identities[0].provider = provider;
  if (provider === 'google') delete value.user.email_confirmed_at;
  return value;
};

for (const provider of ['email', 'google']) {
  test(`${provider} restoration maps trusted provider and backend account ID`, async () => {
    const value = providerSession(provider);
    const disk = { metadata: new Map(), sdkSession: value, app: new Map() };
    const h = await started({ disk });
    assert.equal(h.value.authState, 'authenticated');
    assert.equal(h.value.user.provider, provider);
    assert.equal(h.value.user.id, 'backend-account-id');
    assert.deepEqual(h.calls.bootstrap, [value.access_token]);
    assert.equal(JSON.parse(disk.app.get('@accountability_user_session')).provider, provider);
    await h.value.signOut();
    assert.equal(h.value.user, null);
  });
}

test('same email on distinct identities keeps token-selected backend accounts separate', async () => {
  const email = providerSession('email', 'email-subject');
  const google = providerSession('google', 'google-subject');
  assert.equal(email.user.email, google.user.email);
  const h = await started({
    disk: { metadata: new Map(), sdkSession: email, app: new Map() },
    accountsByToken: { [email.access_token]: 'email-account', [google.access_token]: 'google-account' },
  });
  assert.equal(h.value.user.id, 'email-account');
  await h.value.signOut();
  h.disk.sdkSession = google;
  await h.emit('SIGNED_IN');
  await flush();
  assert.equal(h.value.user.id, 'google-account');
  assert.equal(h.value.user.provider, 'google');
  assert.deepEqual(h.calls.bootstrap, [email.access_token, google.access_token]);
});

test('unsupported, missing and conflicting provider evidence never bootstraps', async () => {
  for (const value of [providerSession('unknown'), providerSession('apple'), session('missing'), providerSession('google')]) {
    if (value.user.id === 'missing') delete value.user.identities;
    if (value.user.id === 'google') value.user.app_metadata.provider = 'email';
    const h = await started();
    h.disk.sdkSession = value;
    await h.emit('SIGNED_IN');
    await flush();
    assert.equal(h.value.authState, 'bootstrap_failed');
    assert.equal(h.value.pendingVerificationEmail, null);
    assert.equal(h.value.user, null);
    assert.equal(h.calls.bootstrap.length, 0);
  }
});

for (const rejection of ['ambiguous', 'unverified']) {
  test(`${rejection} USER_UPDATED invalidates same-token bootstrap already in flight`, async () => {
    const bootstrapWait = deferred();
    const h = await started({ bootstrapWait });
    const value = session('pending');
    h.disk.sdkSession = value;
    await h.emit('SIGNED_IN');
    await flush();
    assert.equal(h.calls.bootstrap.length, 1);
    h.disk.sdkSession = { ...value, user: { ...value.user } };
    if (rejection === 'ambiguous') h.disk.sdkSession.user.app_metadata = { provider: 'google' };
    else delete h.disk.sdkSession.user.email_confirmed_at;
    await h.emit('USER_UPDATED');
    await flush();
    bootstrapWait.resolve();
    await flush();
    assert.equal(h.value.user, null);
    assert.equal(h.value.authState, rejection === 'ambiguous' ? 'bootstrap_failed' : 'verification_required');
    assert.equal(h.calls.states.includes('authenticated'), false);
  });
}

test('Google event bursts deduplicate in-flight bootstrap and refresh retains provider', async () => {
  const bootstrapWait = deferred();
  const h = await started({ bootstrapWait });
  h.disk.sdkSession = providerSession('google');
  for (const event of ['SIGNED_IN', 'INITIAL_SESSION', 'USER_UPDATED', 'TOKEN_REFRESHED']) await h.emit(event);
  await flush();
  assert.equal(h.calls.bootstrap.length, 1);
  bootstrapWait.resolve();
  await flush();
  assert.equal(h.value.user.provider, 'google');
  h.disk.sdkSession = { ...h.disk.sdkSession, access_token: 'refreshed-google-token' };
  await h.emit('TOKEN_REFRESHED');
  await flush();
  assert.equal(h.calls.bootstrap.length, 2);
  assert.equal(h.value.user.provider, 'google');
});

test('Google sign-in starts OAuth and completes through the existing callback’ lifecycle', async () => {
  const h = await started({
    googleUrl: `${redirectModule.AUTH_CALLBACK_URI}?code=google-oauth-code`,
    expectedFlowId: 'google-flow-id',
  });

  const result = await h.value.signInWithGoogle();
  assert.equal(result.status, 'authenticated');
  assert.equal(h.calls.googleStart, 1);
  assert.equal(h.calls.exchange, 1);
  assert.equal(h.value.user.provider, 'google');
  assert.equal(h.value.authState, 'authenticated');
});

test('Google initiation does not authenticate before the browser callback', async () => {
  const browserWait = deferred();
  const h = await started({ googleUrl: `${redirectModule.AUTH_CALLBACK_URI}?code=google-oauth-code`, browserWait });
  const pending = h.value.signInWithGoogle();
  await flush();
  assert.equal(h.calls.googleStart, 1);
  assert.equal(h.calls.exchange, 0);
  assert.equal(h.calls.bootstrap.length, 0);
  browserWait.resolve();
  await pending;
});

test('Google initiation passes the canonical browser contract exactly once', async () => {
  const h = await started({ expectedFlowId: 'flow-a', oauthUrl: `${redirectModule.AUTH_CALLBACK_URI}?code=contract-code` });
  await h.value.signInWithGoogle();
  assert.equal(h.calls.googleStart, 1);
  assert.equal(JSON.stringify(h.calls.oauthOptions[0]), JSON.stringify({
    provider: 'google',
    options: { redirectTo: redirectModule.AUTH_CALLBACK_URI, skipBrowserRedirect: true },
  }));
  assert.equal(h.calls.browser.length, 1);
  assert.equal(h.calls.browser[0][0], `${redirectModule.AUTH_CALLBACK_URI}?code=contract-code`);
  assert.equal(h.calls.browser[0][1], redirectModule.AUTH_CALLBACK_URI);
});

test('Google browser cancellation and dismissal never exchange or bootstrap', async () => {
  for (const type of ['cancel', 'dismiss']) {
    const h = await started({ browserResult: { type } });
    const result = await h.value.signInWithGoogle();
    assert.equal(result.status, 'failed');
    assert.equal(h.calls.exchange, 0);
    assert.equal(h.calls.bootstrap.length, 0);
  }
});

test('Google initiation and browser errors normalize without exposing raw details', async () => {
  const initiation = await started({ oauthError: { message: 'provider-secret' } });
  const initiationResult = await initiation.value.signInWithGoogle();
  assert.equal(initiationResult.status, 'failed');
  assert.equal(initiationResult.reason, 'verification_failed');
  assert.equal(initiation.value.authError, 'Unable to start Google sign-in.');

  const browser = await started({ browserError: new Error('browser-secret') });
  const browserResult = await browser.value.signInWithGoogle();
  assert.equal(browserResult.status, 'failed');
  assert.equal(browserResult.reason, 'verification_failed');
  assert.doesNotMatch(browser.value.authError ?? '', /browser-secret/);
});

test('Missing Google authorization URL fails safely without exchange', async () => {
  const h = await started({ missingOauthUrl: true });
  const result = await h.value.signInWithGoogle();
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'verification_failed');
  assert.equal(h.calls.exchange, 0);
});

test('Google flow id is matched during exchange and never persisted', async () => {
  const h = await started({ flowId: 'flow-a', expectedFlowId: 'flow-a' });
  await h.value.signInWithGoogle();
  assert.deepEqual(h.calls.exchangeOptions, [{ flowId: 'flow-a' }]);
  for (const [, value] of h.disk.metadata) assert.doesNotMatch(value, /flow-a/);
  for (const [, value] of h.disk.app) assert.doesNotMatch(String(value), /flow-a/);
});

test('logout, guest transition, and newer email login invalidate pending Google browser work', async () => {
  for (const transition of ['signOut', 'signInAsGuest', 'signIn']) {
    const browserWait = deferred();
    const h = await started({ browserWait });
    const google = h.value.signInWithGoogle();
    await flush();
    const next = h.value[transition]('new@example.test', 'password');
    browserWait.resolve();
    const result = await google;
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'stale_operation');
    await next;
    assert.equal(h.calls.exchange, 0);
  }
});

test('password recovery invalidates pending Google browser work', async () => {
  const browserWait = deferred();
  const h = await started({ browserWait });
  const google = h.value.signInWithGoogle();
  await flush();
  const recovery = h.value.processAuthCallback(`${redirectModule.AUTH_CALLBACK_URI}?type=recovery&code=recovery-code`);
  browserWait.resolve();
  assert.equal((await google).status, 'failed');
  assert.equal((await google).reason, 'stale_operation');
  await recovery;
  assert.equal(h.calls.exchange, 1);
});

test('unmount invalidates pending Google browser work', async () => {
  const browserWait = deferred();
  const h = await started({ browserWait });
  const google = h.value.signInWithGoogle();
  await flush();
  h.unmount();
  browserWait.resolve();
  const result = await google;
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'stale_operation');
  assert.equal(h.calls.exchange, 0);
});

test('old provider teardown cannot invalidate a new provider Google operation', async () => {
  const oldBrowser = deferred();
  const oldProvider = await started({ browserWait: oldBrowser, flowId: 'old-flow' });
  const oldGoogle = oldProvider.value.signInWithGoogle();
  await flush();
  oldProvider.unmount();

  const newProvider = await started({ flowId: 'new-flow', expectedFlowId: 'new-flow' });
  const newResult = await newProvider.value.signInWithGoogle();
  assert.equal(newResult.status, 'authenticated');
  assert.equal(newProvider.calls.exchange, 1);

  oldBrowser.resolve();
  const oldResult = await oldGoogle;
  assert.equal(oldResult.status, 'failed');
  assert.equal(oldResult.reason, 'stale_operation');
  assert.equal(newProvider.value.authState, 'authenticated');
  assert.equal(newProvider.calls.exchange, 1);
});

test('admitted Google callback rejects an email-provider result before bootstrap', async () => {
  const browserWait = deferred();
  const h = await started({ browserWait, exchangeSession: session('email-result') });
  const google = h.value.signInWithGoogle();
  await flush();
  const callback = h.value.processAuthCallback(url('google-email-result'));
  const result = await callback;
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'verification_failed');
  assert.equal(h.calls.bootstrap.length, 0);
  browserWait.resolve();
  await google;
});

test('Google callback with an invalidated operation cannot consume a newer flow', async () => {
  const firstBrowser = deferred();
  const h = await started({ browserWait: firstBrowser, flowId: 'flow-a' });
  const first = h.value.signInWithGoogle();
  await flush();
  firstBrowser.resolve();
  assert.equal((await first).status, 'authenticated');
  assert.equal(h.calls.exchangeOptions[0].flowId, 'flow-a');
});

test('Google B supersedes A and A browser return cannot exchange or mutate B', async () => {
  const aWait = deferred();
  const bWait = deferred();
  const h = await started({
    browserWaits: [aWait, bWait],
    browserUrls: [
      `${redirectModule.AUTH_CALLBACK_URI}?code=google-a`,
      `${redirectModule.AUTH_CALLBACK_URI}?code=google-b`,
    ],
    flowIds: ['flow-a', 'flow-b'],
  });
  const a = h.value.signInWithGoogle();
  await flush();
  const b = h.value.signInWithGoogle();
  await flush();
  aWait.resolve();
  const aResult = await a;
  assert.equal(aResult.status, 'failed');
  assert.equal(aResult.reason, 'stale_operation');
  assert.equal(h.calls.exchange, 0);
  bWait.resolve();
  const bResult = await b;
  assert.equal(bResult.status, 'authenticated');
  assert.deepEqual(h.calls.exchangeOptions.map((value) => value?.flowId), ['flow-b']);
  assert.equal(h.calls.bootstrap.length, 1);
});

test('Google callback without an admitted operation cannot bootstrap as Google', async () => {
  const h = await started({ exchangeSession: providerSession('google') });
  const result = await h.value.processAuthCallback(url('unadmitted-google'));
  assert.notEqual(result.status, 'authenticated');
  assert.equal(h.calls.bootstrap.length, 0);
});

test('Google metadata cannot bypass password recovery restriction', async () => {
  const h = await started({ exchangeSession: providerSession('google') });
  assert.equal((await h.value.processAuthCallback(url())).status, 'recovery');
  for (const event of ['INITIAL_SESSION', 'SIGNED_IN', 'USER_UPDATED', 'TOKEN_REFRESHED']) await h.emit(event);
  await flush();
  assert.equal(h.value.authState, 'recovery');
  assert.equal(h.calls.bootstrap.length, 0);
});
