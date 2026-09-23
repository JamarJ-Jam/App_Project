import dotenv from 'dotenv';
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { runner } from 'node-pg-migrate';
import {
  getIntegrationAdminConfig,
  getIntegrationRuntimeConfig,
  integrationStatusFixtures,
  integrationTarget,
  IntegrationConfigurationError,
} from './integrationTestConfig.js';

dotenv.config({ path: '.env.integration.local', quiet: true });

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const testFile = fileURLToPath(new URL('../tests/identity.integration.test.ts', import.meta.url));
const LOCK_KEY = 71104211;

const verifyAdminTarget = async (pool: Pool): Promise<void> => {
  const result = await pool.query<{ database: string; session_user: string }>(
    'SELECT current_database() AS database, session_user',
  );
  const row = result.rows[0];
  if (!row || row.database !== integrationTarget.database || row.session_user !== integrationTarget.adminRole) {
    throw new IntegrationConfigurationError('Integration admin target verification failed.');
  }
};

const migrationFilesAreValid = async (): Promise<void> => {
  const names = (await readdir(migrationsDir)).filter((name) => name !== 'README.md').sort();
  if (!names.length || names.some((name) => !/^\d+[-_][a-z0-9_-]+\.sql$/.test(name))) {
    throw new Error('Integration migration validation failed.');
  }
};

const migrate = async (): Promise<void> => {
  await migrationFilesAreValid();
  const admin = getIntegrationAdminConfig();
  await runner({
    databaseUrl: admin.pool,
    dir: migrationsDir,
    ignorePattern: '^README\\.md$',
    migrationsTable: 'chawgee_migrations',
    direction: 'up',
    checkOrder: true,
    singleTransaction: true,
    noLock: false,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  });
};

const configureRuntimePrivileges = async (pool: Pool): Promise<void> => {
  const role = integrationTarget.runtimeRole;
  await pool.query(`REVOKE ALL ON SCHEMA chawgee FROM "${role}"`);
  await pool.query(`REVOKE ALL ON TABLE chawgee.accounts, chawgee.auth_bindings FROM "${role}"`);
  await pool.query(`GRANT CONNECT ON DATABASE postgres TO "${role}"`);
  await pool.query(`GRANT USAGE ON SCHEMA chawgee TO "${role}"`);
  await pool.query(`GRANT SELECT, INSERT, DELETE ON TABLE chawgee.accounts, chawgee.auth_bindings TO "${role}"`);
};

const resetAndSeed = async (pool: Pool): Promise<void> => {
  const { issuer, suspended, pendingDeletion } = integrationStatusFixtures;
  await pool.query('TRUNCATE TABLE chawgee.auth_bindings, chawgee.accounts');
  await pool.query(
    `INSERT INTO chawgee.accounts (id, status)
     VALUES ($1, 'suspended'), ($2, 'pending_deletion')`,
    [suspended.accountId, pendingDeletion.accountId],
  );
  await pool.query(
    `INSERT INTO chawgee.auth_bindings (id, account_id, auth_provider, issuer, subject)
     VALUES ($1, $2, 'supabase', $3, $4), ($5, $6, 'supabase', $3, $7)`,
    [
      suspended.bindingId,
      suspended.accountId,
      issuer,
      suspended.subject,
      pendingDeletion.bindingId,
      pendingDeletion.accountId,
      pendingDeletion.subject,
    ],
  );
};

const resetOnly = async (pool: Pool): Promise<void> => {
  await pool.query('TRUNCATE TABLE chawgee.auth_bindings, chawgee.accounts');
};

const runRuntimeTests = async (): Promise<void> => {
  const runtime = getIntegrationRuntimeConfig();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--test', testFile], {
      env: {
        CHAWGEE_IT_RUNTIME_DATABASE_URL: runtime.connectionString,
        CHAWGEE_IT_SSL_CA_FILE: process.env.CHAWGEE_IT_SSL_CA_FILE!,
      },
      stdio: 'inherit',
    });
    child.once('error', () => reject(new Error('Integration test process failed to start.')));
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(signal ? 'Integration test process terminated.' : 'Integration tests failed.'));
    });
  });
};

const withAdminLock = async <T>(work: (pool: Pool) => Promise<T>): Promise<T> => {
  const admin = getIntegrationAdminConfig();
  const pool = new Pool(admin.pool);
  const client = await pool.connect();
  try {
    await verifyAdminTarget(pool);
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    return await work(pool);
  } finally {
    try { await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]); }
    catch { /* The connection is discarded by pool shutdown if unlock fails. */ }
    client.release();
    await pool.end();
  }
};

const run = async (): Promise<void> => {
  const command = process.argv[2];
  if (command === 'reset') {
    await withAdminLock(async (pool) => {
      await migrate();
      await configureRuntimePrivileges(pool);
      await resetOnly(pool);
    });
    console.log('Integration database reset completed.');
    return;
  }
  if (command !== undefined) throw new Error('Unsupported integration database command.');

  await withAdminLock(async (pool) => {
    await migrate();
    await configureRuntimePrivileges(pool);
    await resetAndSeed(pool);
    try {
      await runRuntimeTests();
    } finally {
      await resetOnly(pool);
    }
  });
  console.log('Integration database tests completed.');
};

run().catch((error: unknown) => {
  console.error(error instanceof IntegrationConfigurationError ? error.message : 'Integration database harness failed.');
  process.exitCode = 1;
});