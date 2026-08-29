# Ask AI operations

Ask AI applies its limits and records audit metadata on the server. Client
settings can reduce context but cannot raise a quota, extend retention, or add
a tool.

Chat uses server-owned canonical turns at
`POST /api/ai/threads/:threadId/turns`. The legacy endpoint is disabled unless
`AI_LEGACY_CHAT_ENABLED=true`; do not enable it for untrusted clients.

## Provider credentials

`OPENAI_API_KEY` is the managed fallback. Workspace owners and admins may save
a workspace credential only when `AI_PROVIDER_CREDENTIAL_ENCRYPTION_KEY` is a
base64-encoded 32-byte operator secret. Credentials are stored as versioned
AES-GCM ciphertext and never returned by the API. Rotate legacy plaintext
credentials through workspace settings; plaintext values are not executed.
Custom provider base URLs must be HTTPS origins listed in the comma-separated
`AI_PROVIDER_ALLOWED_BASE_URLS` operator allowlist.

## Audit data

Every accepted or rejected chat turn receives an `ai_agent_turn` row. It stores
workspace, user, thread, requested model, status, timing, message/character/file
counts, step/tool counts, token usage, and a normalized error code. Each tool
execution stores its name, effect class, step, status, duration, and normalized
error code. Prompt text, page content, file content, tool input, tool output,
provider response bodies, and credentials are not audit columns.

Workspace owners and admins can inspect the latest sanitized records through:

- `GET /api/ai/operations/turns?limit=50`
- `GET /api/ai/operations/turns/:turnId/tools`

Any active workspace member can inspect the effective non-secret limits through
`GET /api/ai/operations/limits`. Audit endpoints recheck active membership and
the workspace admin role on every request.

## Defaults and overrides

| Variable | Default | Enforced range |
| --- | ---: | ---: |
| `AI_AGENT_MAX_CONCURRENT_TURNS_PER_USER` | 2 | 1–10 |
| `AI_AGENT_MAX_CONCURRENT_TURNS_PER_WORKSPACE` | 24 | 1–500 |
| `AI_AGENT_MAX_TURNS_PER_USER_PER_DAY` | 200 | 1–10,000 |
| `AI_AGENT_MAX_TOKENS_PER_USER_PER_DAY` | 500,000 | 10,000–10,000,000 |
| `AI_AGENT_MAX_UPLOAD_BYTES_PER_USER_PER_DAY` | 262,144,000 | 1 MB–2 GB |
| `AI_AGENT_MAX_ARTIFACTS_PER_USER_PER_DAY` | 50 | 1–1,000 |
| `AI_AGENT_MAX_ARTIFACT_BYTES_PER_USER_PER_DAY` | 262,144,000 | 1 MB–2 GB |
| `AI_AGENT_MAX_FILES_PER_TURN` | 5 | 1–5 |
| `AI_AGENT_MAX_INPUT_MESSAGES` | 500 | 10–500 |
| `AI_AGENT_MAX_INPUT_CHARACTERS` | 250,000 | 10,000–1,000,000 |
| `AI_AGENT_MAX_STEPS` | 15 | 1–15 |
| `AI_AGENT_MAX_OUTPUT_TOKENS` | 1,600 | 256–8,000 |
| `AI_AGENT_MAX_PROVIDER_RETRIES` | 2 | 0–5 |
| `AI_AGENT_TURN_TIMEOUT_MS` | 180,000 | 30,000–600,000 |
| `AI_AGENT_STREAM_STEP_TIMEOUT_MS` | 60,000 | 10,000–180,000 |
| `AI_AGENT_STREAM_CHUNK_TIMEOUT_MS` | 30,000 | 5,000–120,000 |
| `AI_AGENT_AUDIT_RETENTION_DAYS` | 90 | 7–365 |
| `AI_AGENT_CLEANUP_BATCH_SIZE` | 100 | 10–1,000 |

Invalid and out-of-range values fall back to, or are clamped within, these safe
bounds. Limits are read server-side. Ask AI has no tool for changing them.

## Cancellation, failure, and cleanup

The chat Stop control aborts the provider request. The turn becomes `cancelled`
and any still-running tool audit row is closed without replaying the operation.
Provider calls have total, per-step, and stalled-chunk timeouts plus bounded
retries. Failures use finite error codes such as `provider_timeout`,
`provider_rate_limited`, `permission_denied`, and `capability_unavailable`.

Node deployments run a PostgreSQL leased AI-job worker continuously and
maintenance on startup and every five minutes. Hosted deployments dispatch the
same idempotent handlers through the `AI_JOBS` Cloudflare Queue. Upload
extraction, meeting summaries, and thread compaction expose durable job status
at `GET /api/ai/jobs/:jobId`.

Maintenance
deletes expired upload and artifact objects, clears extracted upload text, and
marks the metadata record `expired` so old chat links fail safely. It also closes
stale turns/action receipts and removes completed audit metadata and receipts
after the configured retention period. Chat messages and threads are not
deleted by this job.

## Rollout checklist

1. Apply database migrations before starting the new application image.
2. Configure `OPENAI_API_KEY` and verify object storage before enabling file or
   artifact workflows.
3. Configure `AI_PROVIDER_CREDENTIAL_ENCRYPTION_KEY` before enabling workspace
   BYOK and preserve old key versions during a credential rotation.
4. Confirm migrations created the GIN-backed `search_document` and
   `search_chunk` indexes and the `ai_job` lease table before enabling traffic.
5. Review the effective limits at `GET /api/ai/operations/limits`; override only
   variables that need installation-specific tuning.
6. Verify an ordinary member can search only accessible content and that a
   workspace admin can inspect sanitized turn/tool audit rows.
7. Exercise Stop, an oversized upload, an expired artifact link, and a denied
   page mutation before broad rollout.
8. Monitor normalized failure codes, latency, daily token/upload usage, and the
   scheduled cleanup job.

See the [capability parity audit](./ask-ai-parity-audit.md) for the exact product
boundary presented to users and models.
