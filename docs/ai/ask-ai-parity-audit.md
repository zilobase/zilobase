# Ask AI capability parity audit

Reference: [Notion Agent help](https://www.notion.com/help/notion-agent),
reviewed 2026-08-27.

This audit maps the reference behavior to Zilobase without implying access to a
product surface Zilobase does not have. `Implemented` means the behavior has a
real UI/API path. `Unavailable` means the server-owned registry prevents a tool
from reaching the model until the named product prerequisite exists.
`Forbidden` means the boundary is intentional and enforced by tool exclusion,
authorization checks, schemas, or bounded execution.

## Research, context, and orchestration

| Reference behavior | Status | Zilobase implementation or qualification |
| --- | --- | --- |
| Work with the user's permissions | Implemented | Every workspace read and mutation rechecks the authenticated user, active membership, and item-level access on the server. Client flags cannot grant access. |
| Run complex, multi-step work | Implemented | The provider loop is bounded by server-controlled step, time, concurrency, and daily-usage limits. Tool steps are visible and audited; native mutations return durable idempotent receipts. |
| Use the current page | Implemented | Page chat includes the current page as primary context and revalidates the page reference server-side. |
| Use selected text/blocks | Implemented, qualified | The editor exposes an Ask AI selection rewrite flow. Selected blocks are not silently added to an unrelated chat thread. |
| Attach or mention pages/databases | Implemented | Page and database attachments are explicit, capped, and permission-checked. |
| Mention people | Implemented | Mentioned people are verified active workspace members and provide identity context only; a mention never expands content access. |
| Search all accessible workspace sources | Implemented | `searchWorkspace`, `readWorkspacePage`, and `queryWorkspaceDatabase` search only pages/databases the user can view and return normalized citations. |
| Read page comments | Implemented | `readPageComments` is view-permission scoped and read-only. |
| Read page revision/version history | Unavailable | Zilobase does not retain a page-revision store suitable for agent reads. No revision tool is exposed. |

## Native creation and editing

| Reference behavior | Status | Zilobase implementation or qualification |
| --- | --- | --- |
| Create pages with content | Implemented | `createPage` persists a Markdown body and returns the new durable page ID for later steps. |
| Edit pages | Implemented | `updateWorkspacePage` uses permission and stale-write checks. The open editor also supports reviewed diff/apply/undo proposals. |
| Create databases and data sources | Implemented | Native tools create databases, update supported data-source settings, and embed or link databases in pages. |
| Create and edit database views | Implemented, qualified | Table, kanban, timeline, chart, gallery, list, and form views are supported, including available filters, sorts, grouping, visibility, and color configuration. |
| Create map views | Unavailable | Map is absent from the core Zilobase database domain and from the tool schema. |
| Create/edit rows and cell values | Implemented | Row and cell tools run as bounded, receipted steps with authorization checked at execution time. |
| Create supported properties and relations | Implemented | Property schemas include supported native types and relation configuration. Formula, rollup, and button creation is structurally rejected. |
| Read/evaluate existing formula results | Implemented | Database queries return the existing evaluated property values. The agent cannot create or rewrite formula properties. |
| Return interactive tables | Implemented | Tool tables support filter, sort, copy, CSV export, and navigation to a source row. |

## Files, analysis, and generated outputs

| Reference behavior | Status | Zilobase implementation or qualification |
| --- | --- | --- |
| Read PDF, CSV, XLSX, DOCX, PPTX, ZIP, text, Markdown, JSON, and images | Implemented | Owned uploads are signature-validated, size/count limited, stored with expiry, and either bounded-extracted or passed as supported model media. ZIP encryption, entry-count, and expansion limits are enforced. |
| Calculate and analyze data | Implemented, qualified | `analyzeDataTable` performs deterministic aggregate/group calculations over bounded tables. |
| Execute simple or arbitrary code | Forbidden | There is no model-controlled code runner, host filesystem access, ambient network access, or arbitrary package execution. |
| Generate downloadable files | Implemented | `createDownloadableArtifact` creates checksum-addressed, expiring CSV, XLSX, DOCX, PPTX, PDF, Markdown, JSON, and ZIP artifacts in owned object storage. |

## Personalization and conversation experience

| Reference behavior | Status | Zilobase implementation or qualification |
| --- | --- | --- |
| Personal instructions | Implemented | Per-user instructions and response style are loaded server-side on every turn and cannot expand permissions. |
| Reusable skills/instruction pages | Implemented | Accessible pages marked as instructions and explicit skill attachments are loaded with a distinct active state. |
| Auto and explicit model selection | Implemented | Chat offers Auto plus configured workspace models and capability descriptions. Availability still depends on server configuration. |
| Full-page chat | Implemented | Uses the same persistent workspace/user thread store as the panel. |
| Docked sidebar | Implemented | The desktop/web panel can be docked in the right sidebar. Mobile uses the docked presentation. |
| Floating chat | Implemented on web/desktop | A persisted presentation switch renders the same active thread in a single floating panel. It is intentionally hidden on mobile. |
| Conversation history and search | Implemented | History is durable and can search titles and persisted messages. |
| Pin conversations | Implemented on web/desktop | Pin/unpin is durable and ordered ahead of regular history. The control is intentionally hidden on mobile to match the reference limitation. |
| Response feedback | Implemented | Thumbs up/down and an optional reason are stored separately and never replayed as model context. |
| Zilobase Inbox management | Unavailable | Zilobase has no Inbox product surface. No inbox tool is exposed. |

## Enforced non-capabilities

| Reference restriction | Status | Enforcement |
| --- | --- | --- |
| Content hidden inside non-PDF embeds | Forbidden | The capability policy tells the model not to claim it read hidden embed content, and no unrestricted fetch tool exists. |
| Database automations, templates, and page layouts | Forbidden | These operations have no model-visible tools. |
| Formula, rollup, and button property creation | Forbidden | Property input schemas exclude the advanced types and services reject type changes to them. |
| Create/edit/resolve/delete/react to comments | Forbidden | Ask AI exposes comments through a read-only tool only. |
| Share pages, invite people, or change access | Forbidden | No permission mutation tool exists; item authorization is only consulted, never delegated to the model. |
| Start AI Meeting Notes | Forbidden | Meeting capture is not in the agent tool registry. |
| Create reminders | Forbidden | No reminder tool exists. |
| Change workspace settings, roles, billing, security, or providers | Forbidden | The registry exposes no administrative mutation tools, and the audit/limit endpoints are read-only. |
| Claim success after denial/failure | Forbidden | The system policy requires a successful tool result; mutation results carry explicit status and durable receipts. |
| Expand source scope silently | Forbidden | The server resolves stable references against current permissions and caps inputs. |
| Retain uploads/artifacts indefinitely | Forbidden | Expiry is stored with each object; scheduled cleanup removes blobs and marks metadata expired while preserving chat structure. |

## Product boundary

The implemented Zilobase-native capability set is complete for the current
pages, databases, comments, files, artifacts, personalization, history, and
presentation domains. Revision history, map views, and an Inbox are marked
unavailable because their underlying product surfaces do not exist. Their
absence is part of the server capability contract: the model receives no stub
tool that could imply a read or mutation occurred.
