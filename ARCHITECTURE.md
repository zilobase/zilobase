# Notelab Architecture

Notelab is an npm-workspaces monorepo for a notes, pages, databases, comments, AI workflows, and integrations product. It supports hosted infrastructure and a public self-hosted Docker path.

## System Overview

- `apps/web`: Vite React client. It contains the main workspace UI, page editor, database views, settings, auth screens, and client-side routing.
- `apps/server`: Hono server. It owns auth, workspace APIs, database persistence, image upload signing, AI chat tools, integration OAuth flows, and the serverful runtime.
- `apps/mobile`: Expo client that reuses shared feature packages and talks to the Notelab API.
- `apps/desktop`: Tauri shell for the desktop app.
- `apps/docs`: Mint documentation site.
- `packages/features`: shared TanStack Query hooks, query keys, mutations, and cache update logic used by clients.
- `packages/connectors`: shared connector domain logic and connector-specific UI exports.
- `packages/page-context`: editor/page context extraction, database markdown construction, and ProseMirror-to-markdown helpers.
- `packages/markdown-text-splitter`: standalone markdown text splitting utilities.

## Data Flow

The web and mobile clients call the server API through shared feature hooks. The server validates sessions or API keys, reads and writes Postgres through Drizzle, and returns JSON payloads to clients. Client cache behavior should live in `packages/features` when it is shared across clients.

Uploaded images use the server image API. In the Docker self-hosted stack, image storage uses MinIO through the same S3-compatible path used for hosted object storage.

AI features run through the server. The server builds page and workspace context, calls configured model providers, and applies supported edits through existing page and database mutation paths.

## Auth and Access

Authentication is implemented in the server with Better Auth. Clients use API helpers and shared auth hooks. Authorization checks should stay on the server; clients may hide UI affordances, but server routes must enforce workspace and item access.

API keys are scoped through server-side checks. Routes that accept API-key access should reject mismatched workspace access.

## Persistence

Postgres is the source of truth for users, sessions, workspaces, pages, databases, comments, integrations, and API keys. Drizzle migrations live under `apps/server/drizzle`.

Self-hosting uses:

- `postgres`: relational data
- `minio`: image/object storage
- `caddy`: public HTTP/HTTPS entrypoint
- `notelab`: combined web/API container

## Deployment Model

The public self-host path is Docker Compose with Caddy, Notelab, Postgres, and MinIO. The root `Dockerfile` builds the web client and bundles the serverful Node entrypoint.

Hosted Notelab Cloud may use private deployment infrastructure. The open-source server exposes adapter integration surfaces from `@notelab/server/adapter-api`; hosted-only adapters are outside the public self-hosting path.

## Development Guidelines

- Put shared client server-state behavior in `packages/features`.
- Keep API validation and authorization in `apps/server`.
- Keep editor/page conversion helpers in `packages/page-context` when they are useful outside a single component.
- Prefer adding focused tests next to the package or app behavior being changed.
- Update `README.md`, `CONTRIBUTING.md`, or docs pages when setup or public behavior changes.
