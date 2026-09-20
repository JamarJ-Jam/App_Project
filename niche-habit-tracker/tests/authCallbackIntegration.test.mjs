import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuthCallbackCoordinator } from '../src/auth/authCallbackCoordinator.ts';
import { AUTH_CALLBACK_URI } from '../src/auth/authRedirect.ts';

const session = (id, token = `${id}-token`) => ({
  user: { id, email: `${id}@example.test`, email_confirmed_at: '2026-01-01T00:00:00Z' },
  access_token: token,
});

const deferred = () => {
  let resolve;
  const promise = new Promise((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
};

const callbackUrl = (code) => `${AUTH_CALLBACK_URI}?code=${encodeURIComponent(code)}`;

const dependencies = (exchangeCode, reconcileSession = async () => ({ status: 'authenticated' }), getCurrentSession = async () => null) => ({
  exchangeCode,
  reconcileSession,
  getCurrentSession,
});

test('one callback performs one exchange and replay is suppressed', async () => {
  let exchanges = 0;
  const coordinator = new AuthCallbackCoordinator();
  const deps = dependencies(async () => {
    exchanges += 1;
    return { data: { session: session('one') }, error: null };
  });

  assert.deepEqual(await coordinator.process(callbackUrl('one'), deps), { status: 'authenticated' });
  assert.deepEqual(await coordinator.process(callbackUrl('one'), deps), { status: 'replayed', reason: 'replayed' });
  assert.equal(exchanges, 1);
});

test('duplicate delivery during exchange shares one operation', async () => {
  const exchange = deferred();
  let exchanges = 0;
  const coordinator = new AuthCallbackCoordinator();
  const deps = dependencies(async () => {
    exchanges += 1;
    return exchange.promise;
  });

  const first = coordinator.process(callbackUrl('duplicate'), deps);
  const second = coordinator.process(callbackUrl('duplicate'), deps);
  exchange.resolve({ data: { session: session('duplicate') }, error: null });

  assert.deepEqual(await first, { status: 'authenticated' });
  assert.deepEqual(await second, { status: 'authenticated' });
  assert.equal(exchanges, 1);
});

test('missing verifier is classified without exposing provider details', async () => {
  const coordinator = new AuthCallbackCoordinator();
  const result = await coordinator.process(callbackUrl('missing-verifier'), dependencies(async () => ({
    data: { session: null },
    error: { code: 'invalid_grant', message: 'code verifier is missing' },
  })));

  assert.deepEqual(result, { status: 'failed', reason: 'device_verifier_missing' });
});

test('recovery callbacks are rejected before code exchange', async () => {
  const coordinator = new AuthCallbackCoordinator();
  let exchanges = 0;
  const result = await coordinator.process(`${AUTH_CALLBACK_URI}?type=recovery&code=recovery-code`, dependencies(async () => {
    exchanges += 1;
    return { data: { session: session('recovery') }, error: null };
  }));

  assert.deepEqual(result, { status: 'failed', reason: 'recovery_not_supported' });
  assert.equal(exchanges, 0);
});

test('logout or guest transition makes a pending exchange stale', async () => {
  const exchange = deferred();
  let reconciliations = 0;
  const coordinator = new AuthCallbackCoordinator();
  const pending = coordinator.process(callbackUrl('cancelled'), dependencies(
    async () => exchange.promise,
    async () => {
      reconciliations += 1;
      return { status: 'authenticated' };
    },
  ));

  coordinator.cancel();
  exchange.resolve({ data: { session: session('cancelled') }, error: null });

  assert.deepEqual(await pending, { status: 'failed', reason: 'stale_operation' });
  assert.equal(reconciliations, 0);
});

test('auth event side effect is reconciled once before exchange resolves', async () => {
  const exchange = deferred();
  let reconciliations = 0;
  const coordinator = new AuthCallbackCoordinator();
  const deps = dependencies(
    async () => exchange.promise,
    async (received) => {
      reconciliations += 1;
      assert.equal(received.user.id, 'event-user');
      return { status: 'authenticated' };
    },
  );

  const pending = coordinator.process(callbackUrl('event-first'), deps);
  await Promise.resolve();
  assert.equal(coordinator.handleAuthEvent(session('event-user'), deps.reconcileSession), true);
  exchange.resolve({ data: { session: session('event-user') }, error: null });

  assert.deepEqual(await pending, { status: 'authenticated' });
  assert.equal(reconciliations, 1);
});

test('conflicting identity fails closed without destroying the current session', async () => {
  let reconciliations = 0;
  const coordinator = new AuthCallbackCoordinator();
  const result = await coordinator.process(
    callbackUrl('conflict'),
    dependencies(
      async () => ({ data: { session: session('different-user') }, error: null }),
      async () => {
        reconciliations += 1;
        return { status: 'authenticated' };
      },
      async () => session('current-user'),
    ),
  );

  assert.deepEqual(result, { status: 'failed', reason: 'conflicting_identity' });
  assert.equal(reconciliations, 0);
});

test('session identity lookup failure fails closed before exchange', async () => {
  const coordinator = new AuthCallbackCoordinator();
  let exchanges = 0;
  const result = await coordinator.process(
    callbackUrl('unknown-baseline'),
    dependencies(
      async () => {
        exchanges += 1;
        return { data: { session: session('new-user') }, error: null };
      },
      async () => ({ status: 'authenticated' }),
      async () => { throw new Error('session lookup failed'); },
    ),
  );

  assert.deepEqual(result, { status: 'failed', reason: 'verification_failed' });
  assert.equal(exchanges, 0);
});

test('stale auth event is ignored after a newer operation cancels the callback', async () => {
  const exchange = deferred();
  let reconciliations = 0;
  const coordinator = new AuthCallbackCoordinator();
  const pending = coordinator.process(callbackUrl('stale-event'), dependencies(
    async () => exchange.promise,
    async () => {
      reconciliations += 1;
      return { status: 'authenticated' };
    },
  ));

  coordinator.cancel();
  assert.equal(coordinator.handleAuthEvent(session('stale-event'), async () => {
    reconciliations += 1;
    return { status: 'authenticated' };
  }), false);
  exchange.resolve({ data: { session: session('stale-event') }, error: null });

  assert.deepEqual(await pending, { status: 'failed', reason: 'stale_operation' });
  assert.equal(reconciliations, 0);
});
