# Permanent account identity — repository design

Status: identity migration applied in development. Repository implementation is
being introduced separately; no provider-user creation is included.

## Model and ownership

`chawgee.accounts` owns the permanent Chawgee UUID. Future business records must
reference this ID, never an email or provider subject. UUIDs for accounts and
bindings will be generated in trusted Node code using `node:crypto.randomUUID()`;
neither table has a UUID default. PostgreSQL's core `gen_random_uuid()` is available
on modern PostgreSQL (including 14+), so it would not inherently require a
Supabase extension. Application generation avoids any generator/version dependency
and lets the transaction prepare IDs before its first insert. Do not accept
account/binding IDs chosen by the mobile caller. Persisted IDs never change during
provider migration. Privileged SQL can still update account IDs without references;
immutability is also a repository contract and future column-grant restriction.

Account statuses: `active` permits normal operations; `suspended` denies access
without losing data; `pending_deletion` represents an inaccessible account that
has entered the future authenticated deletion workflow but has not yet reached
permanent deletion/anonymization. No retention or grace duration is defined;
permanent deletion semantics remain deferred. Status is not an entitlement and does not certify email
verification. Only `active` is eligible for authorization. No reactivation,
hard-deletion, or retention workflow is implemented by this migration.

`chawgee.auth_bindings` maps one verified `(issuer, subject)` to exactly one
account. `auth_provider` is adapter metadata (initially `supabase`), NOT the login
method and NOT an additional uniqueness discriminator. Exact, case-sensitive
identity comparisons use PostgreSQL's built-in C collation. Reject blank or padded
identifiers rather than silently normalizing signed subjects. Byte limits bound
unique-index entry size. The verifier must allowlist issuers and enforce field
formats; a database row does not prove an identity was verified.

For all three launch methods (email/password, Google, Apple), resolve the verified
Supabase token issuer and Supabase token subject. If Supabase links several login
methods to one Auth user, they resolve to ONE Chawgee binding, not three accounts.
If Supabase issues different subjects, those are distinct identities until an
explicit verified linking operation. Do not substitute Google/Apple subjects or
an email into a Supabase token's namespace. A future directly verified provider
can get its own trusted issuer/subject namespace and bind to the existing account.
Where provider subjects depend on OAuth client/tenant scope, include that scope in
the trusted adapter's canonical namespace and keep its derivation stable.

Multiple bindings per account are allowed. Do not make account_id unique. Email,
contact details, passwords, tokens, raw provider profiles, installation IDs, and
login-method inventories are omitted: none is needed for this ownership mapping.
Never merge accounts by email, including verified email or Apple relay addresses.

## Smallest eventual repository API

One `identityRepository.ts`, implemented in a later step, should provide:

- `resolveIdentity(sql, verifiedIdentity)` → account ID/status or absent.
- `insertAccount(sql, serverGeneratedId)` → new account.
- `insertBindingIfAbsent(sql, accountId, bindingId, verifiedIdentity)` → inserted
  binding or conflict; target the named identity uniqueness constraint.
- `getAccountStatus(sql, accountId)` → status or absent.
- `deleteUnboundCandidate(sql, candidateId)` → internal provisioning cleanup only.

Every operation accepts the existing `SqlExecutor`; no repository creates a pool.
Use qualified names and parameterized values. Services orchestrate transactions,
verification, linking proof, and status decisions. There are no HTTP routes or
middleware in this design. VerifiedIdentity is produced by a trusted verifier;
a TypeScript type alone is not proof. Account-ID parameters for linking come from
trusted authenticated context, never request ownership claims.

The service exposes `resolveOrProvision(verifiedIdentity)` and
`linkVerifiedIdentity(trustedAccount, verifiedIdentity)`. Neither gets called until
minimum production authentication is implemented. Linking requires recent proof
of control over both identities, and status checks under a lock on the target
account. An existing binding to the same account is idempotent; a binding to a
different account is a conflict, never an UPDATE/reassignment or automatic merge.
Provider deletion never triggers account deletion. Unlinking and account deletion
will require separate reviewed workflows; normal login does not delete bindings.

For future updates explicitly set updated_at using database time, bounded below
by created_at; defaults do not auto-update it. Account status transitions are a
service responsibility. Do not change a binding's identity key or account_id in
ordinary repository operations. To migrate providers, add a new verified binding.

## Concurrency-safe first login

Use the existing `database.transaction`, one connection and explicit READ COMMITTED
isolation (set at the start before any query). No nested transactions or provider
network calls inside the transaction.

1. Resolve the trusted issuer/subject. Return its account/status if present; never
   create a replacement account because it is suspended or pending_deletion.
2. If absent, generate candidate account and binding UUIDs server-side and insert
   the candidate account.
3. Insert the binding using `ON CONFLICT ON CONSTRAINT
   auth_bindings_identity_unique DO NOTHING RETURNING ...`.
4. If inserted, commit both rows together and return the candidate account.
5. If no row returned, another transaction won. Delete this transaction's unbound
   candidate (guard with NOT EXISTS on bindings), then resolve the winning binding
   with a SEPARATE SELECT. At READ COMMITTED this obtains a fresh snapshot after
   the conflicting insert waited for its competitor. A single CTE sharing the
   insertion snapshot cannot reliably read that winner.
6. Return the winner and its actual status. If a future unlink/deletion race makes
   it absent, perform at most three separate winner lookups after the losing
   transaction has ended, waiting 5 ms between attempts. This retry is only for
   post-conflict visibility and never provisions another candidate. If all three
   lookups remain absent, return a typed internal concurrency error. Never commit
   an orphan candidate.

Uniqueness is the ultimate guard, even for writers not following this algorithm.
Two contenders can temporarily insert candidates, but at most one account for the
identity is committed and retained. A crash before commit rolls back the candidate;
a crash/unknown outcome after COMMIT is recovered by resolving the same identity
on a new request. A different identity may legitimately have a separate account.

Any insert/cleanup/query failure escapes the callback and rolls back the entire
transaction. The existing helper deliberately hides SQLSTATE and normalizes
callback exceptions: do NOT try to catch 23505 inside it or continue an aborted
transaction. ON CONFLICT communicates the expected race without an exception;
return typed business conflicts instead of throwing them. Do not add blind retries
for arbitrary DatabaseError failures. Status can later change after resolution;
authorization must recheck it according to the application's suspension policy.

## RLS and roles

Defer RLS on these two identity-bootstrap tables. Identity resolution must locate
a binding before an account context exists, so pretending an account-scoped policy
already applies would be misleading. Data API is disabled and the new `chawgee`
schema must remain outside any exposed schema list. PUBLIC schema/table privileges
are explicitly revoked; no provider roles are referenced or created.

Before runtime use, separately provision least-privilege runtime grants (schema
USAGE and required operations only), distinct from the migration owner. Review
inherited/global default privileges and membership: revoking PUBLIC alone does
not revoke explicit grants to other roles. Do not grant access to mobile-facing
roles. The generated migration does not grant an application role automatically.
Do not enable the Data API for this schema. RLS can later protect business tables
using trusted Chawgee account context, independently of Supabase auth functions.

## Migration and rollback

UP creates a dedicated schema, accounts, bindings, and the account lookup index.
PKs and identity uniqueness create their own indexes. The binding FK uses RESTRICT
for update/delete. No trigger, extension, managed auth FK, or provider side effect
exists. Existing schema-name collisions deliberately fail rather than being hidden
by IF NOT EXISTS; resolve them before execution.

DOWN locks both tables and refuses if either contains records. It then drops the
binding table before accounts, followed by the schema with RESTRICT, in the
migration runner's transaction. Unexpected dependent objects also prevent a
destructive rollback. After identities exist, use a reviewed forward migration;
the DOWN section is not a data-erasure workflow.

## Proposed disposable-PostgreSQL integration tests (NOT executed)

Use an explicitly authorized disposable database, never the real development
project. Apply UP there, and test:

1. Server-generated account UUID differs from provider subject; two bindings with
   different issuers/subjects share an account and preserve its ownership ID.
2. Duplicate issuer/subject fails even with a different auth_provider or account;
   same subject under distinct trusted issuers is permitted. Case differences are
   distinct; empty/padded/oversized identity fields are rejected.
3. Invalid/null status, null UUID/timestamps and nonexistent account FKs fail;
   updated_at before created_at fails. Defaults initialize active and timestamps.
4. Deleting an account with a binding fails; no provider auth schema is needed.
5. Failure after candidate account insertion rolls back both operations; winner
   cleanup failure rolls back the loser rather than persisting an orphan.
6. Two independent connections pause after the absent lookup, then race the same
   identity. Both return one account, with one retained account and binding.
   Repeat with winner rollback, failure before COMMIT, and unknown COMMIT outcome.
7. Binding the same identity to two accounts yields one success and one conflict;
   suspended/pending_deletion accounts never cause replacement-account provisioning.
8. Restricted runtime role can perform only intended operations; PUBLIC and an
   unrelated role cannot access the schema/tables. Inspect default ACL effects.
9. DOWN refuses populated tables without data loss. On a fresh empty schema,
   UP → DOWN → UP succeeds; dependent-object rollback failure is atomic.

Current offline migration validation checks file conventions, not SQL execution.
Existing fake-pool tests validate transaction mechanics, not PostgreSQL constraints
or concurrency. These integration cases remain a gate before identity rollout.

Before production release, run the identity concurrency integration suite against
an isolated real PostgreSQL database. The environment must explicitly refuse
Supabase development and production hosts. The suite must validate simultaneous
same-identity provisioning, one surviving account and binding, both callers
resolving to the same account, no orphan candidate, later-login idempotency,
suspended and pending-deletion identities without replacements, rollback behavior,
and independent concurrent identities.

References:
- https://www.postgresql.org/docs/14/functions-uuid.html
- https://www.postgresql.org/docs/17/transaction-iso.html
