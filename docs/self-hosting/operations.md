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
and configured realtime-broker readiness. Follow logs without printing the environment:

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
`helm upgrade --install --wait`. Keep `replicaCount: 1` unless
`realtime.enabled` points at a healthy operator-managed Valkey or Redis Secret;
the chart rejects an unsafe multi-replica configuration. Inspect the migration
hook and `/ready` before ending the maintenance window.

## Database realtime and background roles

The default single-process `all` role can deliver database events without
Redis. Split `api` and `worker` roles, or more than one API replica, require the
same reachable `REALTIME_REDIS_URL` in every process. Treat `/ready` failure in
that topology as a deployment failure; do not bypass the broker check.

Worker-only processes expose `/health`, `/ready`, and `/metrics` on their
background admin listener. Monitor database commit/enqueue latency, ordering
conflicts, outbox backlog, and oldest outbox age. A committed command does not
wait for WebSocket publication, so an acknowledged write with delayed remote
updates points first to the background worker and outbox. Leave pending rows in
place for lease recovery and periodic sweeps.

The complete topology, retention policy, metric names, and recovery procedures
are in [database operations and troubleshooting](../databases/operations.md).

## Backups

Back up Postgres and MinIO together at a documented consistency point. At
minimum, retain:

- a `pg_dump` of the configured database;
- a recursive copy or `mc mirror` of the configured MinIO bucket;
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

## Workspace Mail

Mail is workspace-scoped and remains hidden unless the web build enables
`VITE_FEATURE_MAIL` and the API runtime sets `MAIL_ENABLED=true`. Apply every
database migration before enabling it; the workspace rollout migration removes
the former unscoped credential table and cannot be rolled back by an older
application image without restoring the matching database backup.

The bundled Node server runs Gmail watch renewal, full-mailbox indexing, and the
database-sync outbox in its maintenance loop. Custom runtime adapters
must schedule the exported `renewGmailWatches`, `advancePendingMailIndexes`, and
`drainMailDatabaseSyncOutbox` functions at least once per minute. Multi-replica
deployments require the shared realtime broker so workspace/binding-scoped mail
events reach the correct realtime room.

Monitor the non-PII `mail.watch_health`, `mail.index`, `mail.database_sync`,
`mail.webhook_rejection`, `mail.quota_failure`, `mail.cursor_reset`, and
`mail.socket_state` events. A paused database-sync job indicates that its
same-workspace destination or mapping needs attention; restoring access lets a
new source update enqueue the thread again. Full configuration, recovery, and
the staging acceptance checklist are in
[Gmail deployment and verification](../mail/gmail-deployment.md).

## Destructive actions

Normal `docker compose down` preserves data. `down --volumes` permanently
removes Postgres, MinIO, and Caddy state and must be used only for an intentional
fresh installation. In the local workflow, this distinction is encoded as
`npm run selfhost:down` versus the explicitly confirmed
`npm run selfhost:reset`.
