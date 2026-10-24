# Deploying Gemini search

Search remains disabled until `SEARCH_EMBEDDINGS_ENABLED=true` and a workspace owner or admin enables it in workspace settings. Set the same server-only `GEMINI_API_KEY` in API and background environments. Sidebar global search and pickers use keyword search. Ask AI has separate keyword and semantic tools; semantic retrieval ranks by similarity and never blends or falls back to keyword results. Enabling a workspace sends page text and supported stored property text to Google.

## Node processes

`ZILOBASE_PROCESS_ROLE=all` serves the API and consumes every background lane. `api` serves requests and publishes notifications without consuming them. `worker` consumes background work without opening the API listener.

`ZILOBASE_BACKGROUND_LANES` optionally selects comma-separated consumer lanes: `ai,fast,automation,calendar,search`. An empty value consumes every lane. Every process retains producers for every lane. Unknown, empty or duplicate entries fail configuration validation. A dedicated search replica uses role `worker` and lanes `search`. Keep consumers for the other lanes running as well.

All workers can run maintenance. Persisted maintenance leases coordinate ownership across replicas and lanes. Queue Redis must remain separate from realtime Redis.

The worker health listener defaults to `127.0.0.1:3001`. Configure `BACKGROUND_HEALTH_HOST=0.0.0.0` for container health probes and restrict access with network policy. Its `/ready` endpoint checks consumers and maintenance; it does not serve API routes.

## Compose

The default service uses combined mode. To isolate search, set the main consumer lanes to `ai,fast,automation,calendar` and enable the `search-worker` profile:

```sh
ZILOBASE_BACKGROUND_LANES=ai,fast,automation,calendar docker compose --profile search-worker up -d --scale search-worker=2
```

The worker inherits server credentials and database/Redis configuration, consumes only search, and probes port 3001. The main service still produces search notifications.

## Helm

The chart defaults to `node.processRole=all`. For independent scaling, use separate releases against the same database, cell, queue Redis and application secrets:

- API/general worker release: `node.processRole=all`, `node.backgroundLanes=ai,fast,automation,calendar`.
- Search release: `node.processRole=worker`, `node.backgroundLanes=search`, `ingress.enabled=false`; scale `replicaCount` independently.

Worker releases expose the health port instead of an API listener. The chart rejects ingress on worker releases. Set `search.enabled=true` in both releases and create the Secret selected by `search.existingSecret` with the `GEMINI_API_KEY` entry. No key is required when disabled. Enabled search adds outbound HTTPS to the configured `search.egressCIDRs`; use approved provider ranges or an egress proxy when applying narrower controls.

## Shared limits

Set `SEARCH_EMBEDDING_QUOTA_SCOPE` consistently for processes sharing the provider allowance. Within the same PostgreSQL database, minute reservations and cooldown are shared by API and workers. Separate databases cannot coordinate reservations; allocate provider capacity between them explicitly.

Defaults: 30 requests/minute, 100,000 reserved input tokens/minute, 20% interactive reservation, 10 million deployment indexing tokens/day and 1 million workspace indexing tokens/day. Configure `SEARCH_EMBEDDING_RPM`, `SEARCH_EMBEDDING_TPM`, `SEARCH_EMBEDDING_DAILY_TOKENS` and `SEARCH_EMBEDDING_WORKSPACE_DAILY_TOKENS`. Conservative input reservations use UTF-8 bytes; provider-reported tokens are recorded and reconciled separately.

`ZILOBASE_BACKGROUND_SEARCH_CONCURRENCY` defaults to 4. More worker replicas increase consumers while the database quota remains shared. Provider HTTP calls happen outside database transactions. Invocation progress is checkpointed; abrupt shutdown is recovered through leases and durable dispatch. A crash after provider success can result in a billed repeat call.

## Database indexes

PostgreSQL 17 with pgvector >= 0.8.0 is required even when search is disabled. Use the pinned repository database build and run capability preflight before migrations. See [the database image guide](../deploy/postgres/README.md).

For an existing populated installation, rebuild each partition's HNSW index concurrently through a direct administrative connection:

```sh
node --env-file=/secure/database.env scripts/search/rebuild-vector-indexes.mjs
```

This command checks for the expected 32 partition indexes and runs outside migration transactions. It must not use a transaction-mode connection pool.

## Community Cloudflare

The API and background templates declare `SEARCH_INDEXING` and the
`zilobase-search-indexing` queue, plus its DLQ consumer. Provision these resources
before enabling the deployment flag. Set the same conditional `GEMINI_API_KEY`
secret and quota configuration on both Workers. The default remains disabled;
Gemini credentials are not unconditional Wrangler requirements.

The consumer takes one message at a time with concurrency 4 and five transport
retries. The shared indexing handler uses a 45-second work budget, checkpoints
batches, and persists normal continuation separately from transport retries.
Minute cron runs recovery and cleanup. Database state remains authoritative when
messages are duplicated or publication is lost.

Use Hyperdrive for application connections and a direct administrative database
connection for migrations and index maintenance. The pgvector preflight is
required before applying the schema. Transaction-local vector settings must
remain scoped to the same connection as retrieval. Shared Worker code uses
standard fetch and the existing database/background adapters.

Validate a Wrangler dry-run bundle with
`node scripts/search/check-worker-bundle.mjs /absolute/path/to/worker.js`.
The check requires its source map and rejects Node queue/storage SDKs and
filesystem/process imports while checking that the shared indexing handler is
present. Worker/real-Postgres acceptance is a separate gate from bundle checks.

## Retrieval tuning and verification

The final large-set path uses one authorized pool of at most 2000 chunks,
relaxed iterative HNSW scanning, and actual cosine reranking before page fusion.
It uses ef_search 1000, max_scan_tuples 100000 and scan_mem_multiplier 4;
smaller diagnostic windows start at 100. Sets of at most 10,000 eligible chunks
use exact retrieval. The database phase reserves time for authorization/response
within the 2.5-second request budget. JIT and vector settings are transaction-local.

These settings were refined by the million-chunk gate; repeating full workspace
eligibility for progressive windows exceeded the interactive budget. See the
[evaluation record](search-evaluation/README.md) for measured recall, latency,
resource costs and limitations. See the [release runbook](search-release.md) for
coverage, staging/production activation and operator acceptance gates.

## Search operations

Run `node --import tsx apps/server/src/scripts/search-ops.ts status --cell CELL`
with server environment variables loaded securely. Add `--workspace ID` to scope
a command to one workspace. The explicit cell must equal `ZILOBASE_CELL_ID`;
workspace operations reject settings owned by another cell.

Commands: `status`, `backfill`, `reindex`, `retry`, `repair`, `cleanup`.
Backfill/reindex require a workspace. Backfill restarts the bounded scan; reindex
also increments the epoch. Retry resets at most 100 transient page failures and
100 exhausted invalidations per call. It preserves malformed-input/provider
validation failures and disabled workspaces. Repair recovers missing dispatch or
expired page leases through normal admission. Search deliveries refill and publish
the next work immediately after processing. Each workspace has at most five
outstanding page jobs (four consumers plus a buffer); delayed quota/budget
continuations retain their slots. Admission still rotates across workspaces.
Minute maintenance recovers lost wakes and publications and performs cleanup;
it does not pace the normal backfill pipeline.
Cleanup removes at most 500 obsolete chunks per call and retains active/current
staging data. Disabled workspaces can be cleaned with the deployment flag off.

Generic `background:ops replay` also reconnects finalized exhausted search work
to its new durable task. It rejects disabled, obsolete or already-replayed work.
All commands report bounded operational data; no source/query text or keys.
Status includes pending/failed pages, oldest dirty time, expired leases, dispatch
states, provider cooldown and the shared database maintenance heartbeat.

Existing process metrics include search provider latency, reserved/reported
usage, query-vector cache hits, generated/reused chunks, publication/stale work,
indexing lag, retrieval availability reasons, database duration, candidate refill and
final authorization rejections. Labels are closed outcomes plus runtime/cell,
never workspace/page/query identifiers. Queue delay/retries/exhaustion use the
existing background metrics. Node exposes these through its existing metrics
listener. Worker process counters are ephemeral; persisted status and provider
usage buckets remain authoritative across invocations.

Implementation targets the fresh schema. The owner permits breaking releases
and disposal of stale test data; no legacy upgrade or rollback package is needed.
