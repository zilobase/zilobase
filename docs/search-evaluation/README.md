# Search evaluation

Current evaluation compares separate semantic and keyword requests. Semantic
relevance gates cover meaning and paraphrases; the exact-title gate applies to
keyword search for the sidebar. Historical hybrid reports below predate the
separation and do not validate the current semantic-only ranking.

The corpus is `scripts/search/relevance-corpus.json`: 38 authored synthetic pages,
78 frozen queries, including 32 paraphrases, six property questions and 40 exact
title/identifier cases. Labels were checked against explicit source text before
measurement. This is an authored review, not independent human relevance review
or production traffic. No production content is included.

## Real Gemini relevance

Run against an isolated, migrated loopback database whose name contains `search`:

```sh
node --env-file=/secure/search-test-database.env --import tsx scripts/search/evaluate-live.mts
```

The command loads Gemini credentials from the configured server environment or
the encrypted development env file (`ZILOBASE_SEARCH_ENV_FILE` can override it).
It bounds the corpus to 64 documents / 100 queries, retains normal shared quotas,
cleans up its own workspace and writes `.test-results/search/live-relevance.json`.
It makes billable provider requests. It never runs as an ordinary unit test.
Use the supported database image, create a dedicated `zilobase_search_eval`
database, and apply the core migrations with `DATABASE_URL` pointing only to
that loopback database before running the command. Never point this evaluation
at a production database.

The recorded [Gemini report](2026-10-22-gemini.json) passed: semantic Recall@10
1.00, paraphrase Recall@10 1.00 versus keyword 0.00, exact title/identifier Top-1
1.00. Reported usage was 3,494 input tokens (2,320 indexing, 1,174 queries).
Reservations also include failures/missing usage; requests are at least once.

Document chunks and query vectors came from `gemini-embedding-2` at 1536
components, using the production serializers/provider/retrieval. Query vectors
are prepared into the scoped cache with a 20-second offline prefill HTTP budget
before measuring ranking, so this report
measures relevance, not cold-provider interactive latency. Provider delays and
fallback timing are covered separately by runtime acceptance.

These numbers establish a regression gate on a small, intentionally unambiguous
corpus. They do not estimate recall on an unknown production corpus or justify
comparing this configuration with public embedding leaderboards.

## Scale and filtered recall

Run `npm run test:search:scale`. It creates its own PostgreSQL/pgvector container,
then measures 10,000, 100,000 and 1,000,000 chunks. To select a supported size,
set `ZILOBASE_SEARCH_BENCHMARK_SIZES=100000`. The report is written to
`.test-results/search/scale.json`; fixtures are deleted after the run.

The fixture has 65 workspaces, an 80% dominant workspace, uneven page sizes,
private owners and selective direct grants. Vectors contain 1536 components,
with synthetic signal in 32 components. They are useful for repeatable database
and authorization diagnostics, not a substitute for full-dimensional real-data
ANN evaluation. The vector type uses external storage without compression, retaining its
1536-component width. The synthetic text/provenance payloads are much smaller
than typical application content; do not size a production database from this
total alone. Each measurement is a single local
run, not a latency percentile.

The selected retrieval path is compared with exact authorized page rankings.
Small eligible sets use exact search, while larger sets use HNSW. Raw ANN recall
is recorded separately: selective access can produce very poor raw ANN recall;
the exact path is essential. Every case must prune to one workspace partition,
meet selected-path Recall@20 >= 0.95 and complete the interactive fixture request
within 2.5 seconds. Index construction uses `maintenance_work_mem=2GB`, two parallel maintenance
workers and a 3 GiB container shared-memory mount. The report records Docker CPU
and memory limits and the database cgroup memory peak, including file cache.

The benchmark also exercises the full hybrid service with a local deterministic
query provider. That measurement includes query-cache accounting, eligibility,
retrieval, fusion and final authorization; it excludes WAN provider latency.
Ingestion throughput measures SQL fixture insertion, not Gemini embedding speed.
Storage includes the chunk table, TOAST storage and indexes.

## Changes required by the million-chunk gate

The first large run exposed repeated scans of materialized ancestry/permission
sets. Ownership and cycle exclusion now use materialized sets; root-parent
membership is computed in a set-based join rather than per ancestor. Short
search phases disable JIT locally. Exact retrieval selects the best chunk per
page before applying its limit.

ANN eligibility is applied inside SQL, including property revisions/access,
then checked again during hydration. The `IS TRUE` membership predicate keeps
PostgreSQL's hashed ACL filter on the ordered HNSW scan; a pulled-up semi-join
repeatedly scanned the permission set. Plan tests retain partition/index proof.

The initial strict iterative scan and early candidate-window stopping failed
the large fixture's recall gate. Large-set retrieval now obtains one bounded
2000-chunk pool using relaxed iterative scanning and reranks by actual cosine
distance before page deduplication/fusion. This also avoids repeating workspace
ACL construction for 100/500/2000 queries. The large pool uses `ef_search=1000`,
`max_scan_tuples=100000` and `scan_mem_multiplier=4`; smaller diagnostic windows
start at 100. The index remains `m=16, ef_construction=64`. These measured retrieval
adjustments replace the plan's initial progressive-window defaults.

Small authorized sets still use exact retrieval at the 10,000-chunk threshold.
The vector database phase reserves headroom for final authorization/fallback
within the 2.5-second interactive budget. No application-side workspace graph
is loaded. The scale gate uses a stable query-vector source order so synchronized
PostgreSQL scans cannot silently change the test query between runs.

## Recorded scale result

[Full scale report](2026-10-22-scale.json), macOS ARM64 M1 Max / 32 GiB host RAM,
Docker VM four CPUs / 7.74 GiB RAM, Node 26.8.2. PostgreSQL/pgvector were
17.10/0.8.7. Other verification processes ran during fixture/index preparation;
these are single local measurements, not isolated latency percentiles.

| Chunks    | Fixture ingestion | HNSW build | Chunk storage + indexes | Highest interactive request | Lowest selected Recall@20 |
| --------- | ----------------- | ---------- | ----------------------- | --------------------------- | ------------------------- |
| 10,000    | 1.53 s            | 3.49 s     | 0.166 GiB               | 175 ms                      | 1.00                      |
| 100,000   | 17.42 s           | 21.45 s    | 1.637 GiB               | 367 ms                      | 1.00                      |
| 1,000,000 | 207.54 s          | 670.29 s   | 16.283 GiB              | 2,122 ms                    | 0.95                      |

All nine interactive cases returned hybrid results and pruned to one partition.
At one million chunks the dominant workspace used ANN (Recall@20 0.95). The
selective actor had 8,860 eligible chunks and used exact retrieval (Recall@20
1.00); its diagnostic raw ANN recall was 0.55 and took 9.63 seconds. That raw ANN
measurement is outside the interactive path and demonstrates why the selective
exact path remains required.

Database cgroup peak memory was 6,331,473,920 bytes (5.90 GiB), including file
cache; it is not a PostgreSQL process-RSS estimate. Ingestion throughput is SQL
fixture construction (about 4,819 chunks/second at one million), not provider
embedding throughput. The corpus/geometry caveats above apply to all scale claims.
