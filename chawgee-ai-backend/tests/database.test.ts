import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { ConfigurationError, getDatabaseConfig } from '../src/config.js';
import { createDatabase, DatabaseError, type SqlExecutor } from '../src/db/database.js';

// Synthetic URL used only for parsing. Tests never construct a real pool.
const env = { DATABASE_URL: 'postgresql://test@localhost/test' };

test('configuration is explicit, bounded, and verifies TLS by default', () => {
  const options = getDatabaseConfig('runtime', env);
  assert.equal(options.max, 10);
  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
  assert.equal(options.connectionTimeoutMillis, 5000);
  assert.equal(options.statement_timeout, 15000);
  assert.equal(getDatabaseConfig('runtime', { ...env, DATABASE_POOL_MAX: ' 3 ' }).max, 3);
  assert.equal(getDatabaseConfig('runtime', { ...env, DATABASE_SSL_MODE: 'disable' }).ssl, false);
  assert.throws(() => getDatabaseConfig('migration', env), /DATABASE_MIGRATION_URL/);
  assert.equal(getDatabaseConfig('migration', { DATABASE_MIGRATION_URL: env.DATABASE_URL }).max, 1);
});

test('invalid or missing configuration fails without echoing supplied values', () => {
  for (const DATABASE_URL of [undefined, '', 'private-invalid-value', 'https://test@localhost/db',
    'postgresql://localhost/db', 'postgresql://test@localhost/',
    'postgresql://test@localhost/db?sslmode=no-verify', 'postgresql://test@localhost/db#fragment',
    'postgresql://test@localhost:99999/db', 'postgresql://test:%ZZ@localhost/db']) {
    assert.throws(() => getDatabaseConfig('runtime', { DATABASE_URL }), (error: unknown) => {
      assert.ok(error instanceof ConfigurationError);
      if (DATABASE_URL) assert.ok(!error.message.includes(DATABASE_URL));
      return true;
    });
  }
  for (const DATABASE_POOL_MAX of ['0', '101', '1.5', 'NaN']) {
    assert.throws(() => getDatabaseConfig('runtime', { ...env, DATABASE_POOL_MAX }), ConfigurationError);
  }
  assert.throws(() => getDatabaseConfig('runtime', { ...env, DATABASE_SSL_MODE: 'no-verify' }), ConfigurationError);
  assert.throws(() => getDatabaseConfig('runtime', { ...env, DATABASE_SSL_CA_FILE: '/nonexistent/private-path' }),
    (error: unknown) => error instanceof ConfigurationError && !error.message.includes('/nonexistent'));
});

function fixture(failOn: string[] = [], connectFailure = false) {
  const commands: string[] = [];
  const releases: boolean[] = [];
  let created = 0;
  let ended = 0;
  let connectionError: (() => void) | undefined;
  const result = { rows: [{ ok: true }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
  const client = {
    async query(text: string) {
      commands.push(text);
      if (failOn.includes(text)) throw new Error('sensitive-driver-detail');
      return result;
    },
    release(destroy: boolean) { releases.push(destroy); },
    on(_event: string, handler: () => void) { connectionError = handler; },
    removeListener() { connectionError = undefined; },
  };
  let idleError: (() => void) | undefined;
  const pool = {
    async connect() {
      if (connectFailure) throw new Error('sensitive-connect-detail');
      return client;
    },
    query: client.query,
    async end() { ended++; },
    on(_event: string, handler: () => void) { idleError = handler; },
  };
  const db = createDatabase(() => getDatabaseConfig('runtime', env), () => {
    created++;
    return pool as unknown as Pool;
  });
  return { db, commands, releases, created: () => created, ended: () => ended,
    idleError: () => idleError, connectionError: () => connectionError };
}

test('pool is lazy, reused, and close is idempotent and prevents reopening', async () => {
  const f = fixture();
  assert.equal(f.created(), 0);
  await f.db.query('first');
  await f.db.query('second');
  assert.equal(f.created(), 1);
  assert.ok(f.idleError());
  await Promise.all([f.db.close(), f.db.close()]);
  assert.equal(f.ended(), 1);
  await assert.rejects(f.db.query('after close'), DatabaseError);
  assert.equal(f.created(), 1);
  const unused = fixture();
  await unused.db.close();
  assert.equal(unused.created(), 0);
});

test('transaction uses one connection and releases it after commit', async () => {
  const f = fixture();
  let captured: SqlExecutor | undefined;
  const value = await f.db.transaction(async (sql) => {
    captured = sql;
    await sql.query('domain mutation', ['parameter']);
    await sql.query('change receipt');
    return 42;
  });
  assert.equal(value, 42);
  assert.deepEqual(f.commands, ['BEGIN', 'domain mutation', 'change receipt', 'COMMIT']);
  assert.deepEqual(f.releases, [false]);
  await assert.rejects(captured!.query('late query'), DatabaseError);
});

for (const failOn of [['BEGIN'], ['mutation'], ['COMMIT'], ['mutation', 'ROLLBACK']]) {
  test(`transaction rolls back and discards connection on ${failOn.join('/')} failure`, async () => {
    const f = fixture(failOn);
    await assert.rejects(f.db.transaction(async (sql) => { await sql.query('mutation'); }),
      (error: unknown) => error instanceof DatabaseError && !String(error).includes('sensitive'));
    assert.equal(f.commands.at(-1), 'ROLLBACK');
    assert.deepEqual(f.releases, [true]);
  });
}

test('callback failure rolls back and releases, even without a query failure', async () => {
  const f = fixture();
  await assert.rejects(f.db.transaction(async () => { throw new Error('private callback details'); }), DatabaseError);
  assert.deepEqual(f.commands, ['BEGIN', 'ROLLBACK']);
  assert.deepEqual(f.releases, [true]);
});

test('a swallowed query failure cannot report transaction success', async () => {
  const f = fixture(['mutation']);
  await assert.rejects(f.db.transaction(async (sql) => {
    try { await sql.query('mutation'); } catch { /* caller attempted recovery */ }
  }), DatabaseError);
  assert.ok(!f.commands.includes('COMMIT'));
  assert.deepEqual(f.releases, [true]);
});

test('connection acquisition failures are sanitized without releasing an unowned client', async () => {
  const f = fixture([], true);
  await assert.rejects(f.db.transaction(async () => undefined), DatabaseError);
  assert.deepEqual(f.commands, []);
  assert.deepEqual(f.releases, []);
});

test('checked-out connection errors abort the transaction and remove the error listener', async () => {
  const f = fixture();
  await assert.rejects(f.db.transaction(async () => { f.connectionError()!(); }), DatabaseError);
  assert.deepEqual(f.commands, ['BEGIN', 'ROLLBACK']);
  assert.deepEqual(f.releases, [true]);
  assert.equal(f.connectionError(), undefined);
});

test('readiness reports only success/failure and missing config never opens a pool', async () => {
  assert.equal(await fixture().db.ready(), true);
  assert.equal(await fixture(['SELECT 1']).db.ready(), false);
  const missing = createDatabase(() => getDatabaseConfig('runtime', {}), () => {
    assert.fail('Must not create a pool without configuration');
  });
  assert.equal(await missing.ready(), false);
  await assert.rejects(missing.query('SELECT 1'), ConfigurationError);
});


test('temporary readiness diagnostic emits only allowlisted fields, never connection secrets', async (t) => {
  const log = t.mock.method(console, 'error', () => {});
  const secret = 'postgresql://private-user:private-password@private-host/private-db';
  for (const code of ['ENOTFOUND', 'ERR_TLS_CERT_ALTNAME_INVALID', '28P01']) {
    const failure = Object.assign(new Error(`Connection failed: ${secret}`), {
      code, syscall: 'connect', hostname: 'private-host', user: 'private-user',
      password: 'private-password', database: 'private-db', connectionString: secret,
      stack: secret, cause: new Error(secret), parameters: [secret],
      certificate: secret, token: secret, apiKey: secret,
    });
    const commands: string[] = [];
    const db = createDatabase(() => getDatabaseConfig('runtime', env), () => ({
      on() {},
      async query(sql: string) { commands.push(sql); throw failure; },
    }) as unknown as Pool);
    assert.equal(await db.ready(), false);
    assert.deepEqual(commands, ['SELECT 1']);
    assert.deepEqual(log.mock.calls.at(-1)?.arguments, [
      '[TEMPORARY_READINESS_DIAGNOSTIC]', { name: 'Error', code, syscall: 'connect' },
    ]);
    const count = log.mock.callCount();
    await assert.rejects(db.query('SELECT 1'), DatabaseError);
    assert.equal(log.mock.callCount(), count);
  }
  const malicious = Object.assign(new Error(secret), {
    name: secret, code: secret, syscall: secret, stack: secret,
  });
  const db = createDatabase(() => { throw malicious; });
  assert.equal(await db.ready(), false);
  assert.deepEqual(log.mock.calls.at(-1)?.arguments, [
    '[TEMPORARY_READINESS_DIAGNOSTIC]', { name: 'UnknownError' },
  ]);
  assert.equal(JSON.stringify(log.mock.calls.map((call) => call.arguments)).includes('private-'), false);
});

test('temporary readiness diagnostic permits exact safe timeout messages and is silent on success', async (t) => {
  const log = t.mock.method(console, 'error', () => {});
  assert.equal(await fixture().db.ready(), true);
  assert.equal(log.mock.callCount(), 0);
  const message = 'Connection terminated due to connection timeout';
  const db = createDatabase(() => { throw new Error(message); });
  assert.equal(await db.ready(), false);
  assert.deepEqual(log.mock.calls[0].arguments, [
    '[TEMPORARY_READINESS_DIAGNOSTIC]', { name: 'Error', message },
  ]);
  log.mock.mockImplementation(() => { throw new Error('logger failed'); });
  assert.equal(await db.ready(), false);
});
