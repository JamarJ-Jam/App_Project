import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import type { PoolConfig } from 'pg';

// Load the environment before any dependency-specific validation.
// Existing deployment environment variables retain precedence over .env.
dotenv.config({ quiet: true });

export class ConfigurationError extends Error {}

export interface AuthConfig {
  issuer: string;
  jwksUrl: string;
  audience: string;
  allowedAlgorithms: readonly ['ES256'];
}

const required = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name]?.trim();
  if (!value) throw new ConfigurationError(`Missing required backend configuration: ${name}.`);
  return value;
};

const integer = (value: string | undefined, fallback: number, max: number, name: string): number => {
  const normalized = value?.trim();
  const result = normalized ? Number(normalized) : fallback;
  if (!Number.isInteger(result) || result < 1 || result > max) {
    throw new ConfigurationError(`Invalid backend configuration: ${name} must be an integer from 1 to ${max}.`);
  }
  return result;
};

const requiredHttpsUrl = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = required(env, name);
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username || url.password || url.search || url.hash
    ) throw new Error();
    return url.toString().replace(/\/+$/, '');
  } catch {
    throw new ConfigurationError(`Invalid backend configuration: ${name} must be an HTTPS URL without credentials, query parameters, or fragment.`);
  }
};

export const getAuthConfig = (env: NodeJS.ProcessEnv = process.env): AuthConfig => {
  const allowedAlgorithms = required(env, 'SUPABASE_AUTH_ALLOWED_ALGORITHMS')
    .split(',')
    .map((algorithm) => algorithm.trim())
    .filter(Boolean);

  if (allowedAlgorithms.length !== 1 || allowedAlgorithms[0] !== 'ES256') {
    throw new ConfigurationError('Invalid backend configuration: SUPABASE_AUTH_ALLOWED_ALGORITHMS must be ES256.');
  }
  const audience = required(env, 'SUPABASE_AUTH_AUDIENCE');
  if (audience !== 'authenticated') {
    throw new ConfigurationError('Invalid backend configuration: SUPABASE_AUTH_AUDIENCE must be authenticated.');
  }

  return Object.freeze({
    issuer: requiredHttpsUrl(env, 'SUPABASE_AUTH_ISSUER'),
    jwksUrl: requiredHttpsUrl(env, 'SUPABASE_AUTH_JWKS_URL'),
    audience,
    allowedAlgorithms: ['ES256'] as const,
  });
};

export const config = Object.freeze({
  // Validate each dependency when used, so DB tooling does not require AI credentials.
  get port() { return integer(process.env.PORT, 4000, 65535, 'PORT'); },
  get openRouterApiKey() { return required(process.env, 'OPENROUTER_API_KEY'); },
  openRouterOnboardingModel:
    process.env.OPENROUTER_ONBOARDING_MODEL?.trim() || 'openai/gpt-oss-120b',
});

export const getDatabaseConfig = (
  purpose: 'runtime' | 'migration' = 'runtime',
  env: NodeJS.ProcessEnv = process.env,
): PoolConfig => {
  const name = purpose === 'migration' ? 'DATABASE_MIGRATION_URL' : 'DATABASE_URL';
  const connectionString = required(env, name);
  try {
    const url = new URL(connectionString);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname || !url.username || url.pathname.length < 2 ||
      url.search || url.hash || (url.port && (Number(url.port) < 1 || Number(url.port) > 65535))
    ) throw new Error();
    // Reject malformed percent encoding before handing the URL to the driver.
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
    decodeURIComponent(url.pathname);
  } catch {
    throw new ConfigurationError(`Invalid backend configuration: ${name} must be a PostgreSQL URL with a user and database, without query parameters or fragment.`);
  }

  const sslMode = env.DATABASE_SSL_MODE?.trim() || 'verify-full';
  if (sslMode !== 'verify-full' && sslMode !== 'disable') {
    throw new ConfigurationError('Invalid backend configuration: DATABASE_SSL_MODE must be verify-full or disable.');
  }
  let ca: string | undefined;
  const caFile = env.DATABASE_SSL_CA_FILE?.trim();
  if (caFile) {
    if (sslMode === 'disable') throw new ConfigurationError('DATABASE_SSL_CA_FILE requires verified TLS.');
    try { ca = readFileSync(caFile, 'utf8'); }
    catch { throw new ConfigurationError('Unable to read DATABASE_SSL_CA_FILE.'); }
  }

  return {
    connectionString,
    ssl: sslMode === 'disable' ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    max: purpose === 'migration' ? 1 : integer(env.DATABASE_POOL_MAX, 10, 100, 'DATABASE_POOL_MAX'),
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: purpose === 'migration' ? 120000 : 15000,
    query_timeout: purpose === 'migration' ? 130000 : 20000,
    idle_in_transaction_session_timeout: 15000,
  };
};
