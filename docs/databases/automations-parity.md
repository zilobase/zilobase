# Database automations parity checklist

This checklist maps the product contract in `automations-spec.md` to the pass
that implements it and the acceptance evidence required before that pass can be
considered complete. Pass 0 establishes contracts only; all runtime rows remain
planned until their owning pass lands.

Status values: `contracted`, `planned`, `implemented`, `verified`.

## Foundation and lifecycle

| Capability | Pass | Required evidence | Status |
| --- | ---: | --- | --- |
| Versioned definition, trigger, action, expression, dependency, run, step, and delivery contracts | 0 | Shared contract tests parse every public variant and reject cross-definition limit violations | contracted |
| Canonical data-source ownership across linked containers | 2 | CRUD and linked-source integration tests resolve one owner/source | verified |
| Immutable revisions and pinned runs | 2, 4 | Concurrent-edit and queued-run revision tests | implemented |
| Active, paused, error, and soft-deleted lifecycle | 2, 4 | Transition table tests, including repair without implicit resume | implemented |
| Active-on-create and paused duplicate without history/secrets | 2 | CRUD integration tests | verified |
| Full-access, non-guest management | 2 | Access-level and page-guest route matrix | verified |
| Owner authority rechecked at execution | 4 | Revoked membership/source/target access tests | implemented |
| Dependency invalidation after delete, unlink, or type change | 2 | Property/view/source mutation integration tests | verified |
| Stable field-addressed validation and optimistic concurrency | 2 | Invalid definition and stale `If-Match` API tests | verified |
| Source-owned list, detail, catalog, lifecycle, and run APIs | 2, 4 | Route contract and secret-redaction tests | implemented |

## Event triggers and scope

| Capability | Pass | Required evidence | Status |
| --- | ---: | --- | --- |
| Page added, including move into a source and initial values | 3, 4 | Creation/move fixtures and event evaluator tests | implemented |
| Property edited and any property edited | 3, 4 | Every writable property type and title fixtures | implemented |
| Complete type/operator matrix | 4 | Table-driven operator suite with invalid pair rejection | implemented |
| Type-aware empty handling for null, missing, zero, and false | 1, 4 | Shared predicate fixtures | verified |
| Case-insensitive trimmed Unicode text comparison | 1, 4 | Browser/server equivalence fixtures | verified |
| `any` and `all` clauses, maximum 20 clauses | 0, 4 | Contract limit and evaluator truth-table tests | verified |
| Fixed three-second aggregation window | 3 | Clock-controlled merge/close tests | verified |
| First before/final after values and change-then-revert cancellation | 3 | Transaction and normalization fixtures | verified |
| Concurrent source/row changes open one window | 3 | PostgreSQL locking test | implemented |
| Origin eligibility and automation/system suppression | 3 | Full origin matrix | verified |
| Entire-source scope | 4 | Matching automation run integration test | implemented |
| View scope evaluated against final saved filter state | 1, 4 | Shared filter and after-edit membership tests | implemented |
| Deleted or incompatible view pauses the automation | 2, 4 | Dependency invalidation/runtime tests | planned |

## Internal actions and expressions

| Capability | Pass | Required evidence | Status |
| --- | ---: | --- | --- |
| Shared deterministic formula/parser/value implementation | 1 | Identical web/server fixtures with injected clock/timezone | verified |
| Trigger page/person, now/today, properties, relations, mentions, variables, and prior outputs | 1, 4 | Typed expression and ordered-action fixtures | implemented |
| Define up to 25 bounded variables | 0, 4 | Contract, size/list limit, and evaluation tests | implemented |
| Edit trigger page using valid set/add/remove/clear modes | 4 | Property-type operation matrix | implemented |
| Add a page with atomic initial values and stable receipt | 4 | Crash-before/after-receipt tests | implemented |
| Edit bounded related, variable, or filtered pages atomically | 4 | Authorization, 1,000-row bound, and no-partial-write tests | implemented |
| Sequential actions stop after terminal failure | 4 | Step-order and error-pause tests | implemented |
| Automation action writes cannot trigger automation chaining | 3, 4 | Capture-boundary origin test | implemented |
| Internal action retries do not duplicate logical effects | 4 | Lease-loss and duplicate-message tests | implemented |

## Schedules and external actions

| Capability | Pass | Required evidence | Status |
| --- | ---: | --- | --- |
| Daily, weekly, monthly, yearly, and custom schedules | 6 | Recurrence table suite | implemented |
| IANA timezone, DST gap/fold, leap year, month end, start/end | 6 | Clock-controlled recurrence fixtures | verified |
| Unique occurrence, one-minute scan, and bounded missed-run policy | 6 | Concurrent scanner and downtime recovery tests | implemented |
| Schedule excludes trigger-page action and references | 0, 6 | Contract/compiler and builder validation tests | verified |
| Durable in-product notifications and read state | 7 | Recipient, outbox, realtime, and polling tests | implemented |
| Gmail ownership, durable delivery, retry, and reconnect behavior | 8 | Provider contract and revocation tests | implemented |
| POST-only webhook with selected properties and encrypted headers | 9 | Payload and secret persistence tests | implemented |
| Webhook SSRF, DNS pinning, redirect, timeout, size, and retry controls | 9 | Controlled network security suite | implemented |
| Slack OAuth, authorized channels, formatting, mentions, and rate limits | 10 | OAuth/provider contract tests | implemented |
| External attempts are at-least-once with a stable delivery ID | 8–10 | Duplicate queue and provider retry tests | implemented |

## Management UI and operations

| Capability | Pass | Required evidence | Status |
| --- | ---: | --- | --- |
| Toolbar lightning control for inline/full-page databases | 5 | Browser workflow tests | implemented |
| Disabled, permission, linked-source, empty, loading, and error states | 5 | Access/state UI matrix | implemented |
| 448px anchored desktop panel and mobile drawer | 5 | Responsive browser tests | implemented |
| Live-generated/custom name and entire-source default | 5 | Builder model/UI tests | implemented |
| Stacked trigger/action cards, search, reorder, and deletion | 5 | Mouse and keyboard workflow tests | implemented |
| Inline validation and unavailable dependency/connector warnings | 5, 8–10 | Builder and connector-state tests | implemented |
| Dirty-builder discard confirmation | 5 | Close/back navigation tests | implemented |
| In-panel run and sanitized step history | 4, 5 | API redaction and UI drill-in tests | implemented |
| Keyboard operation, focus restoration, labels, announcements, no color-only status | 5 | Accessibility tests and manual audit | implemented |
| Hosted Cloudflare and self-hosted Node parity | 4, 6–11 | Adapter, restart, and deployment tests | implemented |
| Metrics, retention, cleanup, quotas, alerts, runbooks, and global kill switch | 3, 11 | Operational acceptance suite | implemented |
| Hosted canary, self-hosted opt-in, and rollback-safe disabling | 11 | Release checklist and operations runbook | planned |

## Explicit exclusions

- Database button properties and page button blocks do not execute through this
  project; only their future action language is kept compatible.
- Arbitrary JavaScript, SQL, shell commands, user code, page-body triggers,
  cross-workspace actions, workspace-wide automations, and automation chaining
  are not parity requirements.
- Exactly-once external provider delivery is not promised. Durable attempts use
  stable delivery identifiers and at-least-once semantics.
