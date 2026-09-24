import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const authContextSource = readFileSync(new URL('../src/context/AuthContext.tsx', import.meta.url), 'utf8');
const accountScreenSource = readFileSync(new URL('../app/(tabs)/account.tsx', import.meta.url), 'utf8');

test('AuthContext exposes a requestPasswordRecovery action on the context type and default value', () => {
  assert.match(authContextSource, /requestPasswordRecovery: \(email: string\) => Promise<PasswordRecoveryRequestResult>;/);
  assert.match(authContextSource, /requestPasswordRecovery: async \(\) => \(\{ status: 'failed', reason: 'request_failed' \}\),/);
  assert.match(authContextSource, /\n\s*requestPasswordRecovery,\n\s*completePasswordRecovery,\n\s*getAuthenticatedAccessToken,\n\s*signOut,\n\s*\}\}>/);
});

test('getAuthenticatedAccessToken reads only the active singleton session', () => {
  const match = authContextSource.match(/const getAuthenticatedAccessToken = useCallback\(async \(\): Promise<string> => \{[\s\S]*?\n  \}, \[authState\]\);/);
  assert.ok(match, 'getAuthenticatedAccessToken implementation not found in AuthContext.tsx');
  const body = match[0];

  assert.ok(body.includes("authState !== 'authenticated'"));
  assert.ok(body.includes('getSupabaseClient'));
  assert.ok(body.includes('client.auth.getSession()'));
  assert.ok(!body.includes('AsyncStorage'));
});

test('requestPasswordRecovery wiring never bootstraps, mutates auth state, or touches the callback/lifecycle machinery', () => {
  const match = authContextSource.match(/const requestPasswordRecovery = useCallback\(async \(email: string\)[\s\S]*?\n {2}\}, \[mutateSdkSession\]\);/);
  assert.ok(match, 'requestPasswordRecovery implementation not found in AuthContext.tsx');
  const body = match[0];

  for (const forbidden of [
    'setAuthState', 'setUser(', 'reconcileSession', 'authCallback.current', 'authLifecycle.current',
    'bootstrapChawgeeAccount', 'publishRestriction', 'invalidateAuthWork', 'AsyncStorage.setItem',
    'signOut(', 'resolveRecovery',
  ]) {
    assert.ok(!body.includes(forbidden), `requestPasswordRecovery must not reference ${forbidden}`);
  }

  assert.ok(body.includes('AUTH_CALLBACK_URI'), 'must use the canonical callback constant, not a second redirect URI');
  assert.ok(body.includes('isValidRecoveryEmail'), 'must validate locally before contacting the provider');
  assert.ok(body.includes('resetPasswordForEmail'), 'must call the existing singleton client resetPasswordForEmail');
});

test('the recovery request does not introduce a second redirect URI literal', () => {
  const match = authContextSource.match(/const requestPasswordRecovery = useCallback\(async \(email: string\)[\s\S]*?\n {2}\}, \[mutateSdkSession\]\);/);
  assert.ok(match);
  assert.doesNotMatch(match[0], /com\.mychawgee:\/\/\//);
});

test('Account screen no longer claims production authentication is not connected', () => {
  assert.doesNotMatch(accountScreenSource, /production authentication service is connected/);
  assert.match(accountScreenSource, /requestPasswordRecovery/);
});

test('Account screen password reset reuses the AuthContext recovery-request source of truth', () => {
  const match = accountScreenSource.match(/const handlePasswordReset = async \(\) => \{[\s\S]*?\n {2}\};/);
  assert.ok(match, 'handlePasswordReset implementation not found');
  const body = match[0];
  assert.ok(body.includes('requestPasswordRecovery('));
  assert.ok(!body.includes('updateUser'), 'must not call updateUser directly from the placeholder action');
  assert.ok(!body.includes("router.push('/auth/reset-password')") && !body.includes('reset-password'),
    'must not directly expose the reset-password screen');
});

test('completePasswordRecovery independently enforces authorization before calling updateUser', () => {
  const match = authContextSource.match(/const completePasswordRecovery = useCallback\(async \(newPassword: string\)[\s\S]*?\n {2}\}, \[mutateSdkSession, publishRestriction\]\);/);
  assert.ok(match, 'completePasswordRecovery implementation not found in AuthContext.tsx');
  const body = match[0];

  assert.ok(body.includes("lifecycle.recoveryPhase === 'recovery'"), 'must gate on the authoritative recovery phase, not route/component state');
  assert.ok(body.includes('lifecycle.ownsOperation(owner)'), 'must gate on lifecycle operation ownership, not just phase');
  assert.ok(body.includes('isValidRecoveryPassword'), 'must validate locally before contacting the provider');
  assert.ok(body.includes("client.auth.updateUser({ password: newPassword })"), 'must call updateUser with only the password field');
  assert.ok(body.includes('resolveInterruption'), 'must terminate the recovery session using the existing lifecycle cleanup contract');

  for (const forbidden of [
    'AsyncStorage.setItem', 'console.log', 'console.error', 'console.warn',
    'createClient', 'new SupabaseClient',
  ]) {
    assert.ok(!body.includes(forbidden), `completePasswordRecovery must not reference ${forbidden}`);
  }
});

test('completePasswordRecovery never logs or persists the password', () => {
  assert.doesNotMatch(authContextSource, /console\.(log|warn|error|info|debug)\([^)]*newPassword/);
  assert.doesNotMatch(authContextSource, /AsyncStorage\.setItem\([^)]*newPassword/);
});

test('completePasswordRecovery does not introduce a second Supabase client or a duplicate callback URI', () => {
  const match = authContextSource.match(/const completePasswordRecovery = useCallback\(async \(newPassword: string\)[\s\S]*?\n {2}\}, \[mutateSdkSession, publishRestriction\]\);/);
  assert.ok(match);
  assert.doesNotMatch(match[0], /com\.mychawgee:\/\/\//);
  assert.ok(match[0].includes('getSupabaseClient'), 'must use the existing singleton client accessor');
});
