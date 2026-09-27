# Bundled S3 service is RustFS

Status: accepted.

## Context

Self-host Compose, local development, and the community Helm gate pulled
`quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z` and
`quay.io/minio/mc:RELEASE.2025-04-16T18-13-26Z`. On 2026-09-24 those Quay
repositories stopped allowing anonymous pulls. Docker Hub no longer serves
`minio/minio` or `minio/mc`, and the archived upstream release binaries are
gone. The Node server talks to object storage through the AWS S3 API with
path-style addressing. Compose still exposes that service as `minio`, and
operators already set `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD`.

## Decision

The bundled S3 service is `rustfs/rustfs:1.0.0`, still named `minio` on the
Compose and development networks and still listening on port 9000. Those
existing root settings are passed as `RUSTFS_ACCESS_KEY` and
`RUSTFS_SECRET_KEY`. Bucket creation, private access, versioning, and backup
mirrors use `rustfs/rc:v0.1.36`. Readiness stays `GET /minio/health/live`.

## Alternatives

- Pin an unofficial Docker Hub copy of the last MinIO image. That reintroduces
  an unmaintained binary through an untrusted publisher.
- Rebuild MinIO from the archived Git tag. The published binaries and image
  registries are no longer available, and the project is archived.
- Switch the fixture to SeaweedFS. That changes the operational client and
  health checks more than a path-style S3 service the AWS SDK already drives.

## Consequences

Operator environment names and the `minio` hostname stay in place. Backup
instructions use `rc mirror`. The Helm TLS fixture mounts `rustfs_cert.pem`
and `rustfs_key.pem` and creates the bucket with `rc`. The service
implementation is [Compose](../../docker-compose.yml), the
[development dependency file](../../scripts/dev/dependencies.compose.yml), and
the [community Helm workflow](../../.github/workflows/community-helm.yml).
