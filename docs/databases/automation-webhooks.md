# Database automation webhooks

Webhook actions send JSON with `schemaVersion`, `deliveryId`, `runId`,
`actionId`, `timestamp`, selected page properties, and configured expression
fields. Receivers must persist `deliveryId` and return the same successful
result for duplicates. Delivery is at least once; every retry keeps the same
ID.

Custom header values are encrypted with
`AUTOMATION_SECRET_ENCRYPTION_KEY` and are never stored in the automation
definition, response payloads, run summaries, or logs. Hosted deployments
require public HTTPS destinations. DNS is checked at save and delivery time,
all answers must be public, the chosen address is pinned for the connection,
and redirects are rejected.

Self-hosted webhooks require `AUTOMATION_WEBHOOKS_ENABLED=true` and a
base64-encoded 32-byte `AUTOMATION_SECRET_ENCRYPTION_KEY`. HTTPS follows the
same public-address policy as hosted deployments. Administrators may allow
plain HTTP only for exact hostnames in the comma-separated
`AUTOMATION_WEBHOOK_HTTP_DOMAINS` setting; subdomains are not implied. Private,
loopback, link-local, metadata, multicast, and reserved addresses remain
blocked even when a hostname is allowlisted.

Responses are capped at 1 MiB and their bodies are discarded. Network errors,
HTTP 408/409/425/429, and 5xx responses retry with bounded backoff. Other 4xx
responses, redirects, policy failures, and exhausted retries are terminal and
put the automation into its error state.
