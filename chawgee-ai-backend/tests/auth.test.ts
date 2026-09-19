import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { ConfigurationError, getAuthConfig, type AuthConfig } from '../src/config.js';
import {
  AuthenticationError,
  createTokenVerifier,
  parseBearerToken,
  publicAuthenticationFailure,
} from '../src/auth/tokenVerifier.js';

const issuer = 'https://project.supabase.co/auth/v1';
const audience = 'authenticated';
const config: AuthConfig = Object.freeze({
  issuer,
  jwksUrl: 'https://project.supabase.co/auth/v1/.well-known/jwks.json',
  audience,
  allowedAlgorithms: ['ES256'],
});

const createFixture = async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key';
  jwk.alg = 'ES256';
  jwk.use = 'sig';
  const verifier = createTokenVerifier(config, createLocalJWKSet({ keys: [jwk] }));
  const sign = ({
    issuerValue = issuer,
    audienceValue = audience,
    subject,
    expiration = '5m',
  }: {
    issuerValue?: string;
    audienceValue?: string;
    subject?: string;
    expiration?: string;
  } = {}) => {
    let builder = new SignJWT()
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setIssuer(issuerValue)
      .setAudience(audienceValue)
      .setIssuedAt()
      .setExpirationTime(expiration);
    if (subject !== undefined) builder = builder.setSubject(subject);
    return builder.sign(privateKey);
  };
  return { verifier, sign };
};

const changeAlgorithm = (token: string, algorithm: string): string => {
  const [header, payload, signature] = token.split('.');
  const changedHeader = Buffer.from(JSON.stringify({ alg: algorithm, kid: 'test-key' })).toString('base64url');
  return `${changedHeader}.${payload}.${signature}`;
};

test('auth configuration is lazy, explicit, and rejects malformed values', () => {
  assert.throws(() => getAuthConfig({}), ConfigurationError);
  const valid = getAuthConfig({
    SUPABASE_AUTH_ISSUER: issuer,
    SUPABASE_AUTH_JWKS_URL: config.jwksUrl,
    SUPABASE_AUTH_AUDIENCE: audience,
    SUPABASE_AUTH_ALLOWED_ALGORITHMS: ' ES256 ',
  });
  assert.deepEqual(valid, config);
  assert.throws(() => getAuthConfig({
    SUPABASE_AUTH_ISSUER: 'http://issuer.invalid',
    SUPABASE_AUTH_JWKS_URL: config.jwksUrl,
    SUPABASE_AUTH_AUDIENCE: audience,
    SUPABASE_AUTH_ALLOWED_ALGORITHMS: 'RS256',
  }), ConfigurationError);
});

test('verifies a valid ES256 token and returns only trusted identity fields', async () => {
  const fixture = await createFixture();
  const token = await fixture.sign({ subject: 'external-subject' });
  assert.deepEqual(await fixture.verifier.verify(token), {
    issuer,
    subject: 'external-subject',
    authProvider: 'supabase',
  });
});

test('rejects invalid signature, issuer, audience, expiration, algorithm, and malformed tokens', async () => {
  const fixture = await createFixture();
  const valid = await fixture.sign({ subject: 'external-subject' });
  const altered = `${valid.slice(0, -1)}${valid.endsWith('a') ? 'b' : 'a'}`;
  await assert.rejects(fixture.verifier.verify(altered), AuthenticationError);
  await assert.rejects(fixture.verifier.verify(await fixture.sign({ issuerValue: 'https://wrong.invalid', subject: 'external-subject' })), AuthenticationError);
  await assert.rejects(fixture.verifier.verify(await fixture.sign({ audienceValue: 'wrong-audience', subject: 'external-subject' })), AuthenticationError);
  await assert.rejects(fixture.verifier.verify(await fixture.sign({ expiration: '-1s', subject: 'external-subject' })), AuthenticationError);
  await assert.rejects(fixture.verifier.verify(changeAlgorithm(valid, 'RS256')), AuthenticationError);
  await assert.rejects(fixture.verifier.verify('not.a.jwt'), AuthenticationError);
});

test('rejects missing and empty subjects', async () => {
  const fixture = await createFixture();
  await assert.rejects(fixture.verifier.verify(await fixture.sign()), AuthenticationError);
  await assert.rejects(fixture.verifier.verify(await fixture.sign({ subject: ' ', })), AuthenticationError);
});

test('parses only an unambiguous Bearer header', () => {
  assert.equal(parseBearerToken('Bearer token-value'), 'token-value');
  assert.equal(parseBearerToken('bearer token-value'), 'token-value');
  for (const value of [undefined, ['Bearer one', 'Bearer two'], 'Basic token', 'Bearer', 'Bearer one two', 'Bearer ']) {
    assert.throws(() => parseBearerToken(value), AuthenticationError);
  }
});

test('public authentication failures are generic and do not expose verifier details', () => {
  assert.deepEqual(publicAuthenticationFailure(), {
    status: 401,
    body: { success: false, error: 'Unauthorized' },
  });
  assert.equal(new AuthenticationError().message, 'Unauthorized');
});