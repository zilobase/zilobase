# Unified local development

The root repository is the development control plane for the open-source Node
runtime and the sibling Cloudflare adapter. Private editions own their setup,
tests, and deployment orchestration in their respective repositories.

## Five-minute first run

Requirements for the normal source loop are Node.js 24, npm 11, and a running
Docker engine. Kubernetes work additionally needs `kubectl`, kind, and Helm.

```sh
npm install
npm run dev:doctor
npm run dev:setup
npm run dev:local
```

`dev:setup` creates only missing files. Repository environment files are
copied from committed examples, generated secrets are written under
`.dev/local/env`, and all private files use mode `0600`. Existing files are
never replaced.

The default command starts PostgreSQL, MinIO, and Mailpit once; migrates the
Node and Worker databases independently; then runs the Node API, both Workers,
and two Vite clients in one foreground supervisor. Press Ctrl-C to stop source
processes while preserving dependency data.

## Runtime map

| Profile | Web | API / service | Inspector | State |
| --- | --- | --- | --- | --- |
| Node | `http://node.zilobase.localhost:1420` | `http://node.zilobase.localhost:3000` | `127.0.0.1:9229` | `zilobase_node`, `zilobase-node` bucket |
| Worker | `http://worker.zilobase.localhost:1422` | `http://worker.zilobase.localhost:3010`; background `:3012` | `:9231`, `:9232` | `zilobase_worker`, `.dev/local/wrangler/worker` |
| Community kind | `http://community.zilobase.localhost:3200` | Helm service port-forward | `:9233` | `zilobase-community-dev` namespace |

The dependency-only Compose project uses PostgreSQL `:15432`, MinIO
`:19100`/`:19101`, and Mailpit SMTP/UI `:11025`/`:18025` to avoid
collisions with the packaged self-host stack.
Community exposes MinIO on `:3210` and Mailpit on `:3225`.

## Everyday commands

| Command | Use |
| --- | --- |
| `npm run dev:local` | Node, Worker, and both web clients |
| `npm run dev:local:node` | Node API and Node web client only |
| `npm run dev:local:worker` | API/background Workers and Worker web client only |
| `npm run dev:status` | Dependency state and endpoint probes |
| `npm run dev:logs` | Tail redacted, prefixed source-runtime logs |
| `npm run dev:down` | Stop source processes and dependency containers; preserve volumes |
| `npm run test:runtime-parity` | Shared API, storage, realtime, background, web, and identity-isolation checks |
| `npm run test:dev-workflow` | Supervisor, environment, redaction, port, cleanup, and reset unit tests |
| `npm run test:selfhost` | Existing production-image serverful validation |

Shell values override the selected environment. Useful port overrides include
`PORT`, `BACKGROUND_HEALTH_PORT`, `ZILOBASE_NODE_WEB_PORT`,
`ZILOBASE_NODE_INSPECTOR_PORT`, `ZILOBASE_ADAPTER_PORT`,
`ZILOBASE_BACKGROUND_PORT`, `ZILOBASE_WORKER_WEB_PORT`,
`ZILOBASE_INSPECTOR_PORT`, and `ZILOBASE_BACKGROUND_INSPECTOR_PORT`.

## Environment files and dotenvx

The selected repository file is loaded through dotenvx into an isolated object,
then the invoking shell is applied last. This supports encrypted values without
mutating the supervisor's own process environment.

| Runtime | Private file |
| --- | --- |
| Core | `zilobase/.env.development` |
| Worker | `zilobase-cloud-adapter/.env.development` |

Commit encrypted repository env files. Gitignore only the private keys.

| Commit | Ignore |
| --- | --- |
| Encrypted `.env.development` files | `.env.keys`, `.env.keys.*` |
| `*.example` templates | Plaintext `.env`, `.env.local`, `.env.production`, `.env.selfhost*` |
| | `.dev/`, generated Kubernetes secrets |

Use `npm run env:check`, `npm run env:encrypt`, and
`npm run env:decrypt`. Decryption writes mode-`0600` editable copies under
ignored `.dev/local/env/decrypted/`; encryption consumes those copies, updates
the tracked encrypted files, and deletes the plaintext copies after success.
Store `.env.keys` in a password manager. Wrangler
receives temporary mode-`0600` environment files; the adapter removes them on
normal shutdown and startup failure.

## Debugging

Open [the tracked multi-root workspace](../.vscode/zilobase.code-workspace).
Run the **Dev: Node + Worker** task, then use **Debug: Node + Worker parity**.
The compound attaches the Node server, API Worker, background Worker, and opens
separate browser profiles. Source maps map breakpoints back to the core and
adapter TypeScript.

`npm run dev:desktop:node` and `npm run dev:desktop:worker` reuse the
already-running matching Vite client. Run one Tauri profile at a time.

## Kubernetes

```sh
npm run dev:k8s:community
```

This command creates or reuses the `zilobase-community-dev` kind cluster, installs
development-only PostgreSQL/MinIO/Mailpit resources outside the production
chart, builds the real application image with BuildKit, loads its immutable
digest into kind, upgrades Helm, waits for rollout, and keeps app/debug/storage
port-forwards in the foreground. Managed port-forwards reconnect automatically
after pod replacement.

Rebuild one profile with:

```sh
npm run dev:k8s:rebuild -- --target community
```

Use `npm run dev:k8s:logs -- --target community` and
`npm run test:k8s:community`. Debug values default off in the chart. The local workflow enables an inspector container
port, but no Service or Ingress exposes it; `kubectl port-forward` is the
only access path. `npm run dev:k8s:down` removes the development cluster.

Normal local profiles disable NetworkPolicy for a fast inner loop. The
Calico-enabled policy suites remain release gates for production-policy
validation.

## Safe reset and recovery

Reset is target-scoped and refuses to run without both a target and explicit
confirmation:

```sh
npm run dev:reset -- --target node --yes
npm run dev:reset -- --target worker --yes
npm run dev:reset -- --target community --yes
npm run dev:reset -- --target all --yes
```

Node reset recreates only `zilobase_node` and its MinIO bucket. Worker reset
recreates only `zilobase_worker` and its Wrangler persistence. Kubernetes
resets delete only the selected namespace. `all` removes the source Compose
volumes, Wrangler state, and the named kind cluster.

If startup reports a collision, run `npm run dev:status`, stop the owning
process, or use the shell port overrides above. If a prior terminal was killed,
`npm run dev:down` clears recorded source processes without deleting data.
Re-running any start command recreates port-forwards and one-shot initialization
jobs. Run `npm run dev:doctor` after toolchain upgrades.

## Open-source boundary

Community runtime, deployment, and operational files may expose generic edition
extension interfaces, but may not name, import, configure, or orchestrate a
private edition or private control plane. `npm run test:community-boundary`
enforces this across deployable and operational paths, and the dedicated CI
workflow runs the check for every pull request and main-branch push.
