import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateProviderIdentity } from '../src/auth/authProviderIdentity.ts';

const user = (provider = 'email') => ({
  id: 'supabase-subject', email: 'same@gmail.com', email_confirmed_at: '2026-01-01',
  app_metadata: { provider, providers: [provider] }, user_metadata: {},
  identities: [{ id: 'provider-subject', identity_id: 'identity-id', user_id: 'supabase-subject', provider }],
});

test('email keeps exactly the existing confirmation eligibility', () => {
  assert.deepEqual(evaluateProviderIdentity(user()), { status: 'eligible', provider: 'email' });
  for (const email_confirmed_at of [undefined, null, '']) {
    assert.deepEqual(evaluateProviderIdentity({ ...user(), email_confirmed_at }),
      { status: 'verification_required', provider: 'email' });
  }
});

test('Google identity is eligible independently of email or email confirmation', () => {
  for (const email_confirmed_at of [undefined, null, '', '2026-01-01']) {
    assert.deepEqual(evaluateProviderIdentity({ ...user('google'), email: undefined, email_confirmed_at }),
      { status: 'eligible', provider: 'google' });
  }
});

test('same email, arbitrary domain and editable metadata never select a provider', () => {
  for (const provider of ['email', 'google']) {
    for (const email of ['same@gmail.com', 'same@example.test', undefined]) {
      const value = { ...user(provider), email, user_metadata: { provider: 'apple', providers: ['apple'], email_verified: true } };
      assert.equal(evaluateProviderIdentity(value).provider, provider);
    }
  }
  const value = { ...user(), email_confirmed_at: undefined, user_metadata: { provider: 'google', email_verified: true } };
  assert.equal(evaluateProviderIdentity(value).status, 'verification_required');
});

const invalid = {
  'unknown provider': () => user('unknown'),
  'unsupported provider': () => user('apple'),
  'missing identities': () => ({ ...user(), identities: undefined }),
  'empty identities': () => ({ ...user(), identities: [] }),
  'missing app metadata': () => ({ ...user(), app_metadata: undefined }),
  'missing signup provider': () => ({ ...user(), app_metadata: { providers: ['email'] } }),
  'conflicting signup provider': () => ({ ...user('google'), app_metadata: { provider: 'email' } }),
  'conflicting provider list': () => ({ ...user(), app_metadata: { provider: 'email', providers: ['google'] } }),
  'linked providers': () => ({ ...user(), app_metadata: { provider: 'email', providers: ['email', 'google'] } }),
  'empty provider list': () => ({ ...user(), app_metadata: { provider: 'email', providers: [] } }),
  'malformed provider list': () => ({ ...user(), app_metadata: { provider: 'email', providers: 'email' } }),
  'multiple identities': () => ({ ...user(), identities: [...user().identities, ...user('google').identities] }),
  'duplicate identities': () => ({ ...user(), identities: [...user().identities, ...user().identities] }),
  'foreign identity subject': () => ({ ...user(), identities: [{ ...user().identities[0], user_id: 'different-subject' }] }),
  'anonymous user': () => ({ ...user(), is_anonymous: true }),
  'editable metadata alone': () => ({ ...user(), identities: undefined, app_metadata: {}, user_metadata: { provider: 'google' } }),
};
for (const [name, value] of Object.entries(invalid)) {
  test(`${name} fails closed`, () => {
    assert.deepEqual(evaluateProviderIdentity(value()), { status: 'unsupported_identity' });
  });
}

test('optional SDK provider list can be absent when identity and signup provider agree', () => {
  const value = user('google');
  delete value.app_metadata.providers;
  assert.deepEqual(evaluateProviderIdentity(value), { status: 'eligible', provider: 'google' });
});
