<h1 align="center">Zilobase</h1>

<p align="center">
  Notes, pages, databases, comments, AI workflows, and integrations in one open-source workspace.
</p>

<p align="center">
  <a href="https://zilobase.com">Website</a>
  |
  <a href="https://app.zilobase.com">App</a>
  |
  <a href="https://docs.zilobase.com">Docs</a>
  |
  <a href="https://docs.zilobase.com/self-hosting">Self-host</a>
  |
  <a href="./CONTRIBUTING.md">Contribute</a>
  |
  <a href="./SECURITY.md">Security</a>
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-111827"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6">
  <img alt="React" src="https://img.shields.io/badge/React-19-61dafb">
  <img alt="Self-host with Docker" src="https://img.shields.io/badge/self--host-Docker-2496ed">
</p>

---

Zilobase is an open-source workspace for building and organizing knowledge with structured pages, database views, comments, and AI-assisted workflows. It is designed to run as a hosted product or as a self-hosted Docker deployment.

## What You Can Do

- **Write and organize pages** with a rich editor, nested navigation, comments, and workspace context.
- **Model structured information** with standalone or embedded databases, table views, kanban views, timeline views, properties, filters, sorting, and grouping.
- **Work with AI in context** using page-aware chat, workspace tools, and supported page/database edit flows.
- **Run it yourself** with Docker Compose, Caddy, Postgres, and MinIO.

## Quick Start

Run the self-hosted stack locally:

```sh
npm run selfhost:up
```

The command generates ignored development secrets, builds the production image
from source, waits for Postgres and MinIO readiness, and prints these local-only
addresses:

```text
Zilobase: http://127.0.0.1:8787
Setup:    http://127.0.0.1:8787/setup
Mailpit:  http://127.0.0.1:8025
```

Each installation creates one stable database-backed instance identity. Its
desktop compatibility and authorization metadata is available at
`http://127.0.0.1:8787/.well-known/zilobase`. Use `/health` for process liveness and
`/ready` when an orchestrator must wait for both Postgres and object storage.
Open `http://127.0.0.1:8787/desktop` for a copyable server URL and a secret-free
**Open in Zilobase Desktop** connection link.

Before anyone can sign in, open the printed setup URL and paste the token from
the ignored `.env.selfhost.development` file. The page sends it only in a request
header; it is not saved in browser storage or placed in a URL. Bootstrap creates
the initial verified owner and pinned workspace atomically. Repeated or
concurrent requests are rejected and discovery never returns the token.

Registration defaults to **Invite only** after bootstrap. The instance owner
can switch between **Invite only** and **Open registration** under **Settings →
Team → Server registration**. Open registration adds a user to the pinned
workspace only after email verification. Invite-only registration accepts only
a pending, unexpired invitation for that workspace and email address.

For production self-hosting, copy the example, replace every value, and use a
released image tag or digest. The production topology never builds application
source and rejects missing settings during Compose interpolation:

```sh
cp .env.selfhost.example .env.selfhost
docker compose --env-file .env.selfhost -f docker-compose.yml -f docker-compose.prod.yml config
docker compose --env-file .env.selfhost -f docker-compose.yml -f docker-compose.prod.yml up -d --wait
```

Read the self-hosting guide:

- [Self-hosting overview](./docs/self-hosting.md)
- [Domains and TLS](./docs/self-hosting-domain.md)
- [Operations guide](./docs/self-hosting-operations.md)

## Development

Prerequisites:

- Node.js 22 or newer
- npm
- Docker, for self-hosting checks

Install dependencies:

```sh
npm install
```

Local server and web commands load the ignored root `.env.development` file.
It contains the PostgreSQL, authentication, image-storage, and Vite settings
for development; production and Docker self-hosting continue to use their own
environment files.

Common commands:

| Command | Purpose |
| --- | --- |
| `npm run dev:web` | Start the web client. |
| `npm run build:web` | Type-check and build the web client. |
| `npm run test:web` | Run web tests. |
| `npm run dev:server` | Start the serverful API. |
| `npm run build:server` | Type-check the server. |
| `npm run dev:desktop` | Start the local API and Tauri desktop shell. |
| `npm run selfhost:up` | Build and start the loopback-only Compose stack. |
| `npm run selfhost:logs` | Follow development stack logs. |
| `npm run selfhost:down` | Stop containers and preserve data volumes. |
| `npm run selfhost:reset` | Explicitly delete local self-hosted data volumes. |
| `npm run test:selfhost` | Run the isolated end-to-end Compose smoke test. |

`npm run dev:desktop` talks to the local API at `http://localhost:3000`. Packaged
releases default to Zilobase Cloud at `https://api.zilobase.com`. On the server
screen, choose **Zilobase Cloud** or enter a hosted URL, or use a server's
`zilobase://connect` link. Server metadata is stored in the operating system
application-config directory; session credentials remain in the system keyring
and are scoped to the saved instance. Custom servers require trusted HTTPS,
except for loopback HTTP during local development. Signed-out desktop only
offers Continue in Browser and Change server. Login and signup happen in the
system browser against the selected server, using PKCE with an ephemeral
loopback callback. After continue, the browser stays on the hosted connected
page and remains signed in. The desktop receives an independent server session
only after issuer, state, instance, and PKCE validation. Signing out the
browser does not sign out desktop, and the reverse is also true.

Only one server and account are retained. **Settings → Preferences → Desktop
server** starts the same replacement workflow. If offline drafts exist, the app
requires an explicit Sync, Export, Discard, or Cancel choice. A completed change
best-effort revokes the old session and removes the old keyring credentials,
query cache, IndexedDB/Yjs documents, app/auth stores, tabs, and session storage
before reloading. Instance-scoped `zilobase://open` links are accepted only when
both the server origin and instance identity match verified metadata; link query
values are never written to diagnostics.

## Project Structure

```text
zilobase/
|-- apps/
|   |-- web       # Vite React web client
|   |-- server    # Hono API, auth, persistence, AI, integrations
|   `-- desktop   # Tauri desktop shell
|-- packages/
|   |-- features  # Shared client feature hooks and cache logic
|   |-- connectors
|   |-- page-context
|   `-- markdown-text-splitter
|-- docker/
`-- docker-compose.yml
```

For a deeper system walkthrough, read [ARCHITECTURE.md](./ARCHITECTURE.md).

## Deployment Model

The public self-hosted deployment uses Docker Compose with:

- Caddy for HTTP/HTTPS
- Zilobase for the web client and API
- Postgres for relational data
- MinIO for S3-compatible image storage

Hosted Zilobase Cloud may use private deployment infrastructure. The open-source server exports adapter integration surfaces from `@zilobase/server/adapter-api`; hosted-only adapters are outside the public self-hosting path.

## Community

| Need | Where to go |
| --- | --- |
| Report a bug | [Open a bug report](./.github/ISSUE_TEMPLATE/bug_report.yml) |
| Request a feature | [Open a feature request](./.github/ISSUE_TEMPLATE/feature_request.yml) |
| Contribute code | Read [CONTRIBUTING.md](./CONTRIBUTING.md) |
| Report a vulnerability | Read [SECURITY.md](./SECURITY.md) |
| Understand governance | Read [GOVERNANCE.md](./GOVERNANCE.md) |

## License

Zilobase is released under the [MIT License](./LICENSE).
