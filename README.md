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

Zilobase is an open-source workspace for building and organizing knowledge with structured pages, database views, comments, AI-assisted workflows, and connected tools. It is designed to run as a hosted product or as a self-hosted Docker deployment.

## OpenAI Build Week 2026

Zilobase is the Work & Productivity submission: a collaborative workspace where
pages and databases provide durable context while Toolkit-powered integrations
provide live context from GitHub, Gmail, Google Calendar, Google Drive, Slack,
and Linear.

Codex running GPT-5.6 was used to design the standalone Toolkit boundary,
integrate its server-side SDK, build the connection settings experience, review
tool and permission behavior, add regression tests, and verify the server and
web applications. Read the form-ready [project story, tags, judge walkthrough,
and demo outline](./BUILD_WEEK.md).

## What You Can Do

- **Write and organize pages** with a rich editor, nested navigation, comments, and workspace context.
- **Model structured information** with standalone or embedded databases, table views, kanban views, timeline views, properties, filters, sorting, and grouping.
- **Work with AI in context** using page-aware chat, workspace tools, and supported page/database edit flows.
- **Connect external systems** through the server-side Toolkit SDK for GitHub, Gmail, Google Calendar, Google Drive, Linear, and Slack.
- **Run it yourself** with Docker Compose, Caddy, Postgres, and MinIO.

## Quick Start

Run the self-hosted stack locally:

```sh
docker compose up -d --build
```

Open:

```text
http://localhost
```

Each installation creates one stable database-backed instance identity. Its
desktop compatibility and authorization metadata is available at
`http://localhost/.well-known/zilobase`. Use `/health` for process liveness and
`/ready` when an orchestrator must wait for both Postgres and object storage.

For production self-hosting, copy the example env file and replace every secret:

```sh
cp .env.selfhost.example .env
docker compose up -d --build
```

If you already started the stack once before creating `.env`, remove the old
data volumes before switching credentials, or keep the original default
passwords in `.env`. Otherwise Postgres and MinIO will keep their old persisted
credentials while the app starts with new ones.

```sh
docker compose down -v
docker compose up -d --build
```

Read the self-hosting guide:

- [Self-hosting overview](https://docs.zilobase.com/self-hosting)
- [Operations guide](https://docs.zilobase.com/self-hosting/operations)

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
| `npm run dev:desktop` | Start the Tauri desktop shell. |

The desktop app starts with Zilobase Cloud selected. On the sign-in screen,
choose **Use another server** to verify and save a self-hosted origin. Server
metadata is stored in the operating system application-config directory;
session credentials remain in the system keyring and are scoped to the saved
instance. Custom servers require trusted HTTPS, except for loopback HTTP during
local development. Sign-in then opens that server in the system browser and uses
PKCE with an ephemeral loopback callback. Password, email-code, Google, and
configured SSO login stay in the browser; the desktop receives an independent
server session only after issuer, state, instance, and PKCE validation.

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
