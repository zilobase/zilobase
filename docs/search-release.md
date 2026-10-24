# Gemini search release runbook

Use this with [deployment configuration](search-deployment.md), the
[implementation ledger](search-implementation.md), and the
[verification record](operations-evidence/2026-10-22-vector-search.md).

## Coverage and ownership

Sidebar global search and pickers use keyword search. Ask AI has separate keyword
(`search_workspace`) and semantic (`semantic_search_workspace`) tools. The model
can use either or both. Semantic retrieval searches indexed pages, ranked only by
cosine similarity. Keyword matches never enter semantic ranking. Semantic requests use `mode=semantic`;
unavailable or disabled semantic retrieval returns empty results with metadata,
without a keyword fallback. The server owns serialization, indexing, permissions,
retrieval and ranking; features owns client requests/cache behavior; web owns UI.
There is no model selector. The immutable profile fixes Gemini Embedding 2,
1536 dimensions, cosine distance, retrieval prompts and serializer/chunker policy.
A profile change requires another index generation/backfill.

Each page is indexed once. Embedded databases remain references; their row pages
are separate sources. Page content uses the existing ProseMirror-to-Markdown
converter, retaining headings/block positions. Title/body/property chunks have
page ownership and provenance; there is no document ID or context builder.
Supported stored properties are text, number, select, multi-select, status, date,
checkbox, URL, email, phone and ID. Current select/status labels are resolved
from their definitions. Unsupported values are omitted rather than serialized
as raw JSON.

No attachment extraction, image/PDF/audio/video embeddings, external crawling,
relation traversal, person expansion, formulas, rollups, buttons, derived
created/edited timestamps, place or verification serialization is included.
Multiple views of a row do not duplicate its page/property chunks. Independently
authorized properties remain separate chunks.

Structured keyword controls, user lookup and verification are documented in
[workspace search controls](search-controls.md). These use live metadata rather
than additional embedding inputs.

## Freshness, access and recovery

A page change records a monotonic indexing revision in the same transaction.
Post-commit publication is an optimization; maintenance recovers persisted dirty
work. Property/schema fanout is cursor-based and bounded. Debouncing is five
seconds, capped at thirty seconds after the first dirty write.

Workers use a 90-second renewable lease and fencing token, stage a complete
manifest, reuse exact-input embeddings and checkpoint batches of at most 16.
They stop within a 45-second work budget and persist normal continuation as a
new task. Provider calls run outside database transactions. Publishing requires
the same revision, profile, workspace epoch and fencing token. Duplicate
transport delivery cannot publish a partial or superseded generation. A crash
around an HTTP response can repeat a billed request; billing is at least once.

A dirty page's old vectors are immediately ineligible until its complete current
generation is ready. Keyword search remains available. Live page deletion,
workspace disablement, membership expiry/revocation, source access and property
revisions are evaluated during retrieval and final hydration. Old stored chunks
are never an authorization source. Ask AI must perform a live page/record read
before using discovered content as evidence or citing it.

One maintenance run admits bounded work round-robin across workspaces. Backfill
uses a captured high-water mark and scans 100 pages per continuation; fanout also
processes 100 distinct pages per continuation. New writes are captured throughout
the scan. Recovery is expected within two healthy minute-maintenance cycles;
provider/queue/database outages and configured budgets can defer completion.
Continuous editing has no immediate-indexing guarantee.

## Defaults and capacity

Both deployment and workspace enablement default off. API and background workers
need the same server-side Gemini credential and quota scope. Credentials are
never stored in the profile, client bundle, queue payload or telemetry.

Chunks target 2400 UTF-8 bytes, overlap at most 320 bytes, and cap the complete
formatted embedding input at 4096 bytes. These are byte limits, not exact Gemini
token counts. The provider never silently truncates. Reported token usage is
separate from conservative reservations; the OpenAI tokenizer is not used.

Background calls time out after 20 seconds; query embedding times out after
1.8 seconds. Interactive retrieval targets a 2.5-second response budget. Query
vectors are cached for ten minutes by workspace/user/profile/purpose/exact-input
hash, without retaining raw query text or caching authorized search results.

Initial search consumer concurrency is four. Shared PostgreSQL reservations
bound 30 requests/minute, 100,000 input tokens/minute, and reserve 20% of capacity
for interactive requests. Daily indexing budgets default to one million tokens
per workspace and ten million per deployment. These are configurable application
allowances, not Google quota claims. Budget exhaustion defers durable work.
Allocate quotas separately when deployments use different databases.

A 1536-component float vector alone is about 6 KiB, before text, provenance,
TOAST storage, table/index overhead and obsolete generations. HNSW adds substantial
storage and build cost. Use the recorded scale results for this fixture only;
measure your own page sizes, access patterns and real-vector distribution before
sizing production. Bound PostgreSQL maintenance memory and reserve space for
concurrent rebuilds and backup/restore. One dominant workspace can concentrate
work into one of the 32 hash partitions.

## Release gates

- Fresh database migration with pgvector; vector backup/restore and 32 indexes.
- Real Node + PostgreSQL + Redis acceptance, including process/queue failure.
- Real workerd + PostgreSQL + Queues/cron parity and interruption recovery.
- Global/settings/picker browser checks and Ask AI grounding regressions.
- Access, revision, epoch, fencing, partial-generation and property-source tests.
- Live Gemini relevance gates and selected retrieval Recall@20 versus exact.
- 10k/100k/1m scale report with machine details and partition/query-plan checks.
- Typechecks, architecture/public exports, package/server/adapter suites, hosted
  binding generation and API/background dry-run builds.
- Published database image digest and anonymous pull on both supported platforms.
- Flags remain disabled in committed defaults.

The owner explicitly permits a breaking release and disposal of stale test data.
No legacy upgrade compatibility or rollback package is required. Do not weaken
access checks, durable recovery or fresh-schema verification on that basis.
Concurrent unrelated worktree changes must pass their own checks before a whole
application release; recorded unrelated failures are not hidden by search tests.

## Rollout actions

Implementation tests do not deploy production. Perform these as explicit rollout
operations after the release gates pass:

1. Provision the published PostgreSQL/pgvector image or install pgvector >= 0.8.0
   on the external PostgreSQL 17 database. The extension is required even with
   search off. Run capability/privilege preflight before applying migrations;
   extension errors must stop migration.
2. Apply the fresh schema and verify vectors/HNSW through the actual database
   connection path. Hosted Hyperdrive requires transaction-local settings on
   the retrieval connection and disabled query caching.
3. Provision Cloudflare search queue/DLQ before producers; deploy compatible API,
   background consumers and web together. Hosted adapter compatibility is
   `0adf8ec`. For Node, keep consumers for every lane when splitting replicas.
4. Configure Gemini credentials/allowances in both API and background processes.
   Verify readiness, maintenance heartbeat, queue routing and source-free logs.
5. Enable the deployment capability in staging, then opt in one workspace.
   Complete backfill and check progress, failure codes, real-provider queries,
   property permissions, revocation, usage and provider unavailability.
6. Enable the production capability, then opt in a small workspace. Inspect lag,
   ready/failed counts, quota cooldown, result quality, request latency and
   retrieval availability before wider opt-in.

The owner/admin settings UI exposes enablement, progress, bounded failures and
reindexing. Reindex schedules work; it does not embed in the HTTP request.
Disabling immediately increments the workspace epoch, makes its vectors
ineligible and schedules chunk/query-vector cleanup. To stop provider calls for
the whole deployment, turn the deployment flag off. This is normal operational
control, independent of application version rollback.

## Troubleshooting and maintenance

Use the search operator commands described in the deployment guide, always scoped to the
correct cell and optionally workspace. Investigate configuration/authentication
failures before retrying; malformed vectors/inputs are terminal validation errors.
429 cooldown and exhausted daily budgets defer work without transport retry
storms. Repair missing dispatch and expired leases through durable admission.
Do not manually mark staged generations active.

Before changing a profile, create a new immutable profile and schedule bounded
backfill; never query vectors across embedding spaces. After PostgreSQL or
pgvector upgrades, verify the extension version and exact/ANN plans, then use
the concurrent per-partition rebuild command outside a migration transaction.

For a backup, use the existing database backup tooling or `pg_dump` against the
application database. Restore into PostgreSQL with the vector extension binaries
available and restore privileges sufficient to install the extension. Run the
same preflight first, then restore and verify profile/settings/page state,
1536-dimensional vectors, all partition indexes and an authorized search. Never
restore vectors into a plain PostgreSQL image lacking pgvector. Acceptance tests
exercise dump/restore of a database containing active vectors.
