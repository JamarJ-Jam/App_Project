import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuthCallbackHandoff } from '../src/auth/authCallbackHandoff.ts';
import { AuthCallbackCoordinator } from '../src/auth/authCallbackCoordinator.ts';
import { AUTH_CALLBACK_URI } from '../src/auth/authRedirect.ts';

const url = (code) => `${AUTH_CALLBACK_URI}?code=${code}`;
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
function harness(process = async () => ({ status: 'authenticated' })) {
  const initial = deferred();
  const listeners = new Set();
  const calls = [];
  const handoff = new AuthCallbackHandoff();
  const linking = {
    getInitialURL: () => initial.promise,
    addEventListener(type, listener) {
      assert.equal(type, 'url');
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };
  const start = () => handoff.start(linking, (value) => {
    calls.push(value);
    return process(value);
  });
  const stop = start();
  return { handoff, initial, calls, listeners, start, stop,
    emit(value) { listeners.forEach((listener) => listener({ url: value })); } };
}

test('cold launch processes the complete original initial URL once', async () => {
  const h = harness();
  const original = url('a%2Bb%3D');
  h.initial.resolve(original);
  await flush();
  assert.deepEqual(h.calls, [original]);
  assert.equal(h.handoff.getSnapshot().result.status, 'authenticated');
  h.stop();
});

for (const beforeMount of [true, false]) {
  test(`warm URL event ${beforeMount ? 'before' : 'after'} callback screen subscribes`, async () => {
    const h = harness();
    h.initial.resolve(null);
    await flush();
    let notifications = 0;
    let unsubscribe;
    if (!beforeMount) unsubscribe = h.handoff.subscribe(() => { notifications += 1; });
    h.emit(url('warm'));
    await flush();
    if (beforeMount) unsubscribe = h.handoff.subscribe(() => { notifications += 1; });
    assert.deepEqual(h.calls, [url('warm')]);
    assert.equal(h.handoff.getSnapshot().result.status, 'authenticated');
    if (!beforeMount) assert.equal(notifications, 2);
    unsubscribe();
    h.stop();
  });
}

for (const eventFirst of [true, false]) {
  test(`initial + event duplicates admitted once (${eventFirst ? 'event' : 'initial'} first)`, async () => {
    const h = harness();
    if (eventFirst) h.emit(url('same'));
    h.initial.resolve(url('same'));
    await flush();
    h.emit(url('same'));
    await flush();
    assert.deepEqual(h.calls, [url('same')]);
    h.stop();
  });
}

test('new runtime callback supersedes a pending stale initial URL', async () => {
  const h = harness();
  h.emit(url('new'));
  h.initial.resolve(url('old'));
  await flush();
  assert.deepEqual(h.calls, [url('new')]);
  h.stop();
});

test('a late older processing result cannot replace the newer callback result', async () => {
  const old = deferred();
  const h = harness((value) => value === url('old') ? old.promise : Promise.resolve({ status: 'authenticated' }));
  h.emit(url('old'));
  h.emit(url('new'));
  await flush();
  old.resolve({ status: 'failed', reason: 'invalid_callback' });
  await flush();
  assert.equal(h.handoff.getSnapshot().result.status, 'authenticated');
  h.stop();
});

test('unrelated and wrong-scheme links are ignored, including stale initial completion after cleanup', async () => {
  const h = harness();
  h.emit('https://example.test/auth/callback?code=secret');
  h.emit('com.mychawgee:///other?code=secret');
  h.stop();
  assert.equal(h.listeners.size, 0);
  h.initial.resolve(url('late'));
  h.emit(url('after-cleanup'));
  await flush();
  assert.deepEqual(h.calls, []);
});

test('effect cleanup/restart retains deduplication and source precedence', async () => {
  const h = harness();
  h.emit(url('event'));
  h.stop();
  const stopAgain = h.start();
  h.initial.resolve(url('stale-initial'));
  h.emit(url('event'));
  await flush();
  assert.deepEqual(h.calls, [url('event')]);
  assert.equal(h.listeners.size, 1);
  stopAgain();
  assert.equal(h.listeners.size, 0);
});

test('failed initial read still permits a later runtime callback', async () => {
  const h = harness();
  h.initial.reject(new Error('synthetic private details'));
  await flush();
  h.emit(url('event'));
  await flush();
  assert.deepEqual(h.calls, [url('event')]);
  h.stop();
});

test('both sources use one coordinator admission; strict parser rejects unsafe original payloads', async () => {
  for (const suffix of [
    '?code=ok', '?code=a&code=b', '?code=%E0%A4%A', '#access_token=secret',
    '?access_token=secret', '?refresh_token=secret', '?code=a&redirect_uri=evil',
    '?code=a&error=denied', '?type=recovery&code=a', '/wrong?code=a',
  ]) {
    const coordinator = new AuthCallbackCoordinator();
    let exchanges = 0;
    const h = harness((original) => coordinator.process(original, {
      exchangeCode: async () => {
        exchanges += 1;
        return { data: { session: { user: { id: 'synthetic' } } }, error: null };
      },
      reconcileSession: async () => ({ status: 'authenticated' }),
    }));
    const original = AUTH_CALLBACK_URI + suffix;
    h.emit(original);
    h.initial.resolve(original);
    h.emit(original);
    await flush();
    assert.deepEqual(h.calls, [original]);
    assert.equal(exchanges, suffix === '?code=ok' ? 1 : 0);
    assert.equal(h.handoff.getSnapshot().result.status, suffix === '?code=ok' ? 'authenticated' : 'failed');
    h.stop();
  }
});

test('callback waits for async auth readiness without losing or readmitting its URL', async () => {
  const ready = deferred();
  const h = harness(async () => {
    await ready.promise;
    return { status: 'authenticated' };
  });
  h.emit(url('waiting-for-auth'));
  h.initial.resolve(url('waiting-for-auth'));
  await flush();
  assert.equal(h.handoff.getSnapshot().status, 'processing');
  assert.equal(h.calls.length, 1);
  ready.resolve();
  await flush();
  assert.equal(h.handoff.getSnapshot().result.status, 'authenticated');
  h.stop();
});

test('handoff preserves coordinator cancellation during a pending exchange', async () => {
  const exchange = deferred();
  const coordinator = new AuthCallbackCoordinator();
  let reconciliations = 0;
  const h = harness((original) => coordinator.process(original, {
    exchangeCode: () => exchange.promise,
    reconcileSession: async () => { reconciliations += 1; return { status: 'authenticated' }; },
  }));
  h.emit(url('cancelled'));
  await flush();
  coordinator.cancel();
  exchange.resolve({ data: { session: { user: { id: 'synthetic' } } }, error: null });
  await flush();
  assert.equal(reconciliations, 0);
  assert.deepEqual(h.handoff.getSnapshot().result, { status: 'failed', reason: 'stale_operation' });
  h.stop();
});

test('capture readiness follows listener lifetime', () => {
  const h = harness();
  assert.equal(h.handoff.isReady(), true);
  h.stop();
  assert.equal(h.handoff.isReady(), false);
});

test('recovery initial/event duplicates retain a safe processing hint and perform one exchange', async () => {
  const exchange = deferred();
  const coordinator = new AuthCallbackCoordinator();
  let exchanges = 0;
  const h = harness((original) => coordinator.process(original, {
    beforeExchange: async () => {},
    exchangeCode: async () => { exchanges += 1; return exchange.promise; },
    admitSession: async (_session, redirectType) => redirectType === 'recovery'
      ? { status: 'recovery' } : { status: 'failed', reason: 'recovery_evidence_mismatch' },
    reconcileSession: async () => { assert.fail('recovery cannot bootstrap'); },
  }));
  const original = `${AUTH_CALLBACK_URI}?type=recovery&code=synthetic`;
  h.emit(original);
  h.initial.resolve(original);
  h.emit(original);
  await flush();
  assert.deepEqual(h.handoff.getSnapshot(), { status: 'processing', intent: 'recovery' });
  exchange.resolve({ data: { session: { user: { id: 'synthetic' } }, redirectType: 'recovery' }, error: null });
  await flush();
  assert.equal(exchanges, 1);
  assert.deepEqual(h.calls, [original]);
  assert.deepEqual(h.handoff.getSnapshot(), { status: 'complete', result: { status: 'recovery' } });
  h.stop();
});

test('late recovery result cannot overwrite a newer handoff result', async () => {
  const old = deferred();
  const h = harness((original) => original.includes('type=recovery') ? old.promise : Promise.resolve({ status: 'authenticated' }));
  h.emit(`${AUTH_CALLBACK_URI}?type=recovery&code=old`);
  h.emit(url('new'));
  await flush();
  old.resolve({ status: 'recovery' });
  await flush();
  assert.deepEqual(h.handoff.getSnapshot(), { status: 'complete', result: { status: 'authenticated' } });
  h.stop();
});
