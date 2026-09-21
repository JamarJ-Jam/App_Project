import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAuthCallbackUrl, AUTH_CALLBACK_URI } from '../src/auth/authRedirect.ts';

test('parser accepts the canonical authorization-code callback', () => {
  assert.deepEqual(
    parseAuthCallbackUrl(`${AUTH_CALLBACK_URI}?code=abc123`),
    { kind: 'code', code: 'abc123' },
  );
});

test('parser accepts a supported error callback without exposing its details', () => {
  assert.deepEqual(
    parseAuthCallbackUrl(`${AUTH_CALLBACK_URI}?error=access_denied&error_code=otp_expired&error_description=Expired`),
    { kind: 'error', reason: 'verification_failed' },
  );
});

test('parser preserves recovery intent without treating it as a login callback', () => {
  assert.deepEqual(
    parseAuthCallbackUrl(`${AUTH_CALLBACK_URI}?type=recovery&code=recovery-code`),
    { kind: 'recovery', code: 'recovery-code' },
  );
});

for (const [name, url] of [
  ['wrong scheme', 'https://example.com/auth/callback?code=abc'],
  ['wrong path', 'com.mychawgee:///auth/other?code=abc'],
  ['missing code', `${AUTH_CALLBACK_URI}`],
  ['duplicate code', `${AUTH_CALLBACK_URI}?code=one&code=two`],
  ['malformed encoding', `${AUTH_CALLBACK_URI}?code=%E0%A4%A`],
  ['token fragment', `${AUTH_CALLBACK_URI}#access_token=secret`],
  ['access token query', `${AUTH_CALLBACK_URI}?access_token=secret`],
  ['arbitrary redirect', `${AUTH_CALLBACK_URI}?code=abc&redirect_uri=https%3A%2F%2Fevil.example`],
  ['code and error conflict', `${AUTH_CALLBACK_URI}?code=abc&error=access_denied`],
]) {
  test(`parser rejects ${name}`, () => {
    assert.deepEqual(parseAuthCallbackUrl(url), { kind: 'invalid', reason: 'invalid_callback' });
  });
}

test('canonical recovery retains the decoded code regardless of query ordering', () => {
  assert.deepEqual(parseAuthCallbackUrl(`${AUTH_CALLBACK_URI}?code=a%2Db&type=recovery`), { kind: 'recovery', code: 'a-b' });
  assert.deepEqual(parseAuthCallbackUrl(`${AUTH_CALLBACK_URI}?type=signup&code=a`), { kind: 'code', code: 'a', intent: 'signup' });
});

for (const suffix of [
  '?type=recovery', '?type=recovery&code=', '?type=recovery&code=%20',
  '?type=recovery&code=a%20b', '?type=recovery&code=%00',
  '?type=recovery&code=a&code=b', '?type=recovery&code=a&%63ode=b',
  '?type=recovery&type=recovery&code=a', '?type=recovery&type=signup&code=a',
  '?type=recovery&code=a&error=denied', '?type=recovery&code=a&error_code=expired',
  '?type=recovery&code=a&error_description=secret', '?type=recovery&error=expired',
  '?type=recovery&code=%E0%A4%A', '?type=recovery&code=a&unexpected=b',
  '?type=recovery&code=a#', '?type=recovery&code=a#access_token=secret',
  '?type=recovery&code=a&access_token=secret', '?type=recovery&code=a&refresh_token=secret',
  '?type=recovery&code=a&redirect_uri=https%3A%2F%2Fevil.example',
  '?type=recovery&code=a&next=%2Fdashboard', '?type=Recovery&code=a',
  '?type=%20recovery&code=a', '?type=recovery%20&code=a', '?Type=recovery&code=a',
]) {
  test(`recovery parser rejects ${suffix}`, () => {
    assert.equal(parseAuthCallbackUrl(AUTH_CALLBACK_URI + suffix).kind, 'invalid');
  });
}

for (const incoming of [
  'COM.MYCHAWGEE:///auth/callback?type=recovery&code=a',
  'com.mychawgee:///Auth/callback?type=recovery&code=a',
  'com.mychawgee://auth/callback?type=recovery&code=a',
  'com.mychawgee:///auth/callback/../callback?type=recovery&code=a',
  `${AUTH_CALLBACK_URI}?type=recovery&co\tde=a`,
  ` ${AUTH_CALLBACK_URI}?type=recovery&code=a`,
  `${AUTH_CALLBACK_URI}?type=recovery&code=a `,
]) {
  test('recovery parser rejects noncanonical envelope', () => {
    assert.equal(parseAuthCallbackUrl(incoming).kind, 'invalid');
  });
}
