# Containers and Helm

Docker and Helm describe runtime packaging and dependency wiring. Helm values/schema and templates jointly define deployment configuration, probes and migration jobs. The [Dockerfile](../../Dockerfile) builds web/server artifacts; [Compose](../../docker-compose.yml) wires the application with its persistent dependencies and proxy. The [Helm templates](../../deploy/helm/zilobase/templates) own workload, service, migration, secret references and probes, with configuration validation in the values schema. [Helm smoke testing](../../scripts/selfhost/test-community-helm.mjs) separates seeding from verification so restart/upgrade checks can preserve state. It requires a prepared test cluster and explicit environment, unlike chart lint/render validation.

Compose starts the bundled Valkey service for every application topology and
defaults the application URL to that service. Helm treats Redis/Valkey as an
operator-managed dependency: `realtime.existingSecret` is mandatory for one or
many replicas, its selected key supplies `REALTIME_REDIS_URL`, and network
policy egress is always rendered for the configured broker CIDR and port.

Keep rendered configuration consistent with the application; do not move deployment entrypoints solely for cosmetic grouping.

## Ownership

- [Entrypoint/configuration](../../deploy/helm/zilobase/Chart.yaml)
- [Implementation](../../deploy/helm/zilobase/values.schema.json)
- [Contributor guide or operational runbook](../../docs/self-hosting/operations.md)
- [Verification](../../scripts/selfhost/test-community-helm.mjs)

Command definitions remain in [package scripts](../../package.json); consult them for the current invocation. [Architecture index](../README.md).
