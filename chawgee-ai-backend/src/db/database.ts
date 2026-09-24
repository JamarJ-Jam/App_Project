import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';
import { ConfigurationError, getDatabaseConfig } from '../config.js';

export class DatabaseError extends Error {
  constructor() {
    super('Database operation failed.');
    this.name = 'DatabaseError';
  }
}

export interface SqlExecutor {
  query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<Row>>;
}

// TEMPORARY Railway readiness diagnostic. Remove this helper and restore ready()
// to query('SELECT 1') after diagnosis. Never serialize the original error:
// even name/code/message can contain secrets. Admit only known literal values.
const logReadinessFailure = (error: unknown): void => {
  const diagnostic: Record<string, string> = { name: 'UnknownError' };
  const allowed: Record<string, readonly string[]> = {
    name: ['Error', 'AggregateError', 'TypeError', 'DatabaseError', 'ConfigurationError'],
    code: [
      'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN',
      'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE',
      'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'DEPTH_ZERO_SELF_SIGNED_CERT',
      'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
      'ERR_TLS_CERT_ALTNAME_INVALID', 'ERR_SSL_WRONG_VERSION_NUMBER',
      '08000', '08001', '08003', '08004', '08006', '08007', '08P01',
      '28000', '28P01', '3D000', '42501', '53300', '53400', '57P01', '57P02', '57P03',
    ],
    syscall: ['connect', 'getaddrinfo', 'read', 'write'],
    message: [
      'Connection terminated unexpectedly', 'Connection terminated',
      'Connection terminated due to connection timeout',
      'timeout exceeded when trying to connect', 'Query read timeout',
      'self-signed certificate in certificate chain', 'self-signed certificate',
      'unable to verify the first certificate', 'unable to get local issuer certificate',
      'certificate has expired', 'certificate is not yet valid',
    ],
  };
  try {
    if (typeof error === 'object' && error !== null) {
      for (const [field, values] of Object.entries(allowed)) {
        const value = (error as Record<string, unknown>)[field];
        if (typeof value === 'string' && values.includes(value)) diagnostic[field] = value;
      }
    }
    console.error('[TEMPORARY_READINESS_DIAGNOSTIC]', diagnostic);
  } catch { /* Diagnostics must never change readiness failure behavior. */ }
};

// Factory injection allows lifecycle tests without opening a socket.
export const createDatabase = (
  getConfig: () => PoolConfig = getDatabaseConfig,
  makePool: (options: PoolConfig) => Pool = (options) => new Pool(options),
) => {
  let pool: Pool | undefined;
  let closed = false;
  let closing: Promise<void> | undefined;
  const getPool = (): Pool => {
    if (closed) throw new DatabaseError();
    if (!pool) {
      pool = makePool(getConfig());
      // Idle-client failures must be handled, but driver errors may contain secrets.
      pool.on('error', () => console.error('Database idle connection failed.'));
    }
    return pool;
  };

  const query: SqlExecutor['query'] = async (text, values) => {
    try { return await getPool().query(text, values); }
    catch (error) {
      if (error instanceof ConfigurationError) throw error;
      throw new DatabaseError();
    }
  };

  const transaction = async <T>(work: (sql: SqlExecutor) => Promise<T>): Promise<T> => {
    let client: PoolClient;
    try { client = await getPool().connect(); }
    catch (error) {
      if (error instanceof ConfigurationError) throw error;
      throw new DatabaseError();
    }
    let active = true;
    let failed = false;
    let destroy = false;
    const connectionError = () => { failed = true; destroy = true; };
    client.on('error', connectionError);
    const sql: SqlExecutor = {
      query: async (text, values) => {
        if (!active || failed) throw new DatabaseError();
        try { return await client.query(text, values); }
        catch {
          failed = true;
          destroy = true;
          throw new DatabaseError();
        }
      },
    };
    try {
      await client.query('BEGIN');
      const result = await work(sql);
      // A swallowed query error must not allow a false successful commit.
      if (failed) throw new DatabaseError();
      active = false;
      await client.query('COMMIT');
      return result;
    } catch {
      active = false;
      destroy = true;
      try { await client.query('ROLLBACK'); }
      catch { /* Discard the connection; never expose the rollback error. */ }
      throw new DatabaseError();
    } finally {
      active = false;
      client.release(destroy);
      client.removeListener('error', connectionError);
    }
  };

  const ready = async (): Promise<boolean> => {
    // TEMPORARY: catch the driver error before query() replaces it with DatabaseError.
    try { await getPool().query('SELECT 1'); return true; }
    catch (error) { logReadinessFailure(error); return false; }
  };

  const close = (): Promise<void> => {
    closed = true;
    closing ??= (pool ? pool.end() : Promise.resolve()).catch(() => { throw new DatabaseError(); });
    return closing;
  };

  return { query, transaction, ready, close };
};

// Creating this boundary does not create a pool or connect to PostgreSQL.
export const database = createDatabase();
