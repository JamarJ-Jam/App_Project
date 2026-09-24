# Backend database foundation

`src/config.ts` is the only environment boundary. It loads dotenv without logging
values, preserves deployment-variable precedence, and validates database settings
only when a database operation is requested. Existing AI configuration is checked
when its consumers initialize, so migration tooling does not need an AI key.

## Future JWT verification configuration

The backend authentication verifier uses the Supabase project's asymmetric
ECC P-256 signing keys and expects `ES256` tokens. These values are server-only,
validated lazily when verification is requested, and must not be exposed to the
mobile application:

- `SUPABASE_AUTH_ISSUER`: trusted Supabase token issuer URL
- `SUPABASE_AUTH_JWKS_URL`: trusted HTTPS JWKS URL
- `SUPABASE_AUTH_AUDIENCE`: expected token audience
- `SUPABASE_AUTH_ALLOWED_ALGORITHMS`: `ES256` only

No shared JWT secret or service-role key is used for token verification.

## Database configuration

- `DATABASE_URL`: required for runtime database operations; no default.
- `DATABASE_MIGRATION_URL`: required only for explicit migration execution; no default.
- `DATABASE_POOL_MAX`: runtime pool limit, defaults to 10; range 1–100 per process.
- `DATABASE_SSL_MODE`: defaults to `verify-full` (certificate and hostname
  verification). Explicit `disable` is for trusted local development only.
- `DATABASE_SSL_CA_FILE`: optional PEM CA file for hosts whose certificate chain
  needs a supplied CA. Verification remains enabled. Never disable certificate
  verification to work around a certificate error.

URLs must include a PostgreSQL scheme, host, user and database. Query parameters
and fragments are rejected so URL SSL options cannot override verified TLS. Put
TLS settings in the named configuration variables instead. Do not print URLs.

The pool is lazy, with a 5-second acquisition/connect timeout, 30-second idle
timeout, 15-second statement timeout and 20-second client query timeout. Idle
transactions time out after 15 seconds. Migrations have longer bounded statement
and query timeouts (120/130 seconds). Budget pool limits across all replicas and
other database users. No provider-specific SDK or ORM is used.

Use restricted runtime credentials without schema-change/admin permissions.
Provision separate migration credentials later; neither belongs in the frontend.
Ordinary PostgreSQL connections require no Supabase service-role key.

## Operations

`GET /health` retains the existing lightweight liveness response, without touching
PostgreSQL. `GET /ready` requires a successful bounded database probe and returns
only `{ success: true }` or HTTP 503 with `{ success: false }`. Missing, invalid or
unreachable database configuration is not ready, but does not stop current AI-only
development. Readiness tests connectivity, not schema version or authorization.
Deployment must explicitly choose `/ready` once PostgreSQL is required.

SIGTERM/SIGINT stop new HTTP requests, drain active requests, then close the pool.
A ten-second deadline forces exit on a stuck shutdown. Shutdown is idempotent.

See `migrations/README.md` for release migrations and `src/repositories/README.md`
for transaction usage. Live connectivity, SQL execution, hosted TLS, and role
permissions remain unverified until infrastructure is provisioned.

## Isolated PostgreSQL integration tests

`npm run test:integration:db` is intentionally separate from `npm run test:unit`.
It targets only the disposable Integration Tests Supabase project and never reads
`DATABASE_URL` or `DATABASE_MIGRATION_URL`.

Keep these values in ignored `.env.integration.local`; do not add them to tracked
files, fixtures, logs, or CI output:

- `CHAWGEE_IT_ADMIN_DATABASE_URL`: migration, grants, and reset only.
- `CHAWGEE_IT_RUNTIME_DATABASE_URL`: passed to the runtime test process only.
- `CHAWGEE_IT_SSL_CA_FILE`: path to the locally stored Supabase CA certificate.

The harness requires verified TLS, checks the hard-pinned disposable target before
destructive actions, holds an advisory lock, applies the versioned migration, and
truncates only `chawgee.auth_bindings` and `chawgee.accounts`. `npm run
db:integration:reset` performs the same guarded reset without executing tests.


## Production Supabase database CA (Railway)

The public trust anchor `certs/supabase-root-2021-ca.crt` is required for the
confirmed production Supabase database chain. It contains one public certificate,
not a private key or a database credential.

- Subject CN: `Supabase Root 2021 CA`.
- Expires: **2031-04-26 10:56:53 UTC**.
- SHA-256 fingerprint:
  `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.

For the Railway service with source root `/chawgee-ai-backend`, set:

```text
DATABASE_SSL_CA_FILE=certs/supabase-root-2021-ca.crt
```

The existing configuration reads this relative to the process working directory.
Run `npm start` from the backend package root, as in the standard Railpack Node
layout; `node dist/index.js` does not change that working directory. The Railway
source-root setting is not an absolute runtime filesystem path. Do not use the
local home-directory CA path in Railway.

The certificate lives inside the service source root, with an exact `.gitignore`
exception; all other certificate/private-key exclusions remain in place. There
is no npm `files` restriction or `.npmignore`. The standard Railpack Node app
image includes the application files; the npm build only replaces `dist`, leaving
`certs` intact. No certificate-copy build step is needed. Any future custom image
or artifact-only deployment must explicitly retain `certs` alongside `dist`.

Keep `DATABASE_SSL_MODE=verify-full` (or leave it unset for that default).
`rejectUnauthorized: true` remains unchanged. Never use TLS bypasses to address
CA failures. Review a replacement CA against Supabase's confirmed certificate
identity before rotation or expiry; update this fingerprint and the test together.

Keep `[TEMPORARY_READINESS_DIAGNOSTIC]` for **one more Railway deployment**.
After deploying these files and setting the variable, verify `/ready` returns 200
and the TLS failure is absent before removing that temporary diagnostic in a
separate change. Local tests do not prove the deployed Railway connection.

Deployment references: [Railway service roots](https://docs.railway.com/deployments/monorepo)
and [Railpack Node](https://railpack.com/languages/node/).
