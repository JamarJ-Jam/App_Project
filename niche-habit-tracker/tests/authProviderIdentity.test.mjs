import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateProviderIdentity, validateProviderIdentityStructure } from '../src/auth/authProviderIdentity.ts';

const user = (provider = 'email') => ({
  id: 'supabase-subject', email: 'same@gmail.com', email_confirmed_at: '2026-01-01',
  app_metadata: { provider, providers: [provider] }, user_metadata: {},
  identities: [{ id: 'provider-subject', identity_id: 'identity-id', user_id: 'supabase-subject', provider }],
});

const linkedUser = () => ({
  id: 'supabase-subject', email: 'same@gmail.com', email_confirmed_at: '2026-01-01',
  app_metadata: { provider: 'email', providers: ['email', 'google'] }, user_metadata: {},
  identities: [
    { id: 'email-subject', identity_id: 'email-identity', user_id: 'supabase-subject', provider: 'email' },
    { id: 'google-subject', identity_id: 'google-identity', user_id: 'supabase-subject', provider: 'google' },
  ],
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

test('coherent linked email and Google identities admit the expected provider', () => {
  const value = linkedUser();
  assert.deepEqual(evaluateProviderIdentity(value, 'email'), { status: 'eligible', provider: 'email' });
  assert.deepEqual(evaluateProviderIdentity(value, 'google'), { status: 'eligible', provider: 'google' });
});

test('neutral linked continuity validation never selects a provider', () => {
  assert.deepEqual(validateProviderIdentityStructure(linkedUser()), { status: 'coherent' });
  const malformed = linkedUser();
  malformed.identities[1].user_id = 'another-subject';
  assert.deepEqual(validateProviderIdentityStructure(malformed), { status: 'unsupported_identity' });
});

test('linked email context preserves email confirmation requirements', () => {
  const value = linkedUser();
  delete value.email_confirmed_at;
  assert.deepEqual(evaluateProviderIdentity(value, 'email'), { status: 'verification_required', provider: 'email' });
  assert.deepEqual(evaluateProviderIdentity(value, 'google'), { status: 'eligible', provider: 'google' });
});

test('linked identity evidence must corroborate every identity and requested provider', () => {
  const cases = {
    'first identity subject mismatch': () => ({ ...linkedUser(), identities: [{ ...linkedUser().identities[0], user_id: 'different-subject' }, linkedUser().identities[1]] }),
    'second identity subject mismatch': () => ({ ...linkedUser(), identities: [linkedUser().identities[0], { ...linkedUser().identities[1], user_id: 'different-subject' }] }),
    'duplicate identity provider': () => ({ ...linkedUser(), identities: [linkedUser().identities[0], { ...linkedUser().identities[0], identity_id: 'duplicate' }] }),
    'missing Google identity': () => ({ ...linkedUser(), identities: [linkedUser().identities[0]], app_metadata: { provider: 'email', providers: ['email'] } }),
    'missing email identity': () => ({ value: { ...linkedUser(), identities: [linkedUser().identities[1]], app_metadata: { provider: 'google', providers: ['google'] } }, expectedProvider: 'email' }),
    'malformed metadata providers': () => ({ ...linkedUser(), app_metadata: { provider: 'email', providers: 'email' } }),
    'duplicate metadata providers': () => ({ ...linkedUser(), app_metadata: { provider: 'email', providers: ['email', 'email'] } }),
    'unsupported metadata provider': () => ({ ...linkedUser(), app_metadata: { provider: 'apple', providers: ['email', 'google'] } }),
    'metadata provider absent from identities': () => ({ ...linkedUser(), app_metadata: { provider: 'email', providers: ['email', 'google'] }, identities: [linkedUser().identities[1], linkedUser().identities[0]] }),
    'metadata providers are not exact': () => ({ ...linkedUser(), app_metadata: { provider: 'email', providers: ['email'] } }),
  };
  for (const [name, create] of Object.entries(cases)) {
    const created = create();
    const value = 'value' in created ? created.value : created;
    const expectedProvider = 'expectedProvider' in created ? created.expectedProvider : 'google';
    if (name === 'metadata provider absent from identities') value.identities = [value.identities[1]];
    assert.deepEqual(evaluateProviderIdentity(value, expectedProvider), { status: 'unsupported_identity' }, name);
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

  const linked = linkedUser();
  linked.email = 'unrelated@example.test';
  linked.user_metadata = { provider: 'apple', providers: ['apple'], email_verified: true, email: 'spoofed@example.test' };
  assert.deepEqual(evaluateProviderIdentity(linked, 'google'), { status: 'eligible', provider: 'google' });
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
