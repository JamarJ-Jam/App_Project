import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import type { VerifiedIdentity } from '../src/auth/tokenVerifier.js';
import { createDatabase, type SqlExecutor } from '../src/db/database.js';
import { createIdentityService } from '../src/services/identityService.js';
import {
  getIntegrationRuntimeConfig,
  integrationStatusFixtures,
  IntegrationConfigurationError,
} from '../scripts/integrationTestConfig.js';

const identity = (subject: string): VerifiedIdentity => ({
  issuer: 'https://integration-test.invalid/auth/v1',
  subject,
  authProvider: 'supabase',
});

const runtimePool = () => new Pool(getIntegrationRuntimeConfig().pool);

const withPool = async <T>(work: (pool: Pool) => Promise<T>): Promise<T> => {
  const pool = runtimePool();
  try { return await work(pool); }
  finally { await pool.end(); }
};

const withService = async <T>(work: (service: ReturnType<typeof createIdentityService>) => Promise<T>): Promise<T> => {
  const database = createDatabase(() => getIntegrationRuntimeConfig().pool);
  const service = createIdentityService(database);
  try { return await work(service); }
  finally { await database.close(); }
};

const count = async (pool: Pool, text: string, values: unknown[] = []): Promise<number> => {
  const result = await pool.query<{ count: string }>(text, values);
  return Number(result.rows[0]?.count ?? NaN);
};

test('test-only runtime configuration fails closed without normal database fallbacks', () => {
  assert.throws(
    () => getIntegrationRuntimeConfig({ DATABASE_URL: 'postgresql://normal@localhost/postgres' }),
    IntegrationConfigurationError,
  );
  assert.throws(
    () => getIntegrationRuntimeConfig({
      CHAWGEE_IT_RUNTIME_DATABASE_URL: 'postgresql://wrong@localhost/postgres',
      CHAWGEE_IT_SSL_CA_FILE: '.local-certs/prod-ca-2021-test.crt',
    }),
    IntegrationConfigurationError,
  );
});

test('runtime role has only required identity permissions', async () => {
  await withPool(async (pool) => {
    const role = await pool.query<{ current_user: string; session_user: string; database: string }>(
      'SELECT current_user, session_user, current_database() AS database',
    );
    assert.deepEqual(role.rows[0], {
      current_user: 'chawgee_it_runtime',
      session_user: 'chawgee_it_runtime',
      database: 'postgres',
    });
    await assert.rejects(pool.query('CREATE TABLE chawgee.integration_permission_probe (id integer)'), { code: '42501' });
    await assert.rejects(pool.query('TRUNCATE TABLE chawgee.accounts'), { code: '42501' });
    await assert.rejects(pool.query('SELECT * FROM public.chawgee_migrations'), { code: '42501' });
  });
});

test('PostgreSQL constraints reject invalid statuses, orphan bindings, and duplicate identities', async () => {
  await withPool(async (pool) => {
    const issuer = 'https://integration-test.invalid/constraints';
    const subject = `constraint-${randomUUID()}`;
    const firstAccount = randomUUID();
    const secondAccount = randomUUID();
    const firstBinding = randomUUID();

    await assert.rejects(
      pool.query('INSERT INTO chawgee.accounts (id, status) VALUES ($1, $2)', [randomUUID(), 'invalid']),
      { code: '23514' },
    );
    await assert.rejects(
      pool.query(
        `INSERT INTO chawgee.auth_bindings (id, account_id, auth_provider, issuer, subject)
         VALUES ($1, $2, 'supabase', $3, $4)`,
        [randomUUID(), randomUUID(), issuer, subject],
      ),
      { code: '23503' },
    );

    try {
      await pool.query('INSERT INTO chawgee.accounts (id) VALUES ($1), ($2)', [firstAccount, secondAccount]);
      await pool.query(
        `INSERT INTO chawgee.auth_bindings (id, account_id, auth_provider, issuer, subject)
         VALUES ($1, $2, 'supabase', $3, $4)`,
        [firstBinding, firstAccount, issuer, subject],
      );
      await assert.rejects(
        pool.query(
          `INSERT INTO chawgee.auth_bindings (id, account_id, auth_provider, issuer, subject)
           VALUES ($1, $2, 'supabase', $3, $4)`,
          [randomUUID(), secondAccount, issuer, subject],
        ),
        { code: '23505' },
      );
    } finally {
      await pool.query('DELETE FROM chawgee.auth_bindings WHERE id = $1', [firstBinding]);
      await pool.query('DELETE FROM chawgee.accounts WHERE id = ANY($1::uuid[])', [[firstAccount, secondAccount]]);
    }
  });
});

test('concurrent provisioning keeps exactly one bound permanent account', async () => {
  let arrivals = 0;
  let releaseBarrier: (() => void) | undefined;
  const barrier = new Promise<void>((resolve) => { releaseBarrier = resolve; });
  let candidateInserts = 0;
  let bindingInserts = 0;

  const coordinatedService = () => {
    const database = createDatabase(() => getIntegrationRuntimeConfig().pool);
    let observedInitialLookup = false;
    const coordinated = {
      query: database.query,
      transaction: async <T>(work: (sql: SqlExecutor) => Promise<T>): Promise<T> => database.transaction(async (sql) => work({
        query: async (text, values) => {
          if (!observedInitialLookup && text.includes('FROM chawgee.auth_bindings AS b')) {
            observedInitialLookup = true;
            arrivals += 1;
            if (arrivals === 2) releaseBarrier!();
            await barrier;
          }
          if (text.includes('INSERT INTO chawgee.accounts')) candidateInserts += 1;
          if (text.includes('INSERT INTO chawgee.auth_bindings')) bindingInserts += 1;
          return sql.query(text, values);
        },
      })),
    };
    return { database, service: createIdentityService(coordinated) };
  };

  const first = coordinatedService();
  const second = coordinatedService();
  const contestedIdentity = identity(`concurrent-${randomUUID()}`);
  try {
    const [left, right] = await Promise.all([
      first.service.resolveOrProvision(contestedIdentity),
      second.service.resolveOrProvision(contestedIdentity),
    ]);
    assert.equal(arrivals, 2);
    assert.equal(candidateInserts, 2);
    assert.equal(bindingInserts, 2);
    assert.equal(left.accountId, right.accountId);
    assert.equal(left.accountStatus, 'active');
    assert.equal(right.accountStatus, 'active');

    await withPool(async (pool) => {
      assert.equal(await count(pool,
        `SELECT count(*)::text AS count
         FROM chawgee.auth_bindings
         WHERE issuer = $1 AND subject = $2`,
        [contestedIdentity.issuer, contestedIdentity.subject],
      ), 1);
      assert.equal(await count(pool,
        `SELECT count(*)::text AS count
         FROM chawgee.accounts AS a
         JOIN chawgee.auth_bindings AS b ON b.account_id = a.id
         WHERE b.issuer = $1 AND b.subject = $2`,
        [contestedIdentity.issuer, contestedIdentity.subject],
      ), 1);
      assert.equal(await count(pool,
        `SELECT count(*)::text AS count
         FROM chawgee.accounts AS a
         WHERE NOT EXISTS (SELECT 1 FROM chawgee.auth_bindings AS b WHERE b.account_id = a.id)`,
      ), 0);
    });
  } finally {
    await Promise.all([first.database.close(), second.database.close()]);
  }
});

test('subsequent login is idempotent and distinct identities receive distinct accounts', async () => {
  await withService(async (service) => {
    const firstIdentity = identity(`idempotent-${randomUUID()}`);
    const secondIdentity = identity(`independent-${randomUUID()}`);
    const initial = await service.resolveOrProvision(firstIdentity);
    const repeat = await service.resolveOrProvision(firstIdentity);
    const independent = await service.resolveOrProvision(secondIdentity);

    assert.equal(initial.accountId, repeat.accountId);
    assert.notEqual(initial.accountId, independent.accountId);
    await withPool(async (pool) => {
      assert.equal(await count(pool,
        'SELECT count(*)::text AS count FROM chawgee.auth_bindings WHERE issuer = $1 AND subject = $2',
        [firstIdentity.issuer, firstIdentity.subject],
      ), 1);
      assert.equal(await count(pool,
        'SELECT count(*)::text AS count FROM chawgee.auth_bindings WHERE issuer = $1 AND subject = $2',
        [secondIdentity.issuer, secondIdentity.subject],
      ), 1);
    });
  });
});

test('suspended and pending-deletion accounts resolve without reprovisioning', async () => {
  await withService(async (service) => {
    const { issuer, suspended, pendingDeletion } = integrationStatusFixtures;
    const resolvedSuspended = await service.resolveOrProvision(identity(suspended.subject));
    const resolvedPendingDeletion = await service.resolveOrProvision(identity(pendingDeletion.subject));

    assert.equal(resolvedSuspended.accountId, suspended.accountId);
    assert.equal(resolvedSuspended.accountStatus, 'suspended');
    assert.equal(resolvedPendingDeletion.accountId, pendingDeletion.accountId);
    assert.equal(resolvedPendingDeletion.accountStatus, 'pending_deletion');
    assert.equal(resolvedSuspended.identity.issuer, issuer);
    assert.equal(resolvedPendingDeletion.identity.issuer, issuer);
  });
});