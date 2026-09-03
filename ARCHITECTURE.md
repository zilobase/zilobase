# Zilobase Architecture

Zilobase is an npm-workspaces monorepo for a notes, pages, databases, comments,
and AI workflows product. It supports hosted infrastructure and a public
self-hosted Docker path.

## System Overview

- `apps/web`: Vite React client. It contains the main workspace UI, page editor, database views, settings, auth screens, and client-side routing.
- `apps/server`: Hono server. It owns auth, workspace APIs, database persistence, image upload signing, AI chat tools, and the serverful runtime.
- `apps/desktop`: Tauri shell for the desktop app. Native code owns the single
  persisted server selection, validates and holds discovery metadata before a
  candidate can be committed, and scopes keyring credentials to that instance. The
  renderer initializes this metadata before auth, offline, query, or realtime
  providers are mounted.
- `packages/features`: shared TanStack Query hooks, query keys, mutations, cache update logic, and small database contracts used by clients and server.
- `packages/page-context`: editor/page context extraction, database markdown construction, and ProseMirror-to-markdown helpers.
- `packages/markdown-text-splitter`: standalone markdown text splitting utilities.

## Source Layout and Dependency Direction

The web and server use feature-first ownership. A file has one canonical owner;
private forwarding files are not used to preserve obsolete paths.

```text
apps/web/src/
  app/                 entrypoint, routing, providers, shell, composition
  features/<domain>/   domain model, UI, hooks, routes and adapters
  shared/              domain-neutral UI, components, hooks, styles and utilities

apps/server/src/
  app/                 Hono and runtime composition
  entrypoints/         executable entrypoints
  public/              published adapter entrypoints
  features/<domain>/   routes, services and domain models
  infrastructure/      database, storage, email and runtime mechanisms
  shared/              configuration, security, errors and common contracts
  scripts/             operational entrypoints

apps/desktop/src-tauri/src/
  app/ auth/ diagnostics/ meetings/ server/
  lib.rs               thin library composition root
  main.rs              binary entrypoint

packages/features/src/
  shared/ <domain>/

packages/page-context/src/
  context/ database/ markdown/ shared/
```

Dependencies point inward toward contracts and mechanisms:

- Web `shared` imports neither `features` nor `app`.
- Web features may import `shared`, published `@zilobase/*` contracts, and the
  feature dependencies explicitly allowed in `.fallowrc.json`; they do not
  import `app`.
- Web `app` composes features and does not own domain behavior.
- Server features may import server `shared`, approved infrastructure
  entrypoints, and published workspace contracts.
- Server infrastructure imports `shared` and infrastructure. Concrete Node
  runtime composition belongs to `app/node`, where feature implementations may
  be assembled.
- `public` preserves the published adapter surface and may expose approved app,
  feature, infrastructure, and shared contracts without relocating their owner.
- A workspace package is appropriate only when multiple applications or
  runtimes consume the contract. Package-internal domain code stays within its
  domain folder.

Cross-feature imports should use the owning feature's narrow `index.ts` when an
entrypoint exists. Add only the symbols required by another feature; do not add
wildcard or implementation-detail barrels. Files inside a feature use local
relative imports. A direct subpath is acceptable only for an established,
documented subdomain contract where importing the feature root would create a
cycle.

Fallow enforces every production source zone, disallowed dependency direction,
cycle, unresolved import, unused file, unused export, and dependency ownership
issue. Production duplication is capped below 3%; pair-only and short framework
clones are ignored, and the canonical Drizzle schema is excluded because its
explicit repeated columns are part of the persistence contract.

Health limits are 25 cyclomatic complexity, 40 cognitive complexity, 100 CRAP,
and 400 lines per unit. Remaining legacy findings are tracked by exact identity
in `scripts/refactor/fallow-health-baseline.json`: a new or moved violation
fails the architecture gate rather than inheriting a repository-wide exemption.
Do not refresh that baseline to accommodate a change. Remove entries as legacy
units are simplified.

## Canonical Sources of Truth

- Persisted sidebar contracts, defaults, normalization, and migrations live in
  `@zilobase/features/user-settings`; web sidebar rendering lives in
  `apps/web/src/features/sidebar`.
- Database property identifiers and shared contracts live in
  `@zilobase/features/databases`; web metadata and presentation live in the web
  database feature.
- Query keys, API contracts, cache updates, and shared mutations live in
  `packages/features`.
- Database web state is partitioned into data, UI, action, and realtime
  contexts. Narrow hooks are the supported consumption seam; a synthetic full
  database context is not a reusable list-view API.
- `apps/server/src/infrastructure/database/schema.ts` is the only server schema
  declaration.
- Page and ProseMirror conversion lives in `packages/page-context`.
- Web route declarations and guards are owned by `apps/web/src/app/routing`.
- Top-level web route groups are lazy-loaded through explicit loading and error
  boundaries. The production build enforces an initial-JavaScript budget of
  1.5 MB, a 1 MB ordinary-route budget, and prevents Shiki from entering
  unrelated route graphs.
- `apps/web/src/edition/community.ts` is the type-only compatibility contract
  consumed by edition implementations; community runtime wiring remains under
  `apps/web/src/app/edition`.
- Public server specifiers and symbol sets are compatibility contracts:
  `@zilobase/server`, `/adapter-api`, `/node-adapter-api`, and `/realtime-api`.
  The server suite imports these exact specifiers, and the adjacent cloud and
  enterprise repositories provide the end-to-end consumer compatibility gate.

## Data Flow

The web client calls the server API through shared feature hooks. The server validates sessions or API keys, reads and writes Postgres through Drizzle, and returns JSON payloads to clients. Client cache behavior should live in `packages/features` when it is shared across clients.

Editable web page bodies additionally connect to Hocuspocus over WebSockets.
Yjs binary state is authoritative for those bodies; the server materializes the
same document into `page.content` for API reads, search, AI context, and public
pages. Presence and cursor awareness are ephemeral and are not stored.

Database property type IDs live in `packages/features` as the shared contract. The web editor extends that contract with UI metadata such as labels, icons, filter kinds, cell kinds, and default configs. The server imports the same contract for mutation validation and keeps trust-boundary checks in `apps/server`.

Uploaded images use the server image API. In the Docker self-hosted stack, image storage uses MinIO through the same S3-compatible path used for hosted object storage.

AI features run through the server. Ask AI authenticates each turn, derives a
server-owned capability policy, resolves page/database/file access, and only
then sends native tools to the configured model provider. Reads return bounded
citations or tables. Mutations reuse page/database services and persist
idempotent action receipts before reporting success. Postgres also owns thread
history, preferences, feedback, sanitized turn/tool audit metadata, and usage
reservations; object storage owns expiring uploads and generated artifacts.

The client cannot grant page access or add a tool, and the agent has no
unrestricted code, network, filesystem, permission,
comment-mutation, or workspace-administration capability. The complete
capability, safety, and verification contract is documented in the
[`Ask AI plan`](./docs/ai/ask-ai-agent-plan.md), with the final result in the
[`parity audit`](./docs/ai/ask-ai-parity-audit.md) and deployment controls in
[`Ask AI operations`](./docs/ai/ask-ai-operations.md).

## Auth and Access

Authentication is implemented in the server with Better Auth. Clients use API helpers and shared auth hooks. Authorization checks should stay on the server; clients may hide UI affordances, but server routes must enforce workspace and item access.

Desktop sign-in is a public-client authorization-code flow owned by the selected
server. The desktop window only offers Continue in Browser and Change server;
login and signup happen on the real web app. The system browser authenticates
with the server's existing Better Auth providers, an authenticated continue
POST issues a short-lived hashed code, and the native app exchanges it with
S256 PKCE through an ephemeral loopback callback. After the code is delivered,
the browser returns to the hosted `/desktop/connected` page instead of a
loopback completion page. Code consumption and creation of the independent
Better Auth desktop session are transactional. Browser cookie sessions and
desktop keyring sessions are separate rows: signing out one client does not
revoke the other, so the two clients can later use different accounts. Desktop
builds contain no social-provider client credentials, and native diagnostics
never include callback queries, codes, or session tokens.

Desktop connection links contain no secrets. `zilobase://connect` carries only
a canonical server origin, while `zilobase://open` binds an in-app path to both
the canonical origin and stable instance identity. Server replacement is a
destructive trust-boundary transition: after draft recovery is resolved, the
renderer revokes best-effort, aborts HTTP work, destroys realtime providers,
clears server-scoped IndexedDB/query/Zustand/session state, and asks native code
to delete the old keyring entries and commit the already-verified candidate.
The public `/desktop` page exposes the connect link and copyable origin.

API keys are scoped through server-side checks. Routes that accept API-key access should reject mismatched workspace access.

## Persistence

Postgres is the source of truth for users, browser and desktop sessions,
short-lived desktop authorization codes, workspaces, pages, databases, comments,
Ask AI threads/preferences/receipts/audit metadata, and API keys.
Drizzle migrations live under `apps/server/drizzle`.

Self-hosting uses:

- `postgres`: relational data
- `minio`: image/object storage
- `caddy`: public HTTP/HTTPS entrypoint
- `zilobase`: combined web/API container

The serverful runtime hosts Hocuspocus and database realtime rooms on the same
HTTP server. Database rooms broadcast versioned mutation deltas and ephemeral
cell presence, while PostgreSQL remains authoritative and an outbox retries
delivery after process failures. Alternate runtimes can reuse the shared
collaboration core while keeping authoritative state in Postgres.

## Deployment Model

The public self-host path is Docker Compose with Caddy, Zilobase, Postgres, and
MinIO. The production-safe base file requires every durable secret and a pinned
application image; it never builds source. `docker-compose.dev.yml` is the
loopback-only developer overlay: it builds the same production image, exposes a
public MinIO signing endpoint for browser uploads, and adds Mailpit. The root
`Dockerfile` builds the web client and bundles the serverful Node entrypoint,
then runs it as the unprivileged `zilobase` user.

Hosted Zilobase Cloud may use private deployment infrastructure. The open-source
server exposes runtime extension surfaces from `@zilobase/server/adapter-api`;
hosted deployment extensions are outside the public self-hosting path.

## Development Guidelines

- Put shared client server-state behavior in `packages/features`; keep
  app-specific presentation in the owning web feature.
- Keep API validation and authorization at server route/service trust
  boundaries.
- Keep editor/page conversion helpers in `packages/page-context` when they are
  consumed outside one web feature.
- Preserve published exports, HTTP routes, payloads, persisted keys, database
  schemas, TipTap extension ordering, and Yjs authority during structural work.
- Prefer adding focused tests next to the package or app behavior being changed.
- Update `README.md`, `CONTRIBUTING.md`, or the external docs site when setup or public behavior changes.
