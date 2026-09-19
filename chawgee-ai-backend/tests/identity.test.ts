import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QueryResult, QueryResultRow } from 'pg';
import type { VerifiedIdentity } from '../src/auth/tokenVerifier.js';
import type { SqlExecutor } from '../src/db/database.js';
import {
  createIdentityService,
  IdentityResolutionConcurrencyError,
} from '../src/services/identityService.js';
import {
  deleteUnboundCandidate,
  insertBindingIfAbsent,
  resolveIdentity,
} from '../src/repositories/identityRepository.js';

const identity: VerifiedIdentity = {
  issuer: 'https://project.supabase.co/auth/v1',
  subject: 'external-subject',
  authProvider: 'supabase',
};

const result = <Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> => ({
  rows,
  rowCount: rows.length,
  command: 'SELECT',
  oid: 0,
  fields: [],
});

const fakeDatabase = (responses: QueryResult[] = []) => {
  const queries: Array<{ text: string; values?: unknown[] }> = [];
  const transactionQueries: Array<{ text: string; values?: unknown[] }> = [];
  let responseIndex = 0;
  let transactionCount = 0;
  const query: SqlExecutor['query'] = async (text, values) => {
    queries.push({ text, values });
    return responses[responseIndex++] ?? result([]);
  };
  const database = {
    query,
    transaction: async <T>(work: (sql: SqlExecutor) => Promise<T>) => {
      transactionCount += 1;
      const sql: SqlExecutor = {
        query: async (text, values) => {
          transactionQueries.push({ text, values });
          return responses[responseIndex++] ?? result([]);
        },
      };
      return work(sql);
    },
  };
  return { database, queries, transactionQueries, transactionCount: () => transactionCount };
};

test('existing active, suspended, and pending identities resolve without provisioning', async () => {
  for (const status of ['active', 'suspended', 'pending_deletion'] as const) {
    const fake = fakeDatabase([result([]), result([{ account_id: 'account-1', status }])]);
    const resolved = await createIdentityService(fake.database).resolveOrProvision(identity);
    assert.equal(resolved.accountId, 'account-1');
    assert.equal(resolved.accountStatus, status);
    assert.equal(fake.transactionCount(), 1);
    assert.equal(fake.transactionQueries.length, 2);
  }
});

test('unknown identity provisions a server-generated account and binding', async () => {
  const fake = fakeDatabase([
    result([]),
    result([]),
    result([{ id: 'generated-account', status: 'active' }]),
    result([{ account_id: 'generated-account' }]),
  ]);
  const resolved = await createIdentityService(fake.database).resolveOrProvision(identity);
  assert.equal(resolved.accountId, 'generated-account');
  assert.equal(resolved.accountStatus, 'active');
  assert.match(String(fake.transactionQueries[2].values?.[0]), /^[0-9a-f-]{36}$/);
  assert.match(String(fake.transactionQueries[3].values?.[0]), /^[0-9a-f-]{36}$/);
  assert.deepEqual(fake.transactionQueries[3].values?.slice(2), [
    'supabase', identity.issuer, identity.subject,
  ]);
});

test('race loser cleans only its candidate, commits, then resolves the winner separately', async () => {
  const fake = fakeDatabase([
    result([]),
    result([]),
    result([{ id: 'loser-candidate', status: 'active' }]),
    result([]),
    result([]),
    result([{ account_id: 'winner-account', status: 'suspended' }]),
  ]);
  const resolved = await createIdentityService(fake.database).resolveOrProvision(identity);
  assert.equal(resolved.accountId, 'winner-account');
  assert.equal(resolved.accountStatus, 'suspended');
  assert.match(fake.transactionQueries[4].text, /DELETE FROM chawgee\.accounts/);
  assert.deepEqual(fake.transactionQueries[4].values, ['loser-candidate']);
  assert.equal(fake.queries.length, 1);
  assert.match(fake.queries[0].text, /auth_bindings/);
});

test('winner lookup returns immediately without retry when the winner is visible', async () => {
  const fake = fakeDatabase([
    result([]),
    result([]),
    result([{ id: 'loser-candidate', status: 'active' }]),
    result([]),
    result([]),
    result([{ account_id: 'winner-account', status: 'active' }]),
  ]);
  let waits = 0;
  const resolved = await createIdentityService(fake.database, {
    wait: async () => { waits += 1; },
  }).resolveOrProvision(identity);
  assert.equal(resolved.accountId, 'winner-account');
  assert.equal(waits, 0);
  assert.equal(fake.transactionCount(), 1);
  assert.equal(fake.queries.length, 1);
});

test('winner lookup retries after a transient absence and returns the actual winner', async () => {
  const fake = fakeDatabase([
    result([]),
    result([]),
    result([{ id: 'loser-candidate', status: 'active' }]),
    result([]),
    result([]),
    result([]),
    result([]),
    result([{ account_id: 'winner-account', status: 'pending_deletion' }]),
  ]);
  const waits: number[] = [];
  const resolved = await createIdentityService(fake.database, {
    wait: async (milliseconds) => { waits.push(milliseconds); },
  }).resolveOrProvision(identity);
  assert.equal(resolved.accountId, 'winner-account');
  assert.equal(resolved.accountStatus, 'pending_deletion');
  assert.deepEqual(waits, [5, 5]);
  assert.equal(fake.transactionCount(), 1);
  assert.equal(fake.queries.length, 3);
});

test('winner lookup stops after the bounded attempts and throws a typed error', async () => {
  const fake = fakeDatabase([
    result([]),
    result([]),
    result([{ id: 'loser-candidate', status: 'active' }]),
    result([]),
    result([]),
    result([]),
    result([]),
  ]);
  let waits = 0;
  await assert.rejects(
    createIdentityService(fake.database, {
      wait: async () => { waits += 1; },
    }).resolveOrProvision(identity),
    IdentityResolutionConcurrencyError,
  );
  assert.equal(waits, 2);
  assert.equal(fake.transactionCount(), 1);
  assert.equal(fake.queries.length, 3);
  assert.equal(fake.transactionQueries.filter(({ text }) => text.includes('INSERT INTO chawgee.accounts')).length, 1);
});

test('binding insertion names the identity constraint and remains parameterized', async () => {
  const calls: Array<{ text: string; values?: unknown[] }> = [];
  const sql: SqlExecutor = {
    query: async (text, values) => {
      calls.push({ text, values });
      return result([{ account_id: 'account-1' }]);
    },
  };
  await insertBindingIfAbsent(sql, 'account-1', 'binding-1', identity);
  assert.match(calls[0].text, /ON CONFLICT ON CONSTRAINT auth_bindings_identity_unique DO NOTHING/);
  assert.deepEqual(calls[0].values, ['binding-1', 'account-1', 'supabase', identity.issuer, identity.subject]);
  assert.ok(!calls[0].text.includes(identity.subject));
});

test('candidate cleanup is guarded against deleting bound accounts', async () => {
  let text = '';
  let values: unknown[] | undefined;
  const sql: SqlExecutor = {
    query: async (queryText, queryValues) => {
      text = queryText;
      values = queryValues;
      return result([]);
    },
  };
  await deleteUnboundCandidate(sql, 'candidate-account');
  assert.match(text, /NOT EXISTS/);
  assert.deepEqual(values, ['candidate-account']);
});

test('identity lookup uses exact issuer and subject, never email', async () => {
  let values: unknown[] | undefined;
  const sql: SqlExecutor = {
    query: async (_text, queryValues) => {
      values = queryValues;
      return result([]);
    },
  };
  await resolveIdentity(sql, identity);
  assert.deepEqual(values, [identity.issuer, identity.subject]);
});

test('partial provisioning failure escapes the transaction callback', async () => {
  const transactionQueries: string[] = [];
  const database = {
    query: async () => result([]),
    transaction: async <T>(work: (sql: SqlExecutor) => Promise<T>) => {
      const sql: SqlExecutor = {
        query: async (text) => {
          transactionQueries.push(text);
          if (text.includes('INSERT INTO chawgee.accounts')) throw new Error('simulated failure');
          return result([]);
        },
      };
      return work(sql);
    },
  };

  await assert.rejects(
    createIdentityService(database).resolveOrProvision(identity),
    /simulated failure/,
  );
  assert.equal(transactionQueries.some((text) => text.includes('INSERT INTO chawgee.auth_bindings')), false);
});