import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import { ConfigurationError, getDatabaseConfig } from '../src/config.js';

const dir = fileURLToPath(new URL('../migrations/', import.meta.url));
const command = process.argv[2];

try {
  if (!['check', 'up'].includes(command) || process.argv.length !== 3) {
    throw new Error('Unsupported migration command.');
  }
  const names = (await readdir(dir)).filter((name) => name !== 'README.md').sort();
  const versions = new Set<string>();
  for (const name of names) {
    const match = /^(\d+)[-_][a-z0-9_-]+\.sql$/.exec(name);
    if (!match || versions.has(match[1])) throw new Error('Invalid migration filename/order.');
    versions.add(match[1]);
    const sql = await readFile(`${dir}/${name}`, 'utf8');
    if (!/^-- Up Migration\s*$/m.test(sql) || !/^-- Down Migration\s*$/m.test(sql) ||
        sql.indexOf('-- Up Migration') > sql.indexOf('-- Down Migration')) {
      throw new Error('Migration sections missing or out of order.');
    }
  }
  if (command === 'check') {
    console.log(`Migration file checks passed (${names.length} files); SQL execution and database history were not checked.`);
  } else {
    const databaseUrl = getDatabaseConfig('migration');
    await runner({
      databaseUrl,
      dir,
      ignorePattern: '^README\\.md$',
      migrationsTable: 'chawgee_migrations',
      direction: 'up',
      checkOrder: true,
      singleTransaction: true,
      noLock: false,
      // Tool output can contain SQL and raw driver errors. Keep deployment output safe.
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    });
    console.log('Migrations completed.');
  }
} catch (error) {
  console.error(error instanceof ConfigurationError ? error.message : 'Migration command failed; check configuration and migration files.');
  process.exitCode = 1;
}
