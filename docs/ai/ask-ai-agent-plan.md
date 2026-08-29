# Ask AI Agent implementation plan

Status: complete

Reference: <https://www.notion.com/help/notion-agent> (reviewed 2026-08-27)

Owner: Zilobase product and engineering

## Outcome

Ask AI is a permission-scoped Zilobase teammate that can research, plan, and
complete bounded multi-step work with native Zilobase pages, databases, files,
and generated artifacts. It must never claim an action succeeded unless a tool
returned a durable success, and it must not expose tools for operations the
product or current user cannot perform.

This is capability parity, not UI or naming imitation. Zilobase keeps its own
interaction model and uses its existing page editor, database services,
deployment runtime, and self-hosted infrastructure.

## Product contract

### The agent can

1. Answer from the current page, attached pages/databases, accessible workspace
   content, and comments. Selected editor text has its own Ask AI rewrite flow.
   Workspace answers cite the source records used.
2. Run bounded multi-step work. Each step is visible in chat, failures are
   explicit, and mutations are idempotent where practical.
3. Search accessible pages and databases; query database rows and properties;
   return results as interactive in-chat tables.
4. Create and edit pages, databases, supported properties, relations, rows,
   and supported views. It can configure filters, sorts, grouping, hidden
   properties, and conditional colors through existing mutation services.
5. Read user-uploaded PDF, CSV, XLSX, DOCX, PPTX, plain-text, Markdown, JSON,
   and ZIP files within documented size and extraction limits.
6. Analyze data with a bounded deterministic calculator and create downloadable
   CSV, XLSX, DOCX, PPTX, PDF, Markdown, JSON, or ZIP artifacts.
7. Use per-user instructions and reusable skill pages, switch models, attach
   pages/people/files, pin and search chat history, send response feedback, and
   use full-page, sidebar, or floating chat modes where the client supports
   them.

### The agent cannot

These boundaries are enforced by the capability registry and authorization
checks, not only by the system prompt.

1. Read inaccessible workspace content. The agent has the current user's
   permissions and no broader service identity.
2. Read content hidden inside non-PDF embeds, such as a video transcript, unless
   that content was separately attached.
3. Create database automations, database templates, page layouts, formula,
   rollup, or button properties. It may read and evaluate existing supported
   formula results.
4. Create, edit, resolve, delete, or react to page comments. It may read
   comments the user can view.
5. Share pages, invite people, or change page/database access levels.
6. Start AI Meeting Notes or create reminders.
7. Change workspace-level settings, member roles, billing, AI provider
   credentials, or security controls.
8. Silently expand source scope or continue after a tool reports failure.
9. Execute arbitrary code in the API process, access the host filesystem, make
   unrestricted network requests, or retain uploaded files past policy.

### Platform qualifications

- Web and desktop expose the implemented capability set.
- Mobile clients do not expose floating mode or conversation pin controls.
- Self-hosted installations expose only configured models and available object
  storage. Missing infrastructure produces an actionable failure, not an
  inferred success.

## Current-state audit

| Area | Existing foundation | Gap to close |
| --- | --- | --- |
| Chat | Persistent user/workspace threads, streaming, auto-title, archive/delete | Pin, history search, feedback, per-thread settings |
| Context | Current page/database, `@` page/database attachments, skill pages | People, workspace search tools, source citations, comments/revisions |
| Models | Workspace model list and per-chat selection | Auto routing policy and capability labels |
| Native reads | Page context is serialized client-side | Server-side permission-scoped page/database search and reads |
| Page actions | Suggested page patch/full edits with client review | Server-created page body, newly-created page continuation, action receipts |
| Database actions | Create page/database/property/view/row, update property/view/data source, set cells, embed/link | Query tool, relations, supported map/form views, richer bulk operations |
| Files | Generic prompt-input attachment component exists | Chat wiring, upload/scan/extract lifecycle, artifact storage/download |
| Presentation | Full page and page sidebar chat | Floating mode, interactive tables, action approvals |
| Personalization | Skill pages can be attached | Persistent instructions, preferred sources, default behavior |
| Safety | Membership checks plus page/database mutation authorization | Central capability policy, audit log, quotas, negative capability tests |

## Architecture

### 1. Capability registry

Create one server-owned registry that describes every tool with:

- stable name and version;
- category and read/write/consequential effect;
- required product feature, client platform, and minimum
  access level;
- input/output schema and display metadata;
- confirmation policy;
- audit and idempotency policy;
- availability reason when disabled.

The registry builds the model's tool set only after authenticating the user and
resolving the active workspace. Client flags can reduce availability but never
grant it. Negative capabilities live alongside positive ones so policy remains
testable and discoverable.

### 2. Turn context and orchestration

The client sends only stable references, selected source IDs, attachments,
platform, and model preference. The server resolves access and loads content.
It records a turn ID, applies per-turn budgets, and lets the model call tools in
bounded steps. Tool results use a common envelope:

```ts
type AgentToolResult<T> = {
  ok: boolean
  status: "succeeded" | "failed" | "approval_required" | "unavailable"
  summary: string
  data?: T
  citations?: AgentCitation[]
  receipt?: AgentActionReceipt
  error?: { code: string; retryable: boolean }
}
```

Every mutation rechecks authorization at execution time. IDs from one tool may
feed later steps, but never become an authorization grant.

### 3. Files and artifacts

Uploads use object storage with workspace/user ownership, MIME sniffing,
archive-bomb checks, size/page/row limits, and expiry. Bounded extractors and
deterministic analysis receive only explicitly owned files. Generated artifacts
have no ambient network access or workspace credentials and return immutable
outputs with checksums and expiring downloads.

### 4. Citations and interactive results

Native read tools return normalized citations with source type,
stable record ID, title, optional fragment, and user-visible URL. Tabular
results return typed columns and bounded rows; the chat renderer supports sort,
filter, copy, export, and opening the source without converting results into a
permanent database unless the user asks.

### 5. Persistence

Add narrowly-scoped tables for:

- thread pin and per-thread preferences;
- user agent instructions/preferences;
- response feedback;
- uploads and generated artifacts;
- action receipts;
- agent turns/tool executions and usage counters;
- sanitized turn and tool-execution audit metadata.

Store large extracted text and artifacts in object storage, not chat message
JSON. Chat messages retain safe display parts and durable references.

## Delivery passes

Each pass ends with focused tests, type/build checks appropriate to the changed
apps, a documentation update, cleanup of code made obsolete by that pass, and a
separate commit. A later pass may depend on earlier commits but must not hide an
unverified partial feature behind optimistic UI.

### Pass 0 — contract and baseline (complete)

- Check in this plan and capability matrix.
- Record existing tools and explicit non-capabilities.
- Define acceptance gates and commit discipline.

Acceptance: reviewers can map every reference capability or restriction to an
implementation pass, an existing Zilobase capability, or a declared unavailable
product prerequisite.

### Pass 1 — secure workspace intelligence (complete)

- Introduce the typed capability/result contracts and central policy builder.
- Add permission-scoped tools to search workspace pages, read a page, query a
  database/data source, and read available comments/revision summaries.
- Resolve all content server-side and cap result sizes.
- Return citations and show them in chat.
- Replace prompt-only negative rules with tool exclusion and tests.

Implementation note: current page comments are available read-only. Page
revision search remains registry-gated as unavailable because Zilobase does not
yet retain page revision history; no model-visible stub is exposed.

Acceptance: a user can ask a workspace-wide question without manually attaching
every page; inaccessible pages/rows never appear in results or citations.

### Pass 2 — native Zilobase actions (complete)

- Move page mutations to durable server action receipts while preserving page
  diff review and undo in the editor.
- Allow creation of a page with body content and continuation against the newly
  created page ID.
- Complete supported database reads/writes: bulk row creation/update, relations,
  view configuration, and map/form views if the core database domain supports
  them. Do not expose unsupported advanced-property or automation tools.
- Add idempotency keys and cache/realtime reconciliation.

Acceptance: end-to-end prompts can create a populated project page/database,
edit it, and report durable IDs; forbidden comment/share/settings actions have
no callable tools.

Implementation note: native mutations now reserve a thread-scoped idempotency
key and persist a durable receipt before reporting success. A new page may be
created with Markdown content and used by later steps in the same turn. Pages
outside the open editor use a stale-write guard; the open editor retains its
review/undo proposal flow. Database relations use the supported relation
property configuration, and form views are exposed. Map views and atomic bulk
row mutations are absent from the core database service, so map remains
registry-gated and rows are created/updated as bounded receipted steps rather
than through a misleading batch tool. Formula, rollup, and button property
schemas remain structurally excluded.

### Pass 3 — files, analysis, tables, and artifacts (complete)

- Wire prompt attachments through upload, validation, extraction, chat
  persistence, and expiry.
- Implement bounded readers for PDF, CSV, XLSX, DOCX, PPTX, text/Markdown, JSON,
  and ZIP.
- Add isolated calculation/data-analysis jobs.
- Render normalized tool tables interactively in chat.
- Generate downloadable CSV, XLSX, DOCX, PPTX, PDF, Markdown, JSON, and ZIP
  outputs and persist artifact references.

Acceptance: fixture-based tests upload each supported format, answer a cited
question, render a table, and download a verified artifact; malformed archives,
oversized files, and unsupported embeds fail safely.

Implementation note: chat uploads are user/workspace/thread owned, capped at
five files and 20 MB each, validated by file signature, and expire after 24
hours. Text, Markdown, JSON, CSV, DOCX, PPTX, XLSX, and bounded ZIP contents are
extracted server-side; PDF and supported images are passed to the configured
model from server-owned storage. ZIP central directories are checked before
decompression for encryption, entry-count, and expanded-size limits. Analysis
uses a deterministic table calculator with no arbitrary code, ambient network,
filesystem, or workspace credentials. Result tables support filtering, sorting,
copy, row navigation, and CSV export. Receipted artifacts support CSV, XLSX,
DOCX, PPTX, PDF, Markdown, JSON, and ZIP, are checksum-addressed in owned object
storage, and expire after seven days.

### Pass 4 — native-only cleanup (complete)

- Remove unused optional dependencies, configuration, routes, settings UI,
  source-selection code, tool metadata, and legacy endpoints.
- Move ordinary workspace and AI-model helpers into their owning feature
  namespaces.
- Drop the legacy persistence tables through a forward migration.

Acceptance: production bundles and dependency manifests contain only native
Ask AI capabilities, with no obsolete source selector, routes, settings, or
active persistence model.

### Pass 5 — teammate experience (complete)

- Add persistent per-user instructions and workspace behavior preferences.
- Promote skill pages into reusable named skill attachments with a clear active
  state; instructions never expand permissions.
- Add page/person mentions.
- Add pin/unpin, history search, and response thumbs up/down with optional reason.
- Add floating chat on web/desktop while retaining full-page and sidebar modes.
- Add suggested context-aware actions and model capability labels/Auto mode.

Acceptance: personalization applies to every new turn, pinned/history behavior
is durable, feedback is stored but not added to model context, and all modes use
the same thread and permission model.

Implementation note: personal instructions and response style are resolved on
the server for every turn together with accessible pages explicitly marked as
AI instructions. People mentions are server-verified workspace references and
never grant content access. Reusable skill attachments have a distinct active
state, while page and database context keep their existing authorization path.
Thread pinning and message-aware history search are durable; feedback is stored
separately from chat parts and is never replayed to the model. The full-page
chat and persisted docked/floating desktop panel share the same thread store.
Model selection includes an Auto policy and operator-provided capability
descriptions.

### Pass 6 — operations, quotas, and audit (complete)

- Persist turns, tool executions, action receipts, latency, token/file
  usage, and normalized failure codes without sensitive tool payloads in logs.
- Add workspace/user concurrency, step, token, file, artifact, and retention
  limits with admin-visible configuration where appropriate. The agent cannot
  change those settings.
- Add cancellation, retry boundaries, stale receipt cleanup, artifact/upload
  retention cleanup, and provider timeout/retry behavior.
- Cover the capability matrix with permission, guest/teamspace, mobile,
  self-hosted, and unavailable-capability tests.

Acceptance: operators can explain a turn from audit metadata, quotas fail with
actionable errors, and cleanup jobs remove expired data without breaking chat
history.

Implementation note: Postgres-backed turn reservations serialize workspace and
user concurrency checks across replicas. Sanitized turn/tool audit rows retain
only IDs, finite status/error labels, counts, usage, and timing—never prompts or
tool payloads. Admin-only endpoints expose the latest audit metadata, while a
member endpoint exposes effective limits. Provider retries, total/step/chunk
timeouts, the existing client cancellation signal, rolling 24-hour turn/token/
upload/artifact quotas, stale-run recovery, and scheduled blob/audit cleanup are
active. Expired objects are removed while their metadata is marked expired so
chat history remains structurally intact.

### Pass 7 — final cleanup and parity audit (complete)

- Remove superseded prompts, duplicate tool metadata, dead client-only trust
  inputs, and transitional code.
- Consolidate shared tool presentation and remove obsolete source metadata.
- Run server/web builds, focused tests, full available quality suites, migration
  checks, and the self-hosted smoke path where infrastructure permits.
- Update README, architecture, changelog, self-host docs, and operator rollout
  guidance.
- Re-audit the reference capability list and this non-capability list line by
  line.

Acceptance: the final matrix marks every item implemented, intentionally
unavailable with a product prerequisite, or forbidden by policy; the repository
is clean after the final commit.

Implementation note: the client no longer sends an edit-permission claim, and
all mutation availability is derived server-side. Native agent steps use one
shared presentation without obsolete source metadata. Web and desktop
support a persisted docked/floating switch; mobile stays docked and omits pin
controls. The line-by-line result is recorded in
[`ask-ai-parity-audit.md`](./ask-ai-parity-audit.md).

## Capability matrix and pass ownership

| Reference behavior | Zilobase delivery |
| --- | --- |
| Multi-step tasks | Existing bounded tool loop; standardize in Pass 1 |
| Current/selected/attached context | Current and attached page/database chat context, server-verified people mentions, plus the editor selection rewrite flow; complete |
| Workspace and database Q&A | Pass 1 |
| Comments and revision search | Comments are read-only; revision history is unavailable because Zilobase retains no revision store |
| Create/edit pages | Existing partial support; complete in Pass 2 |
| Create/edit databases/views/properties/relations | Existing partial support; complete supported domain in Pass 2 |
| Interactive chat tables | Pass 3 complete |
| File ingestion and Q&A | Pass 3 complete |
| Calculations and downloadable files | Pass 3 complete |
| Inbox management | Unavailable until Zilobase Inbox exists; registry-gated |
| Existing formula evaluation | Passes 1–2; no formula-property creation |
| Instructions and skills | Persistent personal instructions, response style, instruction pages, and active skill attachments; Pass 5 complete |
| Sidebar/floating/full-page modes | Shared full-page thread model plus a persisted docked/floating desktop presentation; complete |
| Pin and search history | Complete; pin is intentionally desktop/web-only |
| Response feedback | Pass 5 complete; stored outside model context |

## Commit and verification discipline

Commit subjects use `feat(ai):`, `test(ai):`, `docs(ai):`, or `refactor(ai):`
and name the completed pass. Before each commit:

1. inspect the diff and ensure unrelated user changes are absent;
2. run focused unit/integration tests for modified code;
3. run the relevant TypeScript build(s);
4. update this document's pass status and any public behavior docs;
5. commit only the files belonging to that pass.

If a required product or infrastructure capability is absent, keep the registry
entry unavailable, test that state, and document the prerequisite. Do not ship
a model-visible stub that can imply the operation happened.
