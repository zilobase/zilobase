# Zilobase Architecture

Zilobase is an npm-workspaces monorepo for a notes, pages, databases, comments, AI workflows, and integrations product. It supports hosted infrastructure and a public self-hosted Docker path.

## System Overview

- `apps/web`: Vite React client. It contains the main workspace UI, page editor, database views, settings, auth screens, and client-side routing.
- `apps/server`: Hono server. It owns auth, workspace APIs, database persistence, image upload signing, AI chat tools, integration OAuth flows, and the serverful runtime.
- `apps/desktop`: Tauri shell for the desktop app. Native code owns the single
  persisted server selection, validates and holds discovery metadata before a
  candidate can be committed, and scopes keyring credentials to that instance. The
  renderer initializes this metadata before auth, offline, query, or realtime
  providers are mounted.
- `packages/features`: shared TanStack Query hooks, query keys, mutations, cache update logic, and small database contracts used by clients and server.
- `packages/page-context`: editor/page context extraction, database markdown construction, and ProseMirror-to-markdown helpers.
- `packages/markdown-text-splitter`: standalone markdown text splitting utilities.

## Data Flow

The web client calls the server API through shared feature hooks. The server validates sessions or API keys, reads and writes Postgres through Drizzle, and returns JSON payloads to clients. Client cache behavior should live in `packages/features` when it is shared across clients.

Editable web page bodies additionally connect to Hocuspocus over WebSockets.
Yjs binary state is authoritative for those bodies; the server materializes the
same document into `page.content` for API reads, search, AI context, and public
pages. Presence and cursor awareness are ephemeral and are not stored.

Database property type IDs live in `packages/features` as the shared contract. The web editor extends that contract with UI metadata such as labels, icons, filter kinds, cell kinds, and default configs. The server imports the same contract for mutation validation and keeps trust-boundary checks in `apps/server`.

Uploaded images use the server image API. In the Docker self-hosted stack, image storage uses MinIO through the same S3-compatible path used for hosted object storage.

AI features run through the server. The server builds page and workspace context, calls configured model providers, and applies supported edits through existing page and database mutation paths.

## Auth and Access

Authentication is implemented in the server with Better Auth. Clients use API helpers and shared auth hooks. Authorization checks should stay on the server; clients may hide UI affordances, but server routes must enforce workspace and item access.

Desktop sign-in is a public-client authorization-code flow owned by the selected
server. The system browser authenticates with the server's existing Better Auth
providers, an authenticated consent POST issues a short-lived hashed code, and
the native app exchanges it with S256 PKCE through an ephemeral loopback
callback. Code consumption and creation of the independent Better Auth desktop
session are transactional. Desktop builds contain no social-provider client
credentials, and native diagnostics never include callback queries, codes, or
session tokens.

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
integrations, and API keys. Drizzle migrations live under `apps/server/drizzle`.

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

Hosted Zilobase Cloud may use private deployment infrastructure. The open-source server exposes adapter integration surfaces from `@zilobase/server/adapter-api`; hosted-only adapters are outside the public self-hosting path.

## Development Guidelines

- Put shared client server-state behavior in `packages/features`.
- Keep API validation and authorization in `apps/server`.
- Keep editor/page conversion helpers in `packages/page-context` when they are useful outside a single component.
- Prefer adding focused tests next to the package or app behavior being changed.
- Update `README.md`, `CONTRIBUTING.md`, or the external docs site when setup or public behavior changes.
