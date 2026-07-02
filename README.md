# Notelab

Notelab is a workspace for notes, pages, databases, comments, AI workflows, and integrations. This repository contains the open-source Notelab monorepo and the Docker self-hosting path.

## Quick Start

Run the self-hosted stack locally:

```sh
docker compose up -d --build
```

Open:

```text
http://localhost
```

For production self-hosting, copy the example env file and replace every secret:

```sh
cp .env.selfhost.example .env
docker compose up -d --build
```

See `docs/self-hosting.md` and `apps/docs/self-hosting/index.mdx` for deployment details.

## Development

Prerequisites:

- Node.js 22 or newer
- npm
- Docker, for self-hosting checks

Install dependencies:

```sh
npm install
```

Common commands:

```sh
npm run dev:web
npm run build:web
npm run test:web
npm run dev:server
npm run build:server
npm run dev:desktop
npm run build:desktop
npm run dev:docs
npm run check:docs
```

## Repository Structure

- `apps/web`: Vite React web client and Cloudflare static worker entrypoint.
- `apps/server`: Hono API, auth, database access, AI tools, integrations, and serverful runtime.
- `apps/mobile`: Expo mobile client.
- `apps/desktop`: Tauri desktop shell.
- `apps/docs`: Mint documentation site.
- `packages/features`: shared client feature hooks, query keys, mutations, and cache logic.
- `packages/connectors`: shared connector implementations and connector UI surfaces.
- `packages/page-context`: page/editor context extraction and markdown helpers.
- `packages/markdown-text-splitter`: standalone markdown splitting utilities.

See `ARCHITECTURE.md` for the system overview and development boundaries.

## Deployment Model

The public self-hosted deployment uses Docker Compose with Caddy, Notelab, Postgres, and MinIO.

Hosted Notelab Cloud may use private deployment infrastructure. The open-source server exports adapter integration surfaces from `@notelab/server/adapter-api`; hosted-only adapters are outside the public self-hosting path.

## Contributing

Contributions are welcome. Read `CONTRIBUTING.md` before opening issues or pull requests.

Security vulnerabilities should be reported privately. See `SECURITY.md`.

## License

Notelab is released under the MIT License. See `LICENSE`.
