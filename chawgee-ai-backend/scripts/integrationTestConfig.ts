import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PoolConfig } from 'pg';

const PROJECT_REF = 'kdrilprqmdpsoztlxoxa';
const POOLER_HOST = 'aws-0-us-east-1.pooler.supabase.com';
const POOLER_PORT = '5432';
const DATABASE_NAME = 'postgres';
const ADMIN_USER = `postgres.${PROJECT_REF}`;
const RUNTIME_ROLE = 'chawgee_it_runtime';
const RUNTIME_USER = `${RUNTIME_ROLE}.${PROJECT_REF}`;

export const integrationStatusFixtures = Object.freeze({
  issuer: 'https://integration-test.invalid/auth/v1',
  suspended: {
    accountId: '00000000-0000-4000-8000-000000000001',
    bindingId: '00000000-0000-4000-8000-000000000003',
    subject: 'preserved-suspended',
  },
  pendingDeletion: {
    accountId: '00000000-0000-4000-8000-000000000002',
    bindingId: '00000000-0000-4000-8000-000000000004',
    subject: 'preserved-pending-deletion',
  },
});

export class IntegrationConfigurationError extends Error {
  constructor(message = 'Invalid integration database configuration.') {
    super(message);
    this.name = 'IntegrationConfigurationError';
  }
}

export interface IntegrationDatabaseConfig {
  connectionString: string;
  pool: PoolConfig;
}

const required = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name]?.trim();
  if (!value) throw new IntegrationConfigurationError(`Missing required integration configuration: ${name}.`);
  return value;
};

const integrationCa = (env: NodeJS.ProcessEnv): string => {
  const caFile = required(env, 'CHAWGEE_IT_SSL_CA_FILE');
  try {
    const ca = readFileSync(resolve(caFile), 'utf8');
    if (!ca.trim()) throw new Error();
    return ca;
  } catch {
    throw new IntegrationConfigurationError('Unable to read CHAWGEE_IT_SSL_CA_FILE.');
  }
};

const validatedConnection = (
  env: NodeJS.ProcessEnv,
  variableName: 'CHAWGEE_IT_ADMIN_DATABASE_URL' | 'CHAWGEE_IT_RUNTIME_DATABASE_URL',
  expectedUser: string,
): string => {
  const connectionString = required(env, variableName);
  try {
    const url = new URL(connectionString);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname.toLowerCase() !== POOLER_HOST ||
      url.port !== POOLER_PORT ||
      url.pathname !== `/${DATABASE_NAME}` ||
      decodeURIComponent(url.username) !== expectedUser ||
      !url.password ||
      url.search ||
      url.hash
    ) throw new Error();
    decodeURIComponent(url.password);
  } catch {
    throw new IntegrationConfigurationError(`Invalid integration target: ${variableName}.`);
  }
  return connectionString;
};

const databaseConfig = (
  env: NodeJS.ProcessEnv,
  variableName: 'CHAWGEE_IT_ADMIN_DATABASE_URL' | 'CHAWGEE_IT_RUNTIME_DATABASE_URL',
  expectedUser: string,
): IntegrationDatabaseConfig => {
  const connectionString = validatedConnection(env, variableName, expectedUser);
  const ca = integrationCa(env);
  return {
    connectionString,
    pool: {
      connectionString,
      ssl: { ca, rejectUnauthorized: true },
      max: 2,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 15000,
      query_timeout: 20000,
      idle_in_transaction_session_timeout: 15000,
    },
  };
};

export const getIntegrationAdminConfig = (
  env: NodeJS.ProcessEnv = process.env,
): IntegrationDatabaseConfig => databaseConfig(env, 'CHAWGEE_IT_ADMIN_DATABASE_URL', ADMIN_USER);

export const getIntegrationRuntimeConfig = (
  env: NodeJS.ProcessEnv = process.env,
): IntegrationDatabaseConfig => databaseConfig(env, 'CHAWGEE_IT_RUNTIME_DATABASE_URL', RUNTIME_USER);

export const integrationTarget = Object.freeze({
  database: DATABASE_NAME,
  adminPoolerUser: ADMIN_USER,
  adminRole: 'postgres',
  runtimeRole: RUNTIME_ROLE,
});