# Vector search implementation ledger

Current behavior: sidebar global search and pickers use keyword search. Ask AI has separate keyword and semantic tools; semantic retrieval uses
vector ranking only, with no keyword fusion or fallback. The historical
verification ledger below records the original implementation.

Target: Gemini Embedding 2, 1536 dimensions, text only, opt-in per deployment and workspace.
The approved 25-pass plan in the implementation chat is the specification.
Baseline: `6966ac168e`; both application and hosted adapter were clean when implementation began.

| Pass | Commit scope                                    | Status                                                                                                                                                                                   |
| ---- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Contracts and regression fixtures               | Verified: 9 focused tests; server typecheck                                                                                                                                              |
| 2    | PostgreSQL/pgvector provisioning                | Verified: image build, upgrade, vectors/HNSW, backup/restore; 5 adapter tests; tooling tests                                                                                             |
| 3    | Page-owned vector schema                        | Verified: fresh migration; 12 focused tests including real schema constraints; server typecheck                                                                                          |
| 4    | Markdown chunking                               | Verified: 7 chunking tests, 13 converter/parser tests, server typecheck                                                                                                                  |
| 5    | Stored property chunks                          | Verified: 25 property serialization tests; server typecheck                                                                                                                              |
| 6    | Transactional invalidation                      | Verified: 73 search/mutation/collaboration tests; real invalidation triggers; server typecheck                                                                                           |
| 7    | Gemini provider                                 | Verified: 12 provider tests; server typecheck; live Gemini batch/query returned 1536 dimensions and correct semantic ranking                                                             |
| 8    | Quotas and query cache                          | Verified: 5 real-Postgres concurrency, quota, cooldown, accounting and cache tests; server typecheck                                                                                     |
| 9    | Search background lane                          | Verified: 32 shared delivery tests, 10 adapter tests, 15 Miniflare queue tests; server/adapter typechecks                                                                                |
| 10   | Resumable indexing                              | Verified: 7 real-Postgres tests covering publication, reuse, edits/disablement in flight, lease reclaim, durable continuation and failures; server typecheck                             |
| 11   | Backfill and maintenance                        | Verified: 104 search/background tests, including bounded backfill/fanout, admission recovery, lease recovery, debounce and cleanup; server typecheck                                     |
| 12   | Live SQL eligibility                            | Verified: 6 real-Postgres differential/adversarial tests over generated graphs, teams, guests, expiry, sources and revisions; server typecheck                                           |
| 13   | Hybrid retrieval                                | Verified: 5 real-Postgres ranking/fallback tests, 10 access/route regressions and affected read/AI regressions; server typecheck                                                         |
| 14   | HNSW retrieval                                  | Verified: 3 real-Postgres plan/recall/filter tests (600 chunks), 11 retrieval/access regressions, concurrent rebuild of 32 indexes; server typecheck                                     |
| 15   | Workspace controls                              | Verified: 5 real-Postgres operation tests for roles, capability, durable enablement, disable/reset fencing, idempotency and policy; server typecheck                                     |
| 16   | Shared client and UI                            | Verified: 9 shared cache/request tests, sidebar suite, server/features/web typechecks; browser acceptance scheduled for pass 23                                                          |
| 17   | Ask AI integration                              | Verified: AI discovery/live-read/replay regressions and 30 search/access/read-tool tests; server typecheck                                                                               |
| 18   | Node worker deployment                          | Verified: 12 Node runtime tests, adapter typecheck, Helm lint/API/worker renders and Compose validation; broker/process acceptance in pass 22                                            |
| 19   | Community Cloudflare runtime                    | Verified: workerd provider/chunking and delivery tests, template/inventory/readiness tests, typechecks, Wrangler dry-run and bundle inspection; real SQL acceptance in pass 23           |
| 20   | Hosted Cloudflare adapter (separate repository) | Verified: hosted `0adf8ec`; 79 Node and 14 Worker tests, type generation, builds/dry-runs, Hyperdrive preflight; production pgvector available but not installed                         |
| 21   | Operations and diagnostics                      | Verified: 102 search/background tests including real scoped operations/replay; server typecheck                                                                                          |
| 22   | Node acceptance and recovery                    | Verified: 15 real PostgreSQL/Redis/HTTP/process scenarios, fresh migration and vector restore; 102 search tests; server typecheck                                                        |
| 23   | Worker/browser parity                           | Verified: 15 Node and 10 real workerd/Postgres scenarios; matching chunks/hashes/vectors/ranking; 4 browser checks; 126 search/AI tests; server typecheck                                |
| 24   | Relevance and scale                             | Verified: live Gemini Recall@10 and exact Top-1 1.00; 10k/100k/1m scale gates, selected ANN Recall@20 >= 0.95, interactive <= 2123 ms; 103 search tests                                  |
| 25   | Verification and runbooks                       | Verified: published/pinned AMD64+ARM64 image; full server/package/adapter/type/architecture checks; release runbooks. Broad web suite has a recorded unrelated editor assertion failure. |

## Verification notes

- Docker daemon is available.
- Gemini credential validated read-only and stored with dotenvx encryption in Node development and hosted development/production envs. Production API and background Worker secrets were updated at the explicit user request. Live relevance evaluation passed; see the recorded evaluation reports.
- Production secrets were explicitly requested and configured. No production migrations, deployments, or workspace activation are authorized as incidental implementation actions.

Passes 6–11 connect transactional dirty state, post-commit admission, delayed queue notifications, resumable indexing, backfill and minute maintenance. Feature controls remain disabled.

Concurrent non-search changes appeared in runtime-adapter package/template docs/tests during pass 6; preserve them and stage only search-owned hunks.

Search access traversal fails closed when ancestry reaches 64 levels, including corrupt cycles. Final chunk hydration evaluates access, source membership, revisions and freshness in one SQL statement.

Pass 14 found and fixed freshness-subquery flattening that prevented ordered HNSW scans. Retrieval disables PostgreSQL JIT locally to avoid expensive compilation for short interactive queries. The 600-chunk fixture proves partition pruning, index availability and filtered ANN Recall@20 >= 0.95; release-scale evaluation is recorded in pass 24.

The user explicitly permits breaking changes and disposal of stale production test data. Legacy upgrade, compatibility-shim, and rollback requirements are removed. Fresh migrations, authorization, recovery, runtime parity, and relevance/scale gates remain required. Production rollout is still a separate explicit action.

Final release gates and the unrelated concurrent web failure are recorded in [the verification record](operations-evidence/2026-10-22-vector-search.md). Image publication was explicitly authorized; production application rollout remains separate. Both feature controls default off.
