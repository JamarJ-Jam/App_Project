# PostgreSQL migrations

The first account/identity migration is generated for review, not applied.
Use versioned standard PostgreSQL SQL with
node-pg-migrate's `-- Up Migration` / `-- Down Migration` sections. Keep migrations
deterministic and review them; never edit a migration already applied.

- `npm run db:migrate:create -- descriptive-name` creates a SQL template only.
- `npm run db:migrate:check` checks filenames, unique versions and section markers
  offline. It does not parse SQL or check live migration history.
- `npm run db:migrate:up` explicitly connects and applies pending migrations.
  This command has NOT been executed as part of this foundation task.

Run migrations once in a controlled release job with development dependencies
installed (`tsx` and `node-pg-migrate`), before deploying compatible application
code. They never run from `start`, `dev`, or a mobile client. The runner retains
its advisory lock, order checks and transaction, and records applied versions in
`chawgee_migrations`. It may create that metadata table when executed. It does not
provide migration-content checksums; protect applied files through code review.

Supply `DATABASE_MIGRATION_URL` only to the release job using a migration-capable
role. There is intentionally no fallback to runtime credentials. Use a direct or
session-pooled connection for this job (session advisory locks require it).
Do not use the tool's dry run as an offline check: it connects to PostgreSQL and
this installed tool version can initialize migration metadata even in dry run.

Test SQL against an isolated PostgreSQL database after provisioning. Prefer
reviewed forward corrections in production; no automatic rollback is wired up.
