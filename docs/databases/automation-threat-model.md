# Database automation threat model

## Assets and trust boundaries

Protected assets are workspace data, automation definitions, trigger snapshots, connector credentials, webhook headers, message content, delivery history, and the authority of the automation owner. Trust boundaries exist at browser/server APIs, database transactions, hosted queues or Node polling, OAuth callbacks, DNS/network egress, provider APIs, realtime publication, and administrator configuration.

## Threats and controls

| Threat | Primary controls |
| --- | --- |
| Cross-workspace or guest execution | Canonical source resolution, full-access/non-guest management checks, owner authority checks at save and run time, target access validation |
| Stale or confused definition execution | Immutable revision pinning, definition hashes, `If-Match`, stable IDs, dependency invalidation |
| Duplicate actions after crash/failover | Database leases, unique event/occurrence keys, deterministic action receipts, stable provider delivery IDs |
| Automation loops or privilege amplification | Semantic mutation origins and unconditional suppression of `origin=automation`; target authority is rechecked |
| Secret disclosure | Dedicated encrypted columns/write-only endpoints, AAD bound to workspace/owner/purpose/ID, protected connector summaries, redacted audit/health/log outputs |
| Webhook SSRF or DNS rebinding | HTTPS default, exact self-host HTTP allowlist, public-address validation, all-answer rejection, address pinning, redirect denial, response/time caps |
| OAuth interception/replay | Random state stored only as a hash, encrypted S256 PKCE verifier, short expiry, atomic single-use consumption, exact callback/scopes |
| Slack DM or unauthorized-channel delivery | Discovery limited to public/private channels visible to the bot, DM/MPIM exclusion, execution-time channel revalidation |
| Provider abuse or unbounded retry | Capability gates, bounded attempts/backoff/Retry-After, durable receipts, terminal error pause, workspace concurrency cap |
| Resource exhaustion | 100 active/source, 20 clauses, 50 actions, 5 webhooks, 1,000 edited rows, 20 notification recipients, 10 concurrent runs/workspace, bounded cleanup and payloads |
| Tampered operational endpoints | High-entropy bearer token compared by digest; aggregate-only response; endpoint disabled when no token is configured |

## Residual risk

External providers are at-least-once: a provider may accept a request and lose the response before Zilobase records success. Stable delivery IDs let compatible receivers deduplicate but cannot force every provider to do so. Workspace administrators control connector rollout and self-hosted HTTP exceptions. Database backups contain encrypted credentials and must receive the same access and retention protections as production.

Review this model when adding an action, mutation path, network destination, new expression/reference type, or non-PostgreSQL execution adapter. Database button-property execution remains outside this release.
