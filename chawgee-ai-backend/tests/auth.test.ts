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
  allowedAlgorithms: ['ES256'] as const,
});

const subject = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';

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
    subjectValue = subject,
    includeSubject = true,
    expiration = '5m',
    includeExpiration = true,
    role = 'authenticated',
    includeRole = true,
    isAnonymous = false,
    includeIsAnonymous = true,
    aal = 'aal1',
    sessionIdValue = sessionId,
    appMetadata = { provider: 'email', providers: ['email'] },
    additionalClaims = {},
    notBefore,
  }: {
    issuerValue?: string;
    audienceValue?: string | string[];
    subjectValue?: string;
    includeSubject?: boolean;
    expiration?: string | number;
    includeExpiration?: boolean;
    role?: unknown;
    includeRole?: boolean;
    isAnonymous?: unknown;
    includeIsAnonymous?: boolean;
    aal?: unknown;
    sessionIdValue?: unknown;
    appMetadata?: unknown;
    additionalClaims?: Record<string, unknown>;
    notBefore?: string | number;
  } = {}) => {
    const claims: Record<string, unknown> = {
      aal,
      session_id: sessionIdValue,
      app_metadata: appMetadata,
      ...additionalClaims,
      ...(includeRole ? { role } : {}),
      ...(includeIsAnonymous ? { is_anonymous: isAnonymous } : {}),
    };
    let builder = new SignJWT(claims)
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setIssuer(issuerValue)
      .setAudience(audienceValue)
      .setIssuedAt();
    if (includeExpiration) builder = builder.setExpirationTime(expiration);
    if (includeSubject && subjectValue !== undefined) builder = builder.setSubject(subjectValue);
    if (notBefore !== undefined) builder = builder.setNotBefore(notBefore);
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
  assert.throws(() => getAuthConfig({
    SUPABASE_AUTH_ISSUER: issuer,
    SUPABASE_AUTH_JWKS_URL: config.jwksUrl,
    SUPABASE_AUTH_AUDIENCE: 'other-audience',
    SUPABASE_AUTH_ALLOWED_ALGORITHMS: 'ES256',
  }), ConfigurationError);
});

test('preserves email, Google, and linked user sessions at either assurance level', async () => {
  const fixture = await createFixture();
  for (const [name, appMetadata] of [
    ['email', { provider: 'email', providers: ['email'] }],
    ['google', { provider: 'google', providers: ['google'] }],
    ['linked', { provider: 'email', providers: ['email', 'google'] }],
  ] as const) {
    for (const aal of ['aal1', 'aal2']) {
      const token = await fixture.sign({
        aal,
        appMetadata,
        audienceValue: [audience, 'other-audience'],
        additionalClaims: {
        user_metadata: { provider: 'untrusted-provider', email: 'spoofed@example.invalid' },
        email: 'user@example.invalid',
        },
      });
      assert.deepEqual(await fixture.verifier.verify(token), {
        issuer,
        subject,
        authProvider: 'supabase',
      }, `${name}/${aal}`);
    }
  }
});

test('rejects invalid signature, issuer, audience, expiration, nbf, algorithm, and malformed tokens', async () => {
  const fixture = await createFixture();
  const valid = await fixture.sign();
  const altered = `${valid.slice(0, -1)}${valid.endsWith('a') ? 'b' : 'a'}`;
  await assert.rejects(fixture.verifier.verify(altered), AuthenticationError);
  await assert.rejects(fixture.verifier.verify(await fixture.sign({ issuerValue: 'https://wrong.invalid' })), AuthenticationError);
  await assert.rejects(fixture.verifier.verify(await fixture.sign({ audienceValue: 'wrong-audience' })), AuthenticationError);
  await assert.rejects(fixture.verifier.verify(await fixture.sign({ audienceValue: ['wrong-audience'] })), AuthenticationError);
  await assert.rejects(fixture.verifier.verify(await fixture.sign({ includeExpiration: false })), AuthenticationError);
  await assert.rejects(fixture.verifier.verify(await fixture.sign({ expiration: '-1s' })), AuthenticationError);
  await assert.rejects(fixture.verifier.verify(await fixture.sign({
    includeExpiration: false,
    additionalClaims: { exp: 'not-a-numeric-date' },
  })), AuthenticationError);
  await assert.rejects(fixture.verifier.verify(await fixture.sign({ notBefore: '1h' })), AuthenticationError);
  await assert.rejects(fixture.verifier.verify(await fixture.sign({ additionalClaims: { nbf: 'not-a-numeric-date' } })), AuthenticationError);
  await assert.rejects(fixture.verifier.verify(changeAlgorithm(valid, 'RS256')), AuthenticationError);
  await assert.rejects(fixture.verifier.verify('not.a.jwt'), AuthenticationError);
});

test('rejects missing, malformed, and noncanonical subjects', async () => {
  const fixture = await createFixture();
  await assert.rejects(fixture.verifier.verify(await fixture.sign({ includeSubject: false })), AuthenticationError);
  for (const subjectValue of ['', ' ', 'not-a-uuid', '11111111-1111-4111-8111-11111111111A']) {
    await assert.rejects(fixture.verifier.verify(await fixture.sign({ subjectValue })), AuthenticationError);
  }
  await assert.rejects(fixture.verifier.verify(await fixture.sign({
    includeSubject: false,
    additionalClaims: { sub: 42 },
  })), AuthenticationError);
});

test('rejects tokens without a permanent authenticated-user role', async () => {
  const fixture = await createFixture();
  for (const options of [
    { includeRole: false },
    { role: 'anon' },
    { role: 'service_role' },
    { role: 42 },
    { includeIsAnonymous: false },
    { isAnonymous: true },
    { isAnonymous: 'false' },
  ]) {
    await assert.rejects(fixture.verifier.verify(await fixture.sign(options)), AuthenticationError);
  }
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