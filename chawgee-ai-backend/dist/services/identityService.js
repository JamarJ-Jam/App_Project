import { randomUUID } from 'node:crypto';
import { deleteUnboundCandidate, insertAccount, insertBindingIfAbsent, resolveIdentity, } from '../repositories/identityRepository.js';
import { bootstrapTrace } from '../auth/bootstrapTrace.js';
export class IdentityResolutionConcurrencyError extends Error {
    constructor() {
        super('Identity resolution could not observe the winning binding after a provisioning race.');
        this.name = 'IdentityResolutionConcurrencyError';
    }
}
const WINNER_LOOKUP_ATTEMPTS = 3;
const WINNER_LOOKUP_DELAY_MS = 5;
export const createIdentityService = (database, options = {}) => {
    const wait = options.wait ?? ((milliseconds) => new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    }));
    const winnerLookupAttempts = options.winnerLookupAttempts ?? WINNER_LOOKUP_ATTEMPTS;
    if (!Number.isInteger(winnerLookupAttempts) || winnerLookupAttempts < 1) {
        throw new Error('winnerLookupAttempts must be a positive integer.');
    }
    const resolveOrProvision = async (identity) => {
        bootstrapTrace('DB_OPERATION_STARTED');
        const result = await database.transaction(async (sql) => {
            await sql.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
            const existing = await resolveIdentity(sql, identity);
            if (existing)
                return { kind: 'resolved', identity: existing };
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
        bootstrapTrace('DB_OPERATION_COMPLETED');
        if (result.identity)
            return result.identity;
        for (let attempt = 1; attempt <= winnerLookupAttempts; attempt += 1) {
            bootstrapTrace('DB_OPERATION_STARTED');
            const winner = await resolveIdentity(database, identity);
            bootstrapTrace('DB_OPERATION_COMPLETED');
            if (winner)
                return winner;
            if (attempt < winnerLookupAttempts)
                await wait(WINNER_LOOKUP_DELAY_MS);
        }
        throw new IdentityResolutionConcurrencyError();
    };
    return { resolveOrProvision };
};
