# Self-hosting Zilobase

Gmail mailbox integration is optional. When enabling it, follow the complete
[Gmail deployment and verification runbook](../mail/gmail-deployment.md) before
starting the service; production requires authenticated Pub/Sub push and Google
restricted-scope approval.

Docker Compose and the Community Helm chart are the supported
self-hosted artifacts. A separate virtual machine is unnecessary for local
development; use a clean public Ubuntu host or isolated Kubernetes cluster for
release staging and production-like validation.

Release candidates must complete the provider-neutral
[self-hosted release gate](./release-checklist.md) on a clean Ubuntu
24.04 staging VM before promotion.

## Local developer stack

From the repository root:

```sh
npm install
npm run selfhost:up
```

The command generates `.env.selfhost.development` with mode `0600`, builds the
production Docker image from the current source, starts an isolated stack, and
waits for readiness. All published ports bind to `127.0.0.1`:

- Zilobase: `http://127.0.0.1:8787`
- MinIO S3 API: `http://127.0.0.1:9000`
- Mailpit: `http://127.0.0.1:8025`

Open `http://127.0.0.1:8787/setup` and paste the generated bootstrap token from
`.env.selfhost.development`. The token is submitted only in a request header.
After setup, open `http://127.0.0.1:8787/desktop` to connect the desktop app.

```sh
npm run selfhost:logs
npm run selfhost:down
```

`selfhost:down` preserves named volumes. `selfhost:reset` is the only developer
command that removes them and requires typing `reset` (or an explicit `--yes`
for automation):

```sh
npm run selfhost:reset
```

## Production Compose

Copy `.env.selfhost.example` to ignored `.env.selfhost`. Replace every secret,
use two real DNS names, and pin `ZILOBASE_IMAGE` to a release tag or registry
digest. The base Compose file has no secret defaults and no application build.

```sh
docker compose --env-file .env.selfhost -f docker-compose.yml -f docker-compose.prod.yml config
docker compose --env-file .env.selfhost -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose --env-file .env.selfhost -f docker-compose.yml -f docker-compose.prod.yml up -d --wait
```

Visit `/setup` once to create the initial owner and workspace. Keep the
bootstrap token in the environment after setup so restarts pass startup
validation; the database permanently prevents a second bootstrap.

See [Domains and TLS](./domain.md) before exposing the stack and
[Operations](./operations.md) before storing production data.

## Kubernetes with Helm

The MIT chart at `deploy/helm/zilobase` installs only the Community application.
It requires operator-managed PostgreSQL and S3-compatible object storage; the
chart does not install either dependency and is not offered through Console
Downloads. Pin the public image by digest and create the referenced Secret
before installation:

```sh
helm lint deploy/helm/zilobase
helm upgrade --install zilobase deploy/helm/zilobase \
  --namespace zilobase --create-namespace \
  --set image.digest=sha256:REPLACE_WITH_RELEASE_DIGEST \
  --set config.externalUrl=https://notes.example.com \
  --set config.s3Endpoint=https://s3.internal.example.com \
  --set config.s3PublicEndpoint=https://objects.example.com \
  --set networkPolicy.postgresCIDR=10.20.0.15/32 \
  --set networkPolicy.s3CIDR=10.20.0.16/32 \
  --wait
```

The existing Secret defaults to `zilobase` and must contain `DATABASE_URL`,
`BETTER_AUTH_SECRET`, `ZILOBASE_BOOTSTRAP_TOKEN`, `S3_ACCESS_KEY_ID`, and
`S3_SECRET_ACCESS_KEY`; `SMTP_PASSWORD` is optional. Keep secret values out of
Helm values and shell history. If PostgreSQL or S3 uses a private CA, place only
the public CA in a ConfigMap and set `trustedCa.configMapName`.

The default remains one application replica with `Recreate` upgrades. To run
multiple replicas, provide an externally managed Valkey or Redis endpoint in a
Secret and set `realtime.enabled=true`, `realtime.existingSecret`, and
`replicaCount`. The chart rejects multiple replicas without this shared
realtime bus. HA deployments use rolling updates, a disruption budget, shared
Hocuspocus and database-realtime fan-out, and distributed connection limits.
Your Ingress must preserve WebSocket `Upgrade`/`Connection` headers and use the
provided one-hour idle timeouts. Set the NetworkPolicy PostgreSQL, S3, SMTP,
Valkey, and kubelet-probe CIDRs to the narrow addresses used by your cluster.

For a local broker-backed test, start the optional Compose profile with
`REALTIME_REDIS_URL=redis://valkey:6379 docker compose --profile ha ...`. The
profile is for development only and does not make a single Compose application
container highly available.

Back up PostgreSQL and the object bucket as a pair before every upgrade. A Helm
rollback does not reverse database migrations; use an older binary only when
the release notes declare the schema compatible, otherwise restore the paired
backup and its matching image digest.

## Automated smoke test

```sh
npm run test:selfhost
```

The test uses random ports, secrets, and a unique Compose project. It verifies
fresh bootstrap, OTP and invitation delivery through Mailpit, a MinIO-backed
upload/read, non-root execution, restart persistence, production configuration
failure without secrets, and explicit volume reset. It always removes its
ephemeral infrastructure.
