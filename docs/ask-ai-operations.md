# Ask AI operations

Ask AI applies its limits and records audit metadata on the server. Client
settings can reduce context but cannot raise a quota, extend retention, or add
a tool. The implementation has no Toolkit dependency and exposes no connected-
app read or write tools until a native provider adapter is available.

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

Node deployments run maintenance on startup and every five minutes. Maintenance
deletes expired upload and artifact objects, clears extracted upload text, and
marks the metadata record `expired` so old chat links fail safely. It also closes
stale turns/action receipts and removes completed audit metadata and receipts
after the configured retention period. Chat messages and threads are not
deleted by this job.

Connected-app mutations are registry-gated as unavailable, so the server does
not create approval requests for them. A future native adapter must implement
the confirmation protocol in the agent plan—including payload hashes, expiry,
single consumption, and organizer/ownership checks—before its tools can become
model-visible.
