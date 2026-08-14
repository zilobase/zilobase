# Self-hosting Zilobase

Docker Compose is the supported self-hosted artifact. A separate virtual
machine is unnecessary for local development; use a clean public Ubuntu host
for release staging and production-like validation.

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

See [Domains and TLS](./self-hosting-domain.md) before exposing the stack and
[Operations](./self-hosting-operations.md) before storing production data.

## Automated smoke test

```sh
npm run test:selfhost
```

The test uses random ports, secrets, and a unique Compose project. It verifies
fresh bootstrap, OTP and invitation delivery through Mailpit, a MinIO-backed
upload/read, non-root execution, restart persistence, production configuration
failure without secrets, and explicit volume reset. It always removes its
ephemeral infrastructure.
