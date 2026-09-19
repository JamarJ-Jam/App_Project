# Chawgee repositories

Future domain repositories belong here. Routes call domain services; services
call repositories; repositories use `database.query` or a supplied `SqlExecutor`
from `database.transaction`. Do not create pools or write SQL in routes.

Pass one transaction executor through all participating repositories and await
every query. Do not call the global database or start another transaction inside
a transaction callback. The executor must not escape the callback.

Database failures become `DatabaseError` without raw SQL, parameters, or driver
details. Transaction callback failures are also normalized; perform domain
validation outside the callback or return a typed business result. A failed
COMMIT may have an unknown outcome; future mutations require idempotency, not
blind retry. No automatic retries are provided here.
