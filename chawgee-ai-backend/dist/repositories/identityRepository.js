const accountStatus = (value) => {
    if (value === 'active' || value === 'suspended' || value === 'pending_deletion')
        return value;
    throw new Error('Invalid account status returned by database.');
};
const resolved = (row, identity) => ({
    accountId: row.account_id,
    accountStatus: accountStatus(row.status),
    identity,
});
export const resolveIdentity = async (sql, identity) => {
    const result = await sql.query(`SELECT b.account_id, a.status
     FROM chawgee.auth_bindings AS b
     JOIN chawgee.accounts AS a ON a.id = b.account_id
     WHERE b.issuer = $1 AND b.subject = $2`, [identity.issuer, identity.subject]);
    const row = result.rows[0];
    return row ? resolved(row, identity) : undefined;
};
export const insertAccount = async (sql, accountId) => {
    const result = await sql.query(`INSERT INTO chawgee.accounts (id)
     VALUES ($1)
     RETURNING id, status`, [accountId]);
    const row = result.rows[0];
    if (!row)
        throw new Error('Account insert returned no row.');
    return { accountId: row.id, accountStatus: accountStatus(row.status) };
};
export const insertBindingIfAbsent = async (sql, accountId, bindingId, identity) => {
    const result = await sql.query(`INSERT INTO chawgee.auth_bindings
       (id, account_id, auth_provider, issuer, subject)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT ON CONSTRAINT auth_bindings_identity_unique DO NOTHING
     RETURNING account_id`, [bindingId, accountId, identity.authProvider, identity.issuer, identity.subject]);
    const row = result.rows[0];
    return row ? { accountId: row.account_id } : undefined;
};
export const deleteUnboundCandidate = async (sql, accountId) => {
    await sql.query(`DELETE FROM chawgee.accounts AS a
     WHERE a.id = $1
       AND NOT EXISTS (
         SELECT 1 FROM chawgee.auth_bindings AS b WHERE b.account_id = a.id
       )`, [accountId]);
};
export const getAccountStatus = async (sql, accountId) => {
    const result = await sql.query(`SELECT status FROM chawgee.accounts WHERE id = $1`, [accountId]);
    const row = result.rows[0];
    return row ? accountStatus(row.status) : undefined;
};
