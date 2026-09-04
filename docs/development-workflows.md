# Unified local development

This repository is the development control plane for the open-source Node
runtime and the sibling Cloudflare adapter. The normal inner loop runs the
serverful and serverless implementations side by side with isolated data and
separate browser sessions. Kubernetes is an opt-in validation loop rather than
a requirement for everyday application development.

Private editions own their development, licensing, test, and deployment
orchestration in their respective private repositories. This repository may
provide generic extension interfaces, but it must not import or configure a
private implementation.

## Repository layout

The Worker profile expects the Cloudflare adapter to be a sibling of this
repository:

```text
platform/zilobase/
├── zilobase/
└── zilobase-cloud-adapter/
```

The sibling can be relocated with `ZILOBASE_ADAPTER_DIR`. Private repositories
are not required for Community Node, Worker, or Kubernetes development.

### Command ownership

Each repository exposes commands only for state it owns:

| Repository | Owns |
| --- | --- |
| Community core | Cross-runtime Node/Worker orchestration, web and desktop clients, Community kind, packaged Community self-host validation |
| Cloudflare adapter | Standalone API/background Worker development and hosted Cloudflare deployment |
| Private edition | Private runtime, licensing, private kind profiles, and packaged private deployment |
| Console | Console development, signing-provider tests, and licensing lifecycle infrastructure |
| CLI | Installer build, tests, and package synchronization |
| Landing | Marketing-site development, preview, build, and deployment |

The adapter does not launch Community web or desktop clients. Use
`npm run dev:local:worker` from this repository when a Worker client is needed;
use `npm run dev` inside the adapter only when the clients are already running.

## Requirements

The normal source loop requires:

- Node.js 24 or newer
- npm 11 or newer
- Docker with Docker Compose
- the Community and Cloudflare adapter repositories

Kubernetes development additionally requires:

- `kubectl`
- kind
- Helm
- Docker Buildx

Run the doctor whenever setting up a machine or upgrading the toolchain:

```sh
npm run dev:doctor
```

Missing Kubernetes tools are reported as optional. They do not prevent the
Node and Worker source loops from running.

## Five-minute first run

Install dependencies in both repositories:

```sh
cd zilobase
npm install

cd ../zilobase-cloud-adapter
npm install

cd ../zilobase
npm run dev:doctor
npm run dev:setup
npm run dev:local
```

`dev:setup` is idempotent. It copies committed examples only when a destination
does not exist, generates local secrets under `.dev/local/env`, writes private
files with mode `0600`, and reports incompatible legacy values. It never
replaces an existing environment file.

The first `dev:local` run may take longer while Docker pulls PostgreSQL, MinIO,
and Mailpit. Later starts reuse those dependency containers and their volumes.

## What the dual workflow starts

The default workflow performs these operations in order:

1. Validates selected ports before starting processes.
2. Starts dependency-only PostgreSQL, MinIO, and Mailpit containers.
3. Creates independent Node and Worker databases and buckets.
4. Runs migrations once for each selected runtime.
5. Starts the Node API with source maps and the Node inspector.
6. Starts the API Worker and background Worker through Wrangler.
7. Starts one Vite client for Node and another for Worker.
8. Waits for readiness and prints the runtime URLs.
9. Triggers the local Worker scheduled handler every minute.

The self-hosted Node database stays empty until you complete `/setup`. Only the
hosted Worker profile receives the optional demo seed; bootstrap and demo seed
must never run against the same database.

Bootstrap creates a verified owner and signs that owner in with the submitted
password; it does not send an OTP. Later local OTP and invitation messages are
delivered to Mailpit at `http://127.0.0.1:18025`. `MAIL_ENABLED` controls the
workspace Gmail product and does not disable authentication email delivery.

All foreground processes are supervised together and their output is prefixed
with the service name. If a required child exits unexpectedly, the supervisor
stops the remaining foreground children instead of leaving a partial stack.

## Runtime and port map

| Profile | Browser | API or service | Inspector | Isolated state |
| --- | --- | --- | --- | --- |
| Node | `http://localhost:1420` | `http://localhost:3000` | `127.0.0.1:9229` | `zilobase_node`, `zilobase-node` bucket |
| Worker | `http://127.0.0.1:1422` | `http://127.0.0.1:3010` | `127.0.0.1:9231` | `zilobase_worker`, `.dev/local/wrangler/worker` |
| Worker background | none | `http://127.0.0.1:3012` | `127.0.0.1:9232` | Worker Wrangler persistence |
| Community kind | `http://community.zilobase.localhost:3200` | port-forwarded Helm service | `127.0.0.1:9233` | `zilobase-community-dev` namespace |

Dependency-only Compose ports are deliberately outside the packaged self-host
range:

| Dependency | Port |
| --- | --- |
| PostgreSQL | `15432` |
| MinIO API | `19100` |
| MinIO console | `19101` |
| Mailpit SMTP | `11025` |
| Mailpit browser UI | `18025` |

Community Kubernetes exposes MinIO on `3210` and Mailpit on `3225`.

Node uses the literal `localhost` host while Worker uses the loopback address
`127.0.0.1`. Google accepts both for local OAuth callbacks, and the distinct
hosts keep cookies and sessions from colliding between runtimes.

For Google sign-in, register these exact local JavaScript origins on the Web
application OAuth client:

```text
http://localhost:1420
http://127.0.0.1:1422
```

Register these exact local redirect URIs on the same client:

```text
http://localhost:3000/api/auth/callback/google
http://127.0.0.1:3010/api/auth/callback/google
```

## Everyday source-development loop

Start each feature from an up-to-date branch:

```sh
git switch main
git pull --ff-only
git switch -c feat/my-feature
npm run dev:local
```

Use the Node browser for the serverful behavior and the Worker browser for the
serverless behavior. When testing a feature, perform the same action in both
clients and confirm that behavior is equivalent while records remain isolated.
Creating a page in Node must not make it visible in Worker, and vice versa.

Useful commands in a second terminal:

```sh
npm run dev:status
npm run dev:logs
```

`dev:status` checks dependency state and runtime endpoints. `dev:logs` follows
the supervisor's prefixed logs and applies secret redaction.

### Reload behavior

| Change | Expected behavior |
| --- | --- |
| `apps/web` | Both Vite clients update through HMR |
| Cloudflare adapter Worker source | Wrangler rebuilds and reloads the affected Worker |
| Node server source | Stop and restart `dev:local` to reload the Node process |
| Environment values | Restart the selected workflow |
| Database migrations | Restart so the selected runtime migrates before serving |
| Docker or Helm resources | Use the Kubernetes rebuild workflow |

The Node process is intentionally launched directly under the debugger rather
than under an additional file-watcher. This gives stable inspector attachment;
restart the supervisor after server-side Node changes.

### Focused source profiles

Run only the implementation being changed when simultaneous comparison is not
needed:

```sh
npm run dev:local:node
npm run dev:local:worker
```

These profiles retain the same ports and isolated state used by `dev:local`, so
switching between focused and dual mode does not move data unexpectedly.

### Foreground shutdown

Press Ctrl-C once in the supervisor terminal. It terminates the Node, Wrangler,
Vite, port-forward, and debugger children cleanly while preserving databases,
buckets, Wrangler persistence, and Kubernetes data.

To stop dependency containers as well while retaining their volumes:

```sh
npm run dev:down
```

The next start recreates foreground processes and reuses the preserved state.

## Environment files and dotenvx

Each runtime has its own tracked, encrypted environment file:

| Runtime | Environment file |
| --- | --- |
| Node/core | `zilobase/.env.development` |
| Worker | `zilobase-cloud-adapter/.env.development` |

Environment precedence is:

1. Values from the selected runtime environment file.
2. Values exported by the invoking shell.

The loader uses an isolated environment object, so loading one profile cannot
pollute the supervisor or the other runtime. Shell values deliberately win,
which makes one-command overrides possible:

```sh
PORT=3100 ZILOBASE_NODE_WEB_PORT=1520 npm run dev:local:node
```

Common overrides include:

- `PORT`
- `BACKGROUND_HEALTH_PORT`
- `ZILOBASE_NODE_WEB_PORT`
- `ZILOBASE_NODE_INSPECTOR_PORT`
- `ZILOBASE_ADAPTER_PORT`
- `ZILOBASE_BACKGROUND_PORT`
- `ZILOBASE_WORKER_WEB_PORT`
- `ZILOBASE_INSPECTOR_PORT`
- `ZILOBASE_BACKGROUND_INSPECTOR_PORT`
- `ZILOBASE_DEV_STATE_DIR`
- `ZILOBASE_ADAPTER_DIR`

### Encryption workflow

Check all selected environment files:

```sh
npm run env:check
```

Create temporary editable plaintext copies:

```sh
npm run env:decrypt
```

Decrypted copies are written with mode `0600` under
`.dev/local/env/decrypted/`. Edit those copies, then encrypt them back into the
tracked runtime files:

```sh
npm run env:encrypt
```

After successful encryption, the temporary plaintext copies are deleted. Store
`.env.keys` in a password manager and share it only through an approved secret
channel.

| Safe to commit | Never commit |
| --- | --- |
| Encrypted `.env.development` files | `.env.keys` and `.env.keys.*` |
| `*.example` templates | Plaintext `.env`, `.env.local`, or `.env.production` |
| Non-secret runtime defaults | `.dev/` and generated Kubernetes secrets |
| | `.env.selfhost*` and Wrangler temporary env files |

Wrangler receives a temporary mode-`0600` environment file. The adapter removes
it after normal shutdown, failed startup, or supervisor termination.

## Debugging with VS Code or Cursor

Open the tracked multi-root workspace:

[Open the Community development workspace](../.vscode/zilobase.code-workspace)

It contains the Community repository and Cloudflare adapter. Private siblings
are intentionally excluded.

For simultaneous debugging:

1. Run the **Dev: Node + Worker** task.
2. Launch the **Debug: Node + Worker parity** compound.
3. Place breakpoints in Community or adapter TypeScript.
4. Use the separately launched Node and Worker browser profiles.

The compound attaches to:

- Node API on `9229`
- API Worker on `9231`
- background Worker on `9232`
- the Node browser at `localhost:1420`
- the Worker browser at `127.0.0.1:1422`

Source-map overrides map bundled Worker and Node locations back to their local
TypeScript sources. If an attachment stays pending, run `npm run dev:status`
and confirm the matching inspector port is listening.

### Desktop profiles

Start the corresponding source workflow first, then launch one desktop profile:

```sh
npm run dev:local:node
npm run dev:desktop:node
```

or:

```sh
npm run dev:local:worker
npm run dev:desktop:worker
```

The Tauri profile reuses the existing Vite client instead of starting another
web server. Only one desktop profile should run at a time.

## Testing before a pull request

Run the smallest relevant tests while iterating, then run the shared boundary
and parity checks before submitting runtime changes.

### Community changes

```sh
npm run typecheck
npm run test:packages
npm run test:web
npm run test:server
npm run test:dev-workflow
npm run test:community-boundary
```

### Runtime parity

With the selected source runtimes running:

```sh
npm run test:runtime-parity
```

Parity covers common API behavior, storage, realtime delivery, background
execution, web readiness, and identity/data isolation. A parity failure should
be fixed in the owning runtime rather than hidden by pointing both clients at
one backend.

### Cloudflare adapter changes

From the sibling adapter repository:

```sh
npm test
npm run build
```

### Packaged serverful validation

The source loop does not replace production-image testing:

```sh
npm run test:selfhost
```

Use it when changing the server bundle, entrypoint, Dockerfile, migrations, or
self-host environment contract.

## Community Kubernetes workflow

Kubernetes is appropriate when changing:

- the Community Dockerfile or server bundle
- database migration hooks
- Helm values, templates, or schemas
- readiness or liveness behavior
- persistent storage behavior
- pod restart behavior
- source maps or pod debugging

Start or reuse the development cluster:

```sh
npm run dev:k8s:community
```

The controller:

1. Creates or reuses the `zilobase-community-dev` kind cluster.
2. Installs development-only PostgreSQL, MinIO, and Mailpit resources outside
   the production Helm chart.
3. Builds the real Community Dockerfile with BuildKit cache.
4. Resolves the image to an immutable digest.
5. Loads and tags that digest inside kind.
6. Runs the existing Helm migration and deployment flow.
7. Waits for rollout and readiness.
8. Starts resilient app, inspector, MinIO, and Mailpit port-forwards.

Rebuild after application, image, or chart changes:

```sh
npm run dev:k8s:rebuild -- --target community
```

Observe and validate the deployment:

```sh
npm run dev:k8s:logs -- --target community
npm run test:k8s:community
```

Debugging is disabled by default in the production chart. The development
controller enables an inspector container port, but no Service or Ingress
exposes it. Access is possible only through the managed `kubectl port-forward`
on `127.0.0.1:9233`.

Normal local Kubernetes profiles disable NetworkPolicy for a faster inner loop.
The Calico policy suite remains the production-policy release gate.

Press Ctrl-C to stop only the managed port-forwards. To remove the entire named
development cluster and its persistent data:

```sh
npm run dev:k8s:down
```

## Private-edition handoff

Private functionality must be developed and orchestrated from its owning
private repository. If private work requires a Community change:

1. Add only a generic, edition-neutral interface to Community.
2. Add Community tests that exercise the generic contract without naming a
   private package, route, environment value, or repository.
3. Implement licensing, private routes, private UI, and control-plane behavior
   in the private repository.
4. Run the private repository's compatibility and deployment tests there.
5. Land the Community contract before updating the private consumer pin.

Do not add private repository discovery, private Kubernetes namespaces, private
secrets, private migration journals, private editor tasks, or private package
imports to this repository.

The rule is enforced with:

```sh
npm run test:community-boundary
```

The dedicated CI workflow runs the same boundary check for every pull request
and every push to `main`.

## Safe reset and recovery

Reset commands require both an explicit target and `--yes`:

```sh
npm run dev:reset -- --target node --yes
npm run dev:reset -- --target worker --yes
npm run dev:reset -- --target community --yes
npm run dev:reset -- --target all --yes
```

Reset scope is deliberately narrow:

| Target | Deleted |
| --- | --- |
| `node` | `zilobase_node` database and Node MinIO bucket |
| `worker` | `zilobase_worker` database and Worker Wrangler persistence |
| `community` | Community development namespace and smoke state |
| `all` | Source Compose volumes, Worker persistence, and the named Community kind cluster |

A reset never targets an unspecified database, namespace, cluster, home
directory, or workspace root.

## Troubleshooting

### Port collision

Run:

```sh
npm run dev:status
```

Stop the owning process or override the affected profile port in the invoking
shell. The supervisor rejects wildcard listeners as collisions before starting
a partial workflow.

### A previous terminal was killed

```sh
npm run dev:down
npm run dev:local
```

`dev:down` clears recorded foreground process state and stops dependency
containers without deleting volumes.

### Environment decryption fails

Confirm that the matching `.env.keys` is present locally and run:

```sh
npm run env:check
```

Do not replace an encrypted file with plaintext to bypass the check.

### Node changes are not visible

Stop and restart `dev:local`. The Node API uses a stable direct inspector
process and does not run under a file watcher.

### Worker state looks stale

First restart `dev:local:worker`. Wrangler persistence intentionally survives
normal restarts. If the test specifically requires empty state, use the scoped
Worker reset rather than deleting the entire `.dev` directory.

### Kubernetes port-forward disappeared

Leave the controller running; managed forwards retry after pod replacement. If
the controller itself exited, rerun `npm run dev:k8s:community` to reuse the
cluster and restore the forwards.

### Kubernetes is resource constrained

Use the normal Node/Worker source loop for application work and keep Kubernetes
opt-in. Remove only the named Community development cluster when its data is no
longer needed; do not delete unrelated Docker containers or kind clusters.

## Command reference

| Command | Purpose |
| --- | --- |
| `npm run dev:doctor` | Validate required and optional tooling |
| `npm run dev:setup` | Create missing environments and local secrets safely |
| `npm run dev:local` | Run Node, both Workers, and both Vite clients |
| `npm run dev:local:node` | Run only Node and its Vite client |
| `npm run dev:local:worker` | Run only both Workers and their Vite client |
| `npm run dev:status` | Inspect dependencies, recorded processes, and endpoints |
| `npm run dev:logs` | Follow prefixed, redacted runtime logs |
| `npm run dev:down` | Stop source processes and containers while preserving data |
| `npm run env:check` | Validate selected dotenvx files |
| `npm run env:decrypt` | Create temporary mode-`0600` plaintext editing copies |
| `npm run env:encrypt` | Update encrypted files and remove plaintext copies |
| `npm run dev:desktop:node` | Run Tauri against the existing Node client |
| `npm run dev:desktop:worker` | Run Tauri against the existing Worker client |
| `npm run test:runtime-parity` | Compare runtime behavior and isolation |
| `npm run test:dev-workflow` | Test orchestration safety and environment behavior |
| `npm run test:community-boundary` | Reject private runtime leakage |
| `npm run test:selfhost` | Validate the packaged serverful image |
| `npm run dev:k8s:community` | Build and deploy Community into kind |
| `npm run dev:k8s:rebuild -- --target community` | Rebuild, reload, upgrade, and restore forwards |
| `npm run dev:k8s:logs -- --target community` | Follow Community namespace logs |
| `npm run test:k8s:community` | Run the Community Kubernetes smoke suite |
| `npm run dev:k8s:down` | Remove the named Community development cluster |
