# Workspace search controls

Ask AI's `search_workspace` and the shared structured API support exact search controls. Global search and pickers keep their existing keyword GET requests. `semantic_search_workspace` stays independent: it accepts a non-empty question, page types and a limit, ranks by semantic relevance, and rejects structured controls. Neither tool automatically falls back to the other.

The behavioral reference is [Notion's public MCP search documentation](https://developers.notion.com/guides/mcp/mcp-supported-tools#search-notion). This implementation uses Zilobase contracts and permissions; it does not reproduce Notion plan restrictions or claim identical ranking.

## Requests

`POST /search` accepts the following JSON. Ask AI uses the same fields without `workspaceId`, which is pinned to the chat.

```json
{
  "workspaceId": "workspace-id",
  "queryType": "content",
  "query": "launch",
  "types": ["page"],
  "filters": {
    "pageIds": ["parent-page-id"],
    "createdByUserIds": ["me"],
    "lastEditedAt": { "onOrAfter": "2026-10-01T00:00:00+05:30" },
    "titleOnly": true,
    "contentStatus": ["verified"]
  },
  "sort": "last_edited_desc",
  "limit": 10
}
```

`queryType` defaults to `content`; `query` defaults to an empty string; empty/omitted `types` means both pages and databases. New structured requests default to 10 results and accept 1–50. Search has no result-byte budget, cursor, or exact total. Responses explicitly report `exhaustive: false`.

Available filters:

| Field                       | Meaning                                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pageIds`                   | Include each accessible anchor and its canonical subtree. Primary page placements and database-row ancestry count; mentions and ordinary linked references do not. |
| `dataSourceIds`             | Select active row pages in accessible data sources, rather than database containers.                                                                               |
| `teamspaceIds`              | Match current teamspace assignments; multiple IDs are supported.                                                                                                   |
| `createdByUserIds`          | Match the searched object's creator. `me` means the authenticated actor.                                                                                           |
| `editedByUserIds`           | Match the latest content editor, rather than anyone who ever edited. `me` is supported.                                                                            |
| `createdAt`, `lastEditedAt` | Ranges with inclusive `onOrAfter` and exclusive `before`. At least one bound is required.                                                                          |
| `titleOnly`                 | Match the authoritative displayed title; exclude body-only matches and unrelated view names.                                                                       |
| `contentStatus`             | Match disjoint `verified`, `unverified`, or `expired` states.                                                                                                      |

Values within a field are ORed. Different fields are ANDed. IDs are deduplicated and sorted before cache keys are built. Dates require ISO timestamps with explicit offsets and normalize to UTC. Invalid ranges, unknown fields, excessive limits, and unsupported combinations return HTTP 400. Unsupported filters are never silently dropped.

An empty query requires a narrowing filter or exactly one content type. A sort, limit, `titleOnly` alone, both content types, or all three verification states alone does not narrow discovery. An inaccessible location produces no results and cannot broaden the search.

Sort values are `relevance`, `created_asc`, `created_desc`, `last_edited_asc`, `last_edited_desc`, `title_asc`, and `title_desc`. Defaults are relevance for keywords and title ascending for empty-query discovery. Ties use title, type and ID. Filters, access checks and ordering run before the result limit. Permission checks are repeated during hydration; foreign source/view names require access to their owning database.

Content responses have `type: "workspace_search"` and `results`. Results include creation/latest-edit timestamps, available actor IDs, and verification state/expiry. These are discovery metadata. Read important matches before relying on their content or citing them.

### User lookup

```json
{
  "workspaceId": "workspace-id",
  "queryType": "user",
  "query": "ada@example.com",
  "limit": 10
}
```

User lookup requires a non-empty name/email query. Omit content filters, types and sorting. Responses have `type: "user_search"` and `users` containing IDs, names and permitted emails. Exact email/name matches precede partial matches, with deterministic ties.

Lookup searches active workspace members. Owners/admins may also find workspace guests, matching existing guest-directory permissions. It excludes unrelated accounts and expired temporary members. OAuth requires the separate `users.read` scope; `search.read` alone never grants directory access. Existing tokens need fresh consent to gain this scope. User results neither populate content collections nor grant content reads/citation evidence.

## Editorial metadata and verification

Pages and databases track `last_edited_at` and nullable `last_edited_by_id`. New items start with their creator. Legacy items use their pre-migration update timestamp and retain an unknown historical editor. Unknown actors do not match editor filters.

Page titles, bodies and stored property values count as content edits. Database names, schema and shared view definitions count for their owning database. Presence, reads, comments, verification and private navigation preferences do not count. Collaboration captures the authenticated body editor before debounced persistence; timestamp guards prevent an earlier save from replacing newer attribution.

Verification is independent of the body clock and content-editor attribution. Page and database header menus expose status and a management dialog, including row pages, side panes and dialogs. Editors can verify/reverify indefinitely or until a future date, and remove verification. Readers can inspect status. Ordinary content edits preserve verification. Expiry is derived from the server clock on reads and updates in an open UI without a scheduled expiry job. Deleted verifier accounts do not invalidate verification.

Dedicated `GET`, `PUT` (`{ "expiresAt": null }` or an ISO timestamp), and `DELETE` endpoints live at `/pages/:id/verification` and `/databases/:id/verification`. They enforce existing view/edit permissions and OAuth read/write scopes. Verification has its own revision and shared-client query key; stale identity responses and older mutation acknowledgements cannot replace newer state. Ask AI can read verification but has no verification write tool.

Ownership workflows, reminders, wikis, editor history, connected sources and global-search filter UI remain outside this change.

## Deployment and verification

1. Apply additive migrations `0119_content_editor` through `0122_property_editor` before deploying the server/runtime changes.
2. Deploy the shared server operations and Node/Worker adapters, then clients. Re-embedding and semantic profile changes are unnecessary.
3. Refresh OAuth consent only for clients that need `users.read`. Existing keyword/semantic search grants remain valid.
4. Check structured keyword requests, user lookup, verification permissions, and legacy GET search. Verification starts unverified for existing items.

Validation commands:

```sh
npm run test:search:controls
npm run test:search:node
npm run test:search:worker
npm run test:search:browser
npm test --workspace @zilobase/features
npm test --workspace @zilobase/server
npm run test:workers --workspace @zilobase/runtime-adapter
npm run test:web
npm run typecheck
npm run lint
npm run fmt:check
npm run test:architecture
npm run build
```

The controls fixture covers upgrades from the previous migration set, idempotent migration, unknown legacy attribution, combined controls, hidden linked sources/views, membership expiry, two-editor persistence, comment-only saves, delayed attribution, and 10,000 keyword pages. It exercises date/title sorting and recursive scopes within the existing read timeout. Node/Worker HTTP fixtures cover the structured API and verification lifecycle; browser checks cover the UI and main/pane/dialog presentations. Existing vector benchmarks remain separate because retrieval profiles and semantic ranking are unchanged.
