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
