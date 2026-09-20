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
    { kind: 'recovery' },
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
