import type { QueryResultRow } from 'pg';
import type { VerifiedIdentity } from '../auth/tokenVerifier.js';
import type { SqlExecutor } from '../db/database.js';

export type AccountStatus = 'active' | 'suspended' | 'pending_deletion';

export interface ResolvedAccountIdentity {
  accountId: string;
  accountStatus: AccountStatus;
  identity: VerifiedIdentity;
}

interface IdentityRow extends QueryResultRow {
  account_id: string;
  status: string;
}

interface AccountRow extends QueryResultRow {
  id: string;
  status: string;
}

interface BindingRow extends QueryResultRow {
  account_id: string;
}

const accountStatus = (value: string): AccountStatus => {
  if (value === 'active' || value === 'suspended' || value === 'pending_deletion') return value;
  throw new Error('Invalid account status returned by database.');
};

const resolved = (row: IdentityRow, identity: VerifiedIdentity): ResolvedAccountIdentity => ({
  accountId: row.account_id,
  accountStatus: accountStatus(row.status),
  identity,
});

export const resolveIdentity = async (
  sql: SqlExecutor,
  identity: VerifiedIdentity,
): Promise<ResolvedAccountIdentity | undefined> => {
  const result = await sql.query<IdentityRow>(
    `SELECT b.account_id, a.status
     FROM chawgee.auth_bindings AS b
     JOIN chawgee.accounts AS a ON a.id = b.account_id
     WHERE b.issuer = $1 AND b.subject = $2`,
    [identity.issuer, identity.subject],
  );

  const row = result.rows[0];
  return row ? resolved(row, identity) : undefined;
};

export const insertAccount = async (
  sql: SqlExecutor,
  accountId: string,
): Promise<{ accountId: string; accountStatus: AccountStatus }> => {
  const result = await sql.query<AccountRow>(
    `INSERT INTO chawgee.accounts (id)
     VALUES ($1)
     RETURNING id, status`,
    [accountId],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Account insert returned no row.');
  return { accountId: row.id, accountStatus: accountStatus(row.status) };
};

export const insertBindingIfAbsent = async (
  sql: SqlExecutor,
  accountId: string,
  bindingId: string,
  identity: VerifiedIdentity,
): Promise<{ accountId: string } | undefined> => {
  const result = await sql.query<BindingRow>(
    `INSERT INTO chawgee.auth_bindings
       (id, account_id, auth_provider, issuer, subject)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT ON CONSTRAINT auth_bindings_identity_unique DO NOTHING
     RETURNING account_id`,
    [bindingId, accountId, identity.authProvider, identity.issuer, identity.subject],
  );
  const row = result.rows[0];
  return row ? { accountId: row.account_id } : undefined;
};

export const deleteUnboundCandidate = async (
  sql: SqlExecutor,
  accountId: string,
): Promise<void> => {
  await sql.query(
    `DELETE FROM chawgee.accounts AS a
     WHERE a.id = $1
       AND NOT EXISTS (
         SELECT 1 FROM chawgee.auth_bindings AS b WHERE b.account_id = a.id
       )`,
    [accountId],
  );
};

export const getAccountStatus = async (
  sql: SqlExecutor,
  accountId: string,
): Promise<AccountStatus | undefined> => {
  const result = await sql.query<AccountRow>(
    `SELECT status FROM chawgee.accounts WHERE id = $1`,
    [accountId],
  );
  const row = result.rows[0];
  return row ? accountStatus(row.status) : undefined;
};