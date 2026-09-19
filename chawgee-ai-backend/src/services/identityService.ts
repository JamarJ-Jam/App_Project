import { randomUUID } from 'node:crypto';
import type { VerifiedIdentity } from '../auth/tokenVerifier.js';
import type { SqlExecutor } from '../db/database.js';
import {
  deleteUnboundCandidate,
  insertAccount,
  insertBindingIfAbsent,
  resolveIdentity,
  type ResolvedAccountIdentity,
} from '../repositories/identityRepository.js';

interface IdentityDatabase {
  query: SqlExecutor['query'];
  transaction<T>(work: (sql: SqlExecutor) => Promise<T>): Promise<T>;
}

interface ProvisionedResult {
  kind: 'resolved' | 'race-lost';
  identity?: ResolvedAccountIdentity;
}

export class IdentityResolutionConcurrencyError extends Error {
  constructor() {
    super('Identity resolution could not observe the winning binding after a provisioning race.');
    this.name = 'IdentityResolutionConcurrencyError';
  }
}

const WINNER_LOOKUP_ATTEMPTS = 3;
const WINNER_LOOKUP_DELAY_MS = 5;

interface IdentityServiceOptions {
  wait?: (milliseconds: number) => Promise<void>;
  winnerLookupAttempts?: number;
}

export const createIdentityService = (
  database: IdentityDatabase,
  options: IdentityServiceOptions = {},
) => {
  const wait = options.wait ?? ((milliseconds: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  }));
  const winnerLookupAttempts = options.winnerLookupAttempts ?? WINNER_LOOKUP_ATTEMPTS;

  if (!Number.isInteger(winnerLookupAttempts) || winnerLookupAttempts < 1) {
    throw new Error('winnerLookupAttempts must be a positive integer.');
  }

  const resolveOrProvision = async (identity: VerifiedIdentity): Promise<ResolvedAccountIdentity> => {
    const result = await database.transaction<ProvisionedResult>(async (sql) => {
      await sql.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');

      const existing = await resolveIdentity(sql, identity);
      if (existing) return { kind: 'resolved', identity: existing };

      const candidateAccountId = randomUUID();
      const candidateBindingId = randomUUID();
      const candidate = await insertAccount(sql, candidateAccountId);
      const binding = await insertBindingIfAbsent(sql, candidate.accountId, candidateBindingId, identity);

      if (binding) {
        return {
          kind: 'resolved',
          identity: {
            accountId: candidate.accountId,
            accountStatus: candidate.accountStatus,
            identity,
          },
        };
      }

      await deleteUnboundCandidate(sql, candidate.accountId);
      return { kind: 'race-lost' };
    });

    if (result.identity) return result.identity;

    for (let attempt = 1; attempt <= winnerLookupAttempts; attempt += 1) {
      const winner = await resolveIdentity(database, identity);
      if (winner) return winner;
      if (attempt < winnerLookupAttempts) await wait(WINNER_LOOKUP_DELAY_MS);
    }

    throw new IdentityResolutionConcurrencyError();
  };

  return { resolveOrProvision };
};