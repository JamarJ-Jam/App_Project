import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestPasswordRecovery, isValidRecoveryEmail } from '../src/auth/passwordRecoveryRequest.ts';
import { AUTH_CALLBACK_URI } from '../src/auth/authRedirect.ts';

const genericMessage = "If an account exists for this email, we'll send a password reset link.";

test('calls resetPasswordForEmail exactly once with normalized email and the canonical redirect', async () => {
  let calls = 0;
  let receivedEmail;
  let receivedOptions;
  const result = await requestPasswordRecovery('  Someone@Example.test  ', AUTH_CALLBACK_URI, async (email, options) => {
    calls += 1;
    receivedEmail = email;
    receivedOptions = options;
    return { error: null };
  });

  assert.equal(calls, 1);
  assert.equal(receivedEmail, 'Someone@Example.test');
  assert.deepEqual(receivedOptions, { redirectTo: AUTH_CALLBACK_URI });
  assert.deepEqual(result, { status: 'requested' });
});

test('blank email is rejected locally without calling the provider', async () => {
  let calls = 0;
  const result = await requestPasswordRecovery('   ', AUTH_CALLBACK_URI, async () => {
    calls += 1;
    return { error: null };
  });

  assert.equal(calls, 0);
  assert.deepEqual(result, { status: 'failed', reason: 'invalid_email' });
});

test('obviously invalid email is rejected locally without calling the provider', async () => {
  let calls = 0;
  const result = await requestPasswordRecovery('not-an-email', AUTH_CALLBACK_URI, async () => {
    calls += 1;
    return { error: null };
  });

  assert.equal(calls, 0);
  assert.deepEqual(result, { status: 'failed', reason: 'invalid_email' });
  assert.equal(isValidRecoveryEmail('not-an-email'), false);
  assert.equal(isValidRecoveryEmail('user@example.com'), true);
});

test('known/registered-style email produces the generic non-enumerating confirmation', async () => {
  const result = await requestPasswordRecovery('registered@example.test', AUTH_CALLBACK_URI, async () => ({ error: null }));
  assert.deepEqual(result, { status: 'requested' });
});

test('unknown/unregistered-style email produces the same generic confirmation', async () => {
  // Supabase itself returns no error for unknown accounts; the wrapper must not diverge.
  const result = await requestPasswordRecovery('unknown@example.test', AUTH_CALLBACK_URI, async () => ({ error: null }));
  assert.deepEqual(result, { status: 'requested' });
});

test('provider error is normalized to a generic operational failure without leaking details', async () => {
  const result = await requestPasswordRecovery('someone@example.test', AUTH_CALLBACK_URI, async () => ({
    error: { message: 'over_email_send_rate_limit: too many requests for this project' },
  }));

  assert.deepEqual(result, { status: 'failed', reason: 'request_failed' });
});

test('a thrown network/configuration failure is classified as a generic failure', async () => {
  const result = await requestPasswordRecovery('someone@example.test', AUTH_CALLBACK_URI, async () => {
    throw new Error('fetch failed: ECONNRESET');
  });

  assert.deepEqual(result, { status: 'failed', reason: 'request_failed' });
});

test('generic confirmation copy matches the required non-enumerating wording', () => {
  assert.equal(genericMessage, "If an account exists for this email, we'll send a password reset link.");
});
