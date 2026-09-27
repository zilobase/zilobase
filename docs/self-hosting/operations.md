# Self-hosted operations

## Routine operation

Pin the application image to a reviewed release digest. For Compose, validate
the resolved configuration before every deployment, pull the image, and wait
for service health:

```sh
docker compose --env-file .env.selfhost -f docker-compose.yml -f docker-compose.prod.yml config
docker compose --env-file .env.selfhost -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose --env-file .env.selfhost -f docker-compose.yml -f docker-compose.prod.yml up -d --wait
```

Use `/health` for process liveness and `/ready` for Postgres, object-storage,
and required realtime-broker readiness. Follow logs without printing the environment:

```sh
docker compose --env-file .env.selfhost logs --tail 200 --follow zilobase
```

Keep `.env.selfhost` readable only by the deployment account. Never attach it to
bug reports. The bootstrap token remains required at process startup but cannot
bootstrap an initialized database again.

## Ask AI

Ask AI is enabled when `OPENAI_API_KEY` is configured and object storage is
healthy. Its files and artifacts use the same S3-compatible store as the rest
of the installation, with independent expiry metadata and scheduled cleanup.

Apply migrations before rollout, review the effective quotas, verify member and
admin authorization paths, and monitor only sanitized audit metadata. The full
environment-variable table and rollout checks are in
[Ask AI operations](../ai/ask-ai-operations.md). Follow the source links in the
[architecture map](../../architecture/README.md) to inspect current capability enforcement.

For Helm, run `helm lint`, render the proposed values, and use
`helm upgrade --install --wait`. The `realtime.existingSecret` must provide a
reachable Redis/Valkey URL for every replica; the chart rejects an empty Secret
reference. Inspect the migration hook and `/ready` before ending the
maintenance window.

## Database realtime and background roles

Every Node role, including the default single-process `all` role, requires a
valid and reachable `REALTIME_REDIS_URL`. Use the same endpoint for split `api`
and `worker` roles and all replicas. Missing or invalid configuration stops
boot. A live broker outage returns 503 from `/ready` while the process stays up
and reconnects; investigate `realtime_redis_error`, restore the broker, and
confirm readiness recovers without restarting the application.

Worker-only processes expose `/health`, `/ready`, and `/metrics` on their
background admin listener. Monitor database commit/enqueue latency, ordering
conflicts, outbox backlog, and oldest outbox age. A committed command does not
wait for WebSocket publication, so an acknowledged write with delayed remote
updates points first to the background worker and outbox. Leave pending rows in
place for lease recovery and periodic sweeps.

The complete topology, retention policy, metric names, and recovery procedures
are in [database operations and troubleshooting](../databases/operations.md).

## Backups

Back up Postgres and object storage together at a documented consistency point. At
minimum, retain:

- a `pg_dump` of the configured database;
- a recursive copy or `rc mirror` of the configured bucket;
- the exact Zilobase image digest and non-secret configuration used by the backup.

Test restoration into a separate Compose project or Kubernetes namespace. A
restore is complete only after `/ready` succeeds, users and pages are present,
and a stored image can be read. Do not treat Docker volumes alone as a portable
backup format.

## Updates and rollback

Take a backup before changing the image. Read release notes for database or
desktop compatibility changes, update `ZILOBASE_IMAGE`, run `config`, then run
`up -d --wait`. Migrations run in the application entrypoint before the server
starts. Rollback is safe only when the target release supports the migrated
schema; otherwise restore the matching backup.

For the responsive database migration, confirm that pre-upgrade rows retain
their canonical order keys and embedded property values through the v2
bootstrap and record-window endpoints. `database_row.position` is no longer a
rollback surface; `page_item_placement.position` remains for navigation.

## Email and registration

Production requires a working SMTP service for OTP, verification, and
invitation delivery. Mailpit exists only in the development/test override.
Bootstrap itself does not send an OTP: the one-time bootstrap token authorizes
creation of the verified owner, and the web setup flow immediately signs that
owner in with the password they supplied. Subsequent OTP sign-ins, account
verification, and invitations use SMTP normally.
After bootstrap, registration defaults to invite-only. The pinned workspace
owner can switch registration mode under **Settings → Team**.

## Destructive actions

Normal `docker compose down` preserves data. `down --volumes` permanently
removes Postgres, object storage, and Caddy state and must be used only for an intentional
fresh installation. In the local workflow, this distinction is encoded as
`npm run selfhost:down` versus the explicitly confirmed
`npm run selfhost:reset`.
