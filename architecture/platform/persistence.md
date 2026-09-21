# Persistence

## Interface and flow

The database module creates pooled self-hosted connections or standalone runtime connections and exposes a context-scoped Drizzle client. runWithDb marks its scope inactive after the callback; streaming work needs runWithIndependentDbEnv. Effect programs use the [Db](../../apps/server/src/infrastructure/database/db.ts) service, which wraps `runWithDbEnv` and fails with `DatabaseUnavailable`.

Start at the [entrypoint](../../apps/server/src/infrastructure/database/index.ts); follow the [implementation](../../apps/server/src/infrastructure/database/schema.ts) and [related modules](../../apps/server/drizzle).

Database client lifetime is selected only by explicit runtime configuration:
Node uses the process pool and `ZILOBASE_RUNTIME_KIND=worker` uses a standalone
Hyperdrive connection per request. Database bindings are not runtime-detection
signals.

## Invariants and failure handling

Standalone PostgreSQL clients attach an error listener before connecting so a disconnect between queries is logged as `database.connection` instead of becoming an uncaught event. Failed connection attempts and queries still reject to their callers; the listener does not retry transactions.

Feature operations own transactions and access decisions. Schema declarations define tables, defaults, indexes and relationships; migration history is append-only. A structural schema move must produce identical metadata and no migration.

## Verification

See [tests or test configuration](../../apps/server/src/test-support) and [testing and quality](../setup/testing-and-quality.md). [Architecture index](../README.md).

## Schema ownership

The stable [schema aggregate](../../apps/server/src/infrastructure/database/schema.ts) explicitly exports the existing 108 tables. Domain declarations live under [schema/](../../apps/server/src/infrastructure/database/schema); feature code, Drizzle configuration and external adapters continue to consume the aggregate. Schema modules import the specific declaration they reference, never the aggregate, so the declaration graph remains acyclic.

- Authentication and workspaces own identity, membership and teamspace tables.
- Pages, page properties and placements are separate from database/data-source declarations. Placements refer to database rows without introducing a pages/databases initialization cycle.
- Databases own a required fractional row-order key, a durable versioned mutation journal, and idempotent command receipts. The realtime outbox tracks delivery attempts by referencing committed journal events.
- Mail connections, organization and synchronization own their respective tables; meetings and notifications own theirs.
- AI agents, MCP, conversations, execution, files and settings retain separate persistence responsibilities.
- Navigation, images, search, background work, instance settings and user settings own their focused tables.
- Column builders hold binary/search column types and timestamp defaults. Soft-delete columns depend on authentication's user declaration and reuse timestamp builders.

All table names, indexes, constraints, defaults and foreign keys remain unchanged. No migration was produced. The existing declarative-schema coverage and clone exclusions follow only the moved schema declarations; application runtime coverage and all thresholds remain unchanged. Mail uniqueness tests inspect Drizzle index metadata through the aggregate rather than searching schema source text.
