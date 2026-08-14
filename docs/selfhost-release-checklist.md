# Self-hosted release gate

Use this provider-neutral gate for every release candidate. The target is a new
Ubuntu 24.04 VM that has never hosted Zilobase. Record the image digest,
installer checksums, timestamps, and operator for each run.

## Release inputs

- [ ] Select the exact desktop installers produced by the release workflow for
      Windows, macOS, and Linux. Do not rebuild between environments.
- [ ] Resolve the candidate container tag to a digest and set
      `ZILOBASE_IMAGE=ghcr.io/zilobase/zilobase@sha256:...`.
- [ ] Generate independent production secrets for Better Auth, bootstrap,
      Postgres, MinIO, and SMTP. Keep them out of shell history and test reports.
- [ ] Allocate real DNS names for the application and object storage. Point both
      names to a clean Ubuntu 24.04 VM with inbound TCP 80 and 443 available.

## Clean deployment

- [ ] Install a supported Docker Engine and Compose plugin from the official
      Docker packages. Confirm the operator is the only non-root user with Docker
      access.
- [ ] Copy the release `docker-compose.yml`, Caddy configuration, and private
      environment file to the VM. Validate with `docker compose config --quiet`.
- [ ] Start with `docker compose up --detach --wait`. Confirm `/health`, `/ready`,
      and `/.well-known/zilobase` over public Caddy TLS; there must be no certificate
      warning or redirect in discovery.
- [ ] Bootstrap exactly one owner and workspace. Confirm a repeated bootstrap is
      rejected and the bootstrap token is absent from discovery and logs.

## Same desktop artifact

- [ ] Install the selected release artifact without modifying it. Record its
      checksum before installation.
- [ ] Connect it to Zilobase Cloud, the localhost Compose stack used by CI, and
      this public HTTPS staging server. Verify discovery, browser PKCE, restart
      session restoration, page editing, uploads, and live collaboration in each.
- [ ] Exercise a `zilobase://connect` link and an instance-scoped
      `zilobase://open` link. Confirm no credential or authorization code appears in
      either link or the diagnostics archive.

## Upgrade and recovery

- [ ] Deploy the previous released image, create a user, session, page, live
      document update, and object. Replace only the image digest with the candidate
      and run `docker compose up --detach --wait`.
- [ ] Confirm the previous data and compatible sessions remain usable. Review
      migration logs for warnings before accepting new traffic.
- [ ] Back up Postgres with `pg_dump --format=custom` and mirror the MinIO bucket
      with `mc mirror`. Store both backups together with the image digest and secret
      version used to create them.
- [ ] Restore both backups into empty named volumes, start the same pinned image,
      and verify the page, collaboration content, and uploaded object byte-for-byte.
- [ ] Stop and start the stack with `docker compose down` followed by
      `docker compose up --detach --wait`; named volumes must survive. Confirm that
      only the documented reset procedure removes them.

## Failure handling and sign-off

- [ ] Force one failed startup and one failed desktop connection. Confirm CI and
      staging retain sanitized diagnostics while cleanup removes only the isolated
      test project and its volumes.
- [ ] Test rollback to the previous image digest against a restored pre-upgrade
      backup. Never run an older binary against a database already migrated by a
      newer release unless that rollback is explicitly documented as compatible.
- [ ] Confirm dashboards or operator checks cover readiness, database capacity,
      object-storage capacity, SMTP delivery, certificate expiry, and backup age.
- [ ] Attach results to the release and require sign-off from the release owner
      before promoting the digest or installers.
