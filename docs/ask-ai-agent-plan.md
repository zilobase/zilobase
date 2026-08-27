# Ask AI Agent implementation plan

Status: approved for staged implementation  
Reference: <https://www.notion.com/help/notion-agent> (reviewed 2026-08-27)  
Owner: Zilobase product and engineering

## Outcome

Ask AI becomes a permission-scoped Zilobase teammate that can research, plan,
and complete multi-step work across Zilobase and explicitly connected apps. It
must never claim an action succeeded unless a tool returned a durable success,
and it must not expose tools for operations the product or current user cannot
perform.

This is capability parity, not UI or naming imitation. Zilobase keeps its own
interaction model and uses its existing page editor, database services,
integrations, deployment adapters, and self-hosted runtime.

## Product contract

### The agent can

1. Answer from the current page, selected text, attached pages/databases,
   accessible workspace content, comments, retained page revisions, and
   connected sources. Answers cite the source records used.
2. Run bounded multi-step work. Each step is visible in chat, failures are
   explicit, and mutations are idempotent where practical.
3. Search accessible pages and databases; query database rows and properties;
   return results as interactive in-chat tables.
4. Create and edit pages, databases, supported properties, relations, rows,
   and supported views. It can configure filters, sorts, grouping, hidden
   properties, and conditional colors through existing mutation services.
5. Read user-uploaded PDF, CSV, XLSX, DOCX, PPTX, plain-text, Markdown, JSON,
   and ZIP files within documented size and extraction limits.
6. Analyze data, calculate results in an isolated job, and create downloadable
   CSV, XLSX, DOCX, PPTX, PDF, Markdown, JSON, or ZIP artifacts.
7. Use connected apps for the operations their adapters advertise. Read tools
   may run immediately. Consequential external writes require an explicit,
   expiring user confirmation that shows the exact target and payload.
8. Search, draft, send, label, archive, trash, and unsubscribe in Gmail when
   the connected adapter supports the operation.
9. Read calendars, query availability, rank meeting times, create or update
   scheduling links, and create/edit/cancel events when the user is allowed to
   do so. Calendar mutations require confirmation.
10. Read and organize a future Zilobase Inbox once that product surface exists.
    Until then the capability registry reports it as unavailable and no inbox
    tools are sent to the model.
11. Use per-user instructions and reusable skill pages, switch model and source
    scope per turn, attach pages/people/files, pin and search chat history, send
    response feedback, and use full-page, sidebar, or floating chat modes where
    the client supports them.

### The agent cannot

These boundaries are enforced by the capability registry and authorization
checks, not only by the system prompt.

1. Read inaccessible workspace content or connected-app data. The agent has
   the current user's permissions and no broader service identity.
2. Read content hidden inside non-PDF embeds, such as a video transcript, unless
   that content was separately attached or returned by an authorized connector.
3. Create database automations, database templates, page layouts, formula,
   rollup, or button properties. It may read and evaluate existing supported
   formula results.
4. Create, edit, resolve, delete, or react to page comments. It may read
   comments the user can view.
5. Share pages, invite people, or change page/database access levels.
6. Start AI Meeting Notes or create reminders.
7. Change workspace-level settings, member roles, billing, AI provider
   credentials, security controls, integration connections, or MCP servers.
8. Edit or cancel a calendar event when the connected provider says the user is
   not the organizer or otherwise lacks permission.
9. Perform external writes without confirmation, reuse an expired confirmation,
   silently expand source scope, or continue after a tool reports failure.
10. Execute arbitrary code in the API process, access the host filesystem, make
    unrestricted network requests, or retain uploaded files past policy.

### Platform qualifications

- Web and desktop may expose the full capability set.
- Mobile clients must not expose calendar mutations or connector/MCP setup.
- Self-hosted installations only expose configured models, object storage,
  artifact execution, and connector capabilities. Missing infrastructure is a
  visible unavailable capability, not an inferred success.
- Provider-specific actions are feature-detected through adapter descriptors;
  Ask AI does not hard-code that every connector can write.

## Current-state audit

| Area | Existing foundation | Gap to close |
| --- | --- | --- |
| Chat | Persistent user/workspace threads, streaming, auto-title, archive/delete | Pin, history search, feedback, per-thread settings |
| Context | Current page/database, `@` page/database attachments, skill pages | People, workspace search tools, source citations, comments/revisions |
| Models | Workspace model list and per-chat selection | Auto routing policy and capability labels |
| Native reads | Page context is serialized client-side | Server-side permission-scoped page/database search and reads |
| Page actions | Suggested page patch/full edits with client review | Server-created page body, newly-created page continuation, action receipts |
| Database actions | Create page/database/property/view/row, update property/view/data source, set cells, embed/link | Query tool, relations, supported map/form views, richer bulk operations |
| Connected apps | Gmail, GitHub, Calendar, Drive, Slack, Linear read tools through Toolkit/adapters | Capability negotiation, write tools, confirmation receipts |
| Files | Generic prompt-input attachment component exists | Chat wiring, upload/scan/extract lifecycle, artifact storage/download |
| Presentation | Full page and page sidebar chat | Floating mode, interactive tables, action approvals |
| Personalization | Skill pages can be attached | Persistent instructions, preferred sources, default behavior |
| Safety | Membership checks plus page/database mutation authorization | Central capability policy, audit log, quotas, negative capability tests |

## Architecture

### 1. Capability registry

Create one server-owned registry that describes every tool with:

- stable name and version;
- category and read/write/consequential effect;
- required product feature, adapter capability, client platform, and minimum
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

### 3. Confirmation protocol

Consequential external tools first return a proposed action. The server stores
only a payload hash, target summary, requesting user/workspace, tool version,
and a short expiry. The client renders Approve and Reject. Approval calls a
dedicated endpoint that atomically consumes the token, rechecks authorization
and adapter capability, runs the exact hashed payload once, and stores a
receipt. The model cannot approve its own action.

### 4. Files and artifacts

Uploads use object storage with workspace/user ownership, MIME sniffing,
malware/zip-bomb checks, size/page/row limits, and expiry. Extractors run out of
process or in an adapter-provided sandbox. Artifact jobs have no workspace
credentials or ambient network access; they receive only explicitly staged
files and return immutable outputs with checksums and expiring downloads.

### 5. Citations and interactive results

Native and connector read tools return normalized citations with source type,
stable record ID, title, optional fragment, and user-visible URL. Tabular
results return typed columns and bounded rows; the chat renderer supports sort,
filter, copy, export, and opening the source without converting results into a
permanent database unless the user asks.

### 6. Persistence

Add narrowly-scoped tables for:

- thread pin and per-thread preferences;
- user agent instructions/preferences;
- response feedback;
- uploads and generated artifacts;
- approval requests and action receipts;
- agent turns/tool executions and usage counters;
- retained page revisions only if no existing revision store can serve reads.

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

### Pass 2 — native Zilobase actions

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

### Pass 3 — files, analysis, tables, and artifacts

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

### Pass 4 — connected-app actions and approvals

- Extend runtime adapter descriptors with per-operation read/write capability.
- Add supported Gmail mutation tools and Calendar scheduling/mutation tools.
- Add supported Slack post/reply/edit-own-message/reaction tools.
- Use the confirmation protocol for every consequential external write.
- Enforce organizer/ownership/provider restrictions and mobile gates.
- Keep GitHub, Drive, Linear, or other providers read-only unless their adapter
  explicitly advertises a reviewed write operation.

Acceptance: approved actions execute exactly once with a receipt; rejection,
expiry, payload mismatch, missing provider capability, and organizer violations
execute nothing.

### Pass 5 — teammate experience

- Add persistent per-user instructions and preferred sources.
- Promote skill pages into reusable named skill attachments with a clear active
  state; instructions never expand permissions.
- Add page/person mentions and an All sources selector with availability states.
- Add pin/unpin, history search, and response thumbs up/down with optional reason.
- Add floating chat on web/desktop while retaining full-page and sidebar modes.
- Add suggested context-aware actions and model capability labels/Auto mode.

Acceptance: personalization applies to every new turn, pinned/history behavior
is durable, feedback is stored but not added to model context, and all modes use
the same thread and permission model.

### Pass 6 — operations, quotas, and audit

- Persist turns, tool executions, approvals, receipts, latency, token/file
  usage, and normalized failure codes without sensitive tool payloads in logs.
- Add workspace/user concurrency, step, token, file, artifact, and retention
  limits with admin-visible configuration where appropriate. The agent cannot
  change those settings.
- Add cancellation, retry boundaries, stale approval cleanup, artifact/upload
  retention cleanup, and adapter timeout/circuit-breaker behavior.
- Cover the capability matrix with permission, guest/teamspace, mobile,
  self-hosted, and connector-failure tests.

Acceptance: operators can explain a turn from audit metadata, quotas fail with
actionable errors, and cleanup jobs remove expired data without breaking chat
history.

### Pass 7 — final cleanup and parity audit

- Remove superseded prompts, duplicate tool metadata, dead client-only trust
  inputs, and transitional code.
- Consolidate shared tool presentation and source metadata.
- Run server/web builds, focused tests, full available quality suites, migration
  checks, and the self-hosted smoke path where infrastructure permits.
- Update README, architecture, changelog, self-host docs, and operator rollout
  guidance.
- Re-audit the reference capability list and this non-capability list line by
  line.

Acceptance: the final matrix marks every item implemented, intentionally
unavailable with a product prerequisite, or forbidden by policy; the repository
is clean after the final commit.

## Capability matrix and pass ownership

| Reference behavior | Zilobase delivery |
| --- | --- |
| Multi-step tasks | Existing bounded tool loop; standardize in Pass 1 |
| Current/selected/attached context | Existing page/database attachments; selected blocks and people in Pass 5 |
| Workspace and database Q&A | Pass 1 |
| Comments and revision search | Read-only in Pass 1; no comment mutations |
| Connected-app research | Existing connector reads; normalize/cite in Pass 1 |
| Slack actions | Pass 4 with capability check and confirmation |
| General MCP/connector servers | Passes 4–5; desktop/web setup only, never agent-managed |
| Create/edit pages | Existing partial support; complete in Pass 2 |
| Create/edit databases/views/properties/relations | Existing partial support; complete supported domain in Pass 2 |
| Interactive chat tables | Pass 3 |
| File ingestion and Q&A | Pass 3 |
| Calculations and downloadable files | Pass 3 |
| Inbox management | Unavailable until Zilobase Inbox exists; registry-gated |
| Gmail actions | Pass 4 with confirmation |
| Calendar scheduling | Pass 4 with organizer/mobile enforcement |
| Existing formula evaluation | Passes 1–2; no formula-property creation |
| Instructions and skills | Existing skill-page context; persistent experience in Pass 5 |
| Sidebar/floating/full-page modes | Existing sidebar/full page; floating in Pass 5 |
| Pin and search history | Pass 5 |
| Response feedback | Pass 5 |

## Commit and verification discipline

Commit subjects use `feat(ai):`, `test(ai):`, `docs(ai):`, or `refactor(ai):`
and name the completed pass. Before each commit:

1. inspect the diff and ensure unrelated user changes are absent;
2. run focused unit/integration tests for modified code;
3. run the relevant TypeScript build(s);
4. update this document's pass status and any public behavior docs;
5. commit only the files belonging to that pass.

If a required external adapter or infrastructure capability is absent, keep the
registry entry unavailable, test that state, and document the prerequisite. Do
not ship a model-visible stub that can imply the operation happened.
