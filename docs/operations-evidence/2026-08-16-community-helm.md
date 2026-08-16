# Community Helm isolated-cluster gate — 2026-08-16

Operator: Codex. This was an isolated local kind cluster with Calico, external
PostgreSQL `17.10-alpine`, and external TLS MinIO
`RELEASE.2025-04-22T22-12-26Z`. It is not a public-release or production claim.

The image was built from clean detached worktree commit
`58a3f7ad8eebf0850e947eca3506458eb4ffa194`, excluding unrelated uncommitted
desktop-auth work in the primary worktree. The locally named immutable image was:

`ghcr.io/zilobase/zilobase@sha256:76d8c56f9fb71fcad135b36e8dbe22e405e43c92e46c0f1abdce00d674eed80d`

The digest is local test evidence; it was not pushed because a GHCR push needs
explicit human approval. The public-image and chart-publication tasks remain
open.

Helm `v3.18.6` linted the chart. `helm template ... --set replicaCount=2`
failed schema validation with `value must be 1`. Revision 1 installed with the
digest above and `Recreate`, using a pre-install Job that exposed only
`DATABASE_URL` and `DRIZZLE_MIGRATIONS_DIR`. The database contained 39 public
migration entries, no Enterprise migration journal, and the Enterprise license
route returned 404.

The live smoke at `2026-08-16T05:20:02Z` verified:

- `/ready` returned database and object storage `ok`;
- the initial bootstrap succeeded and a second bootstrap returned 409;
- owner sign-in, page creation/edit, and an authenticated collaboration
  WebSocket upgrade succeeded;
- a presigned TLS MinIO upload and authenticated byte-for-byte read succeeded;
- Calico allowed PostgreSQL and MinIO but denied an unlisted
  `1.1.1.1:443` connection;
- no Enterprise, activation, Console, or Enterprise-metrics variable was in the
  Community pod environment.

The reusable `scripts/test-community-helm.mjs` gate then repeated the smoke and
wrote private restore state. With the app scaled to zero, a custom-format dump
and logical object mirror were captured, the dedicated Community database and
bucket were recreated empty, and both members were restored. The same image
digest returned ready; the exact pre-backup session, page, and object bytes all
survived.

GitHub-hosted run
[`31929950059`](https://github.com/zilobase/zilobase/actions/runs/31929950059)
completed green from commit `d6dbfe67c52266e6e5510dc573af22202a9095ca`
at `2026-08-16T05:54:01Z`. It linted the chart, rejected two replicas, built and
loaded immutable test digest
`sha256:0bf2285f773ca3f88a35bd3799f3ab6a2afab8d32e199965fa79c200a7cd31e1`,
installed into kind against external PostgreSQL/TLS MinIO, passed readiness,
single-use bootstrap, page edit, authenticated WebSocket and object checks,
asserted that the Enterprise journal was absent, then destroyed and recreated
both storage members and passed exact session/page/object restore verification.
No diagnostic failure step ran.

The operator docs state that PostgreSQL/S3 are external, Community is always
one replica and not HA, Console Downloads does not carry this chart, Ingress
must preserve WebSocket upgrades with a timeout of at least 65 seconds, and
database/object backup must be paired with the image digest.

No database, object-storage, bootstrap, authentication, or SMTP credential is
included in this record.
