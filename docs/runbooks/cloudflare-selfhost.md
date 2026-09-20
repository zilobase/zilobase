# Self-hosting Zilobase on Cloudflare

This runbook provisions a community Zilobase deployment on Cloudflare Workers
from the public `zilobase` repo. No hosted env vars are required: `POSTHOG_*`,
`ZILOBASE_DEMO_ENABLED`, and `ZILOBASE_IDENTITY_CONFIG_KEYS` are absent by
design, and the community worker defaults to self-hosted mode.

## Prerequisites

- A Cloudflare account with Workers, Hyperdrive, R2, Queues, and Durable
  Objects available.
- A Postgres database reachable from Hyperdrive.
- Node 24+, `wrangler`, and a checkout of the `zilobase` repo with
  dependencies installed.

## 1. Copy the templates

Copy the deploy templates next to your worker entries and replace every
`<PLACEHOLDER>` (see [deploy README](../../packages/runtime-adapter/deploy/worker/README.md)
for the file table):

- `wrangler.template.jsonc` → `wrangler.jsonc` (API worker)
- `background.template.jsonc` → `background-wrangler.jsonc`
- `web.template.jsonc` → `web-wrangler.jsonc`
- `worker.template.ts`, `background.template.ts`, `web.template.js` → your entries

Durable Object bindings, the `runtime-ports-v1` fresh-install migration, queue names,
rate limits, and module aliases must stay verbatim; only credentials,
hostnames, buckets, placement, and routes are placeholders.

The baseline requires a new Worker namespace. Recreate an unused namespace
that recorded the retired migration chain, or choose a new Worker script name;
the reset does not affect PostgreSQL or R2 data.

## 2. Provision resources

Create the Hyperdrive config, R2 bucket (+ preview bucket), the four queues
with their dead-letter queues, and the two rate-limiter namespaces, then set
`vars` origins to your domains and create every secret under
`secrets.required` with `wrangler secret put <NAME>`.

Verify the database origin before deploying:

```sh
HYPERDRIVE_EXPECTED_HOST=<db-host> \
HYPERDRIVE_EXPECTED_PORT=5432 \
HYPERDRIVE_WRANGLER_CONFIG=./wrangler.jsonc \
node node_modules/@zilobase/runtime-adapter/scripts/verify-hyperdrive.mjs
```

## 3. Deploy in order

Deploy the API worker first, then background, then web:

```sh
wrangler deploy -c wrangler.jsonc
wrangler deploy -c background-wrangler.jsonc
wrangler deploy -c web-wrangler.jsonc
```

## 4. Smoke test

Sign in, edit a page, open the same page in two sessions and confirm live
collaboration, trigger a database change and confirm realtime delivery, upload
an image, run one AI turn, and confirm background queues drain
(`wrangler queues ...` / worker logs). Tail the API worker and expect no
error-level entries during the pass.

## Local development

Run the community worker stack locally with miniflare-backed state:

```sh
node node_modules/@zilobase/runtime-adapter/scripts/dev-workers.mjs
```

The API serves on `:3010` by default. Demo mode stays off unless
`ZILOBASE_DEMO_ENABLED=true` is set explicitly.

## Differences from hosted

The hosted `zilobase-cloud` composition adds the hosted identity extension
(session policy), the demo workspace guard with read rate limits, PostHog
telemetry and the PostHog proxy, shared-cookie rewriting for
`.zilobase.com`, and demo framing headers. None of these ship in the
community templates. [Architecture index](../../architecture/README.md).
