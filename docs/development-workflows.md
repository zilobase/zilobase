# Local development

This repository owns the open-source Node development workflow. The normal
inner loop runs the web client, API, and local dependency containers with data
isolated from packaged self-hosting.

## Requirements

- Node.js and npm versions declared by the repository
- Docker with Compose support
- Rust and Cargo for desktop work
- `kubectl`, Helm, and kind only for Kubernetes validation

Run `npm run setup` once, then use `npm run dev` for daily development. The
setup command installs dependencies, creates missing local environment files,
starts no long-running application processes, and never overwrites an existing
secret file.

`npm run dev` always starts the open-source Node profile. It also discovers
opt-in sibling repositories that contain `.zilobase-dev.json`, starts them in
descriptor order, waits for their loopback readiness endpoints, and merges
their provider-owned runtime details into the development hub. This keeps the
public repository independent of optional implementations while preserving a
single command for a complete multi-repository checkout.

## Local services

The Node profile uses these defaults:

| Service | Address |
| --- | --- |
| Web | `http://localhost:1420` |
| API | `http://localhost:3000` |
| API health | `http://localhost:3001` |
| Node inspector | `127.0.0.1:9229` |
| PostgreSQL | `127.0.0.1:15432` |
| Object storage | `http://127.0.0.1:19100` |
| Mailpit | `http://127.0.0.1:18025` |
| Valkey | `redis://127.0.0.1:16379` |
| Development hub | `http://127.0.0.1:1418` |

The supervisor prefixes child-process output and shuts down the remaining
processes if a required child exits. Press Ctrl-C once for an orderly shutdown.
`npm run dev:down` stops local processes and dependency containers while
preserving data.

Valkey is started and configured automatically. The generated Node environment
sets `REALTIME_REDIS_URL`; no separate Redis command or manual `.env` edit is
needed for `npm run dev`.
The workspace launcher passes the generated Redis URL to optional sibling
providers as well. A provider can still set its own runtime environment for
standalone development, but the one-command workspace uses shared Valkey.

The development hub shows runtime health, ports, supporting services, setup
tokens, and generated local credentials. It binds only to `127.0.0.1`; do not
proxy or expose it beyond the local machine.

## Environment files

Development commands load `.env.development` through dotenvx. The encrypted
file may be committed; `.env.keys` and decrypted files must never be committed.

```sh
npm run dev:setup
npm run env:check
npm run env:decrypt
npm run env:encrypt
```

After editing a decrypted file, run `npm run env:encrypt`. The command updates
the encrypted file and removes the temporary plaintext copy.

## Database inspection and reset

`npm run db:studio` opens Drizzle Studio for the Node development database.
Reset is destructive and requires explicit confirmation:

```sh
npm run dev:reset -- --target node
npm run dev:reset -- --target all
```

The reset commands affect only the named local development resources. They do
not remove unrelated containers, databases, buckets, or Kubernetes clusters.

## Desktop development

`npm run dev:desktop` starts the same servers as `npm run dev`, then opens
Electron on the local Cloudflare web app at `http://localhost:1422`. Do not run it at the same time as
`npm run dev`; they use the same ports.

In that desktop session, Zilobase Cloud is the local Cloudflare runtime at
`http://localhost:3010`. **Choose custom server** lists self-hosted Community
at `http://localhost:3000` and any other local server runtime the workspace
started. Packaged builds still use `https://api.zilobase.com` for Zilobase Cloud.

## Kubernetes validation

Kubernetes is an opt-in validation loop:

```sh
npm run dev:k8s:community
npm run test:k8s:community
npm run dev:k8s:logs -- --target community
npm run dev:k8s:down
```

The down command removes only the named Community development cluster.

## Verification

Before submitting a core change, run the checks proportional to its scope.
The main entry points are:

| Command | Purpose |
| --- | --- |
| `npm run test:tooling` | Development and repository tooling tests |
| `npm run typecheck` | Workspace type checking |
| `npm run test:packages` | Shared-package tests |
| `npm run test:web` | Web tests |
| `npm run test:server` | Server tests |
| `npm run test:selfhost` | Packaged self-hosting smoke test |
| `npm run verify:core` | Complete public core verification |

Generic extension contracts must remain implementation-neutral. Tests for
those contracts should use synthetic fixtures and must not name or configure
non-public products, infrastructure, packages, or repositories.
