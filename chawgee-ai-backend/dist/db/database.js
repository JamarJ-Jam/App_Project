import { Pool } from 'pg';
import { ConfigurationError, getDatabaseConfig } from '../config.js';
export class DatabaseError extends Error {
    constructor() {
        super('Database operation failed.');
        this.name = 'DatabaseError';
    }
}
// Factory injection allows lifecycle tests without opening a socket.
export const createDatabase = (getConfig = getDatabaseConfig, makePool = (options) => new Pool(options)) => {
    let pool;
    let closed = false;
    let closing;
    const getPool = () => {
        if (closed)
            throw new DatabaseError();
        if (!pool) {
            pool = makePool(getConfig());
            // Idle-client failures must be handled, but driver errors may contain secrets.
            pool.on('error', () => console.error('Database idle connection failed.'));
        }
        return pool;
    };
    const query = async (text, values) => {
        try {
            return await getPool().query(text, values);
        }
        catch (error) {
            if (error instanceof ConfigurationError)
                throw error;
            throw new DatabaseError();
        }
    };
    const transaction = async (work) => {
        let client;
        try {
            client = await getPool().connect();
        }
        catch (error) {
            if (error instanceof ConfigurationError)
                throw error;
            throw new DatabaseError();
        }
        let active = true;
        let failed = false;
        let destroy = false;
        const connectionError = () => { failed = true; destroy = true; };
        client.on('error', connectionError);
        const sql = {
            query: async (text, values) => {
                if (!active || failed)
                    throw new DatabaseError();
                try {
                    return await client.query(text, values);
                }
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
            if (failed)
                throw new DatabaseError();
            active = false;
            await client.query('COMMIT');
            return result;
        }
        catch {
            active = false;
            destroy = true;
            try {
                await client.query('ROLLBACK');
            }
            catch { /* Discard the connection; never expose the rollback error. */ }
            throw new DatabaseError();
        }
        finally {
            active = false;
            client.release(destroy);
            client.removeListener('error', connectionError);
        }
    };
    const ready = async () => {
        try {
            await query('SELECT 1');
            return true;
        }
        catch {
            return false;
        }
    };
    const close = () => {
        closed = true;
        closing ??= (pool ? pool.end() : Promise.resolve()).catch(() => { throw new DatabaseError(); });
        return closing;
    };
    return { query, transaction, ready, close };
};
// Creating this boundary does not create a pool or connect to PostgreSQL.
export const database = createDatabase();
