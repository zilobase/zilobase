# Gmail deployment and verification

Zilobase connects one Gmail account per workspace member through a dedicated
Google OAuth Web application client. The same Google identity can be connected
to more than one workspace, but views, filters, groups, custom properties,
hover actions, database sync, realtime rooms, and device caches remain private
to each workspace binding. Gmail remains authoritative: PostgreSQL stores encrypted
OAuth credentials and control metadata, while each device stores loaded mail in
its own mail-only IndexedDB database. Attachment bytes are streamed and are not
retained by either cache.

Mail is disabled by default. Set both `MAIL_ENABLED=true` in the server runtime
and `VITE_FEATURE_MAIL=true` while building the web client to expose it. The
deployment adapter may derive both from one operator-facing flag. When enabled,
production Gmail requires all seven `GMAIL_*` variables documented below. A
loopback development server may configure only the three OAuth variables and
rely on synchronization after connect, focus, or reconnect instead of push
notifications.

## 1. Google Cloud project and APIs

Use a dedicated Google Cloud project for the environment. A separate staging
project prevents test users and verification changes from affecting production.

```sh
gcloud config set project YOUR_GOOGLE_PROJECT_ID
gcloud services enable gmail.googleapis.com pubsub.googleapis.com
gcloud pubsub topics create zilobase-gmail
```

The topic must be in the same Google Cloud project that makes the Gmail
`users.watch` request. Grant Gmail's fixed publisher identity permission to
publish to it:

```sh
gcloud pubsub topics add-iam-policy-binding zilobase-gmail \
  --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
  --role=roles/pubsub.publisher
```

See Google's [Gmail push guide](https://developers.google.com/workspace/gmail/api/guides/push)
for the topic and publisher requirements.

## 2. OAuth consent and client

Configure the OAuth consent screen with the product identity, verified domains,
privacy policy, terms, operator contact details, and only these scopes:

- `openid`
- `email`
- `https://www.googleapis.com/auth/gmail.modify`

Create a **Web application** OAuth client specifically for Gmail. Do not reuse
the Google sign-in client. Register exactly one redirect URI per deployed API
origin:

```text
https://YOUR_API_ORIGIN/mail/oauth/google/callback
```

For the standard single-origin self-hosted deployment, `YOUR_API_ORIGIN` is the
value of `BETTER_AUTH_URL`. Hosted Zilobase uses:

```text
https://api.zilobase.com/mail/oauth/google/callback
```

Do not register a wildcard, trailing slash, query, fragment, or custom desktop
scheme. Desktop starts the same server-side flow in the system browser; after
the callback succeeds, Zilobase returns through its instance-bound
`zilobase://open` route without putting OAuth credentials in the deep link.

Keep the consent screen in testing mode with named test users until the staging
canary is complete. The scopes configured on the consent screen must exactly
match those requested by the application.

## 3. Authenticated Pub/Sub push

The public webhook and its OIDC audience are the same exact HTTPS URL:

```text
https://YOUR_API_ORIGIN/mail/google/pubsub
```

Create a service account used only as the push identity, then allow the Pub/Sub
service agent to mint its OIDC token:

```sh
gcloud iam service-accounts create zilobase-gmail-push \
  --display-name="Zilobase Gmail push"

PROJECT_NUMBER="$(gcloud projects describe YOUR_GOOGLE_PROJECT_ID --format='value(projectNumber)')"
gcloud projects add-iam-policy-binding YOUR_GOOGLE_PROJECT_ID \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountTokenCreator
```

The principal creating the subscription also needs permission to act as the
push service account. Create the authenticated push subscription:

```sh
gcloud pubsub subscriptions create zilobase-gmail-push \
  --topic=zilobase-gmail \
  --push-endpoint=https://YOUR_API_ORIGIN/mail/google/pubsub \
  --push-auth-service-account=zilobase-gmail-push@YOUR_GOOGLE_PROJECT_ID.iam.gserviceaccount.com \
  --push-auth-token-audience=https://YOUR_API_ORIGIN/mail/google/pubsub
```

Google documents the OIDC setup and token-creator grant in
[authenticated push subscriptions](https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions).
The endpoint must be publicly reachable over valid HTTPS; do not place login or
another interactive challenge in front of it. Zilobase
still rejects requests unless the Google signature, issuer, exact audience,
service-account email, subscription resource, payload, and Gmail account match.

## 4. Runtime configuration

Generate the credential-encryption key once:

```sh
openssl rand -base64 32
```

Store it in a secrets manager and in an encrypted, access-controlled backup.
The key encrypts refresh tokens already in PostgreSQL. Losing it requires every
user to reconnect; replacing it without a credential re-encryption procedure
makes existing connections unreadable. Never copy it into logs, tickets, or a
repository.

Configure the runtime:

```dotenv
MAIL_ENABLED=true
GMAIL_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
GMAIL_GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET
GMAIL_TOKEN_ENCRYPTION_KEY=YOUR_BASE64_32_BYTE_KEY
GMAIL_PUBSUB_TOPIC=projects/YOUR_GOOGLE_PROJECT_ID/topics/zilobase-gmail
GMAIL_PUBSUB_PUSH_AUDIENCE=https://YOUR_API_ORIGIN/mail/google/pubsub
GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL=zilobase-gmail-push@YOUR_GOOGLE_PROJECT_ID.iam.gserviceaccount.com
GMAIL_PUBSUB_SUBSCRIPTION=projects/YOUR_GOOGLE_PROJECT_ID/subscriptions/zilobase-gmail-push
```

`GMAIL_PUBSUB_TOPIC` and `GMAIL_PUBSUB_SUBSCRIPTION` are full resource names,
not short names. Validate a populated shell environment before deployment:

```sh
npm run mail:config:check
npm run test:mail:deployment
```

The validator prints URLs and status only; it never prints credentials.

### Docker Compose

Copy `.env.selfhost.example` to the ignored `.env.selfhost`, configure the
values above, and build the image with `--build-arg VITE_FEATURE_MAIL=true`.
`docker-compose.yml` passes the runtime flag and all Gmail values only to the API
container. Both the OAuth callback and Pub/Sub webhook use the public
`BETTER_AUTH_URL` origin.

```sh
npm run mail:config:check -- --env-file=.env.selfhost
docker compose --env-file .env.selfhost config --quiet
```

For a multi-replica deployment, also configure `REALTIME_REDIS_URL` so mailbox
invalidations reach sockets connected to every replica.

### Community Helm

Set `gmail.enabled=true`, configure the non-secret values under `gmail`, and add
the OAuth client secret and encryption key to the chart's existing Secret using
the keys selected by `secretKeys.gmailGoogleClientSecret` and
`secretKeys.gmailTokenEncryptionKey`. Gmail needs outbound TCP 443; the chart's
default Gmail egress CIDR is intentionally explicit and should be replaced by
the operator's HTTPS egress proxy range where one exists.

## 5. Local development without a public push callback

Configure a Google OAuth Web client with the exact loopback callback, for
example:

```text
http://127.0.0.1:3000/mail/oauth/google/callback
```

Set only `GMAIL_GOOGLE_CLIENT_ID`, `GMAIL_GOOGLE_CLIENT_SECRET`, and
`GMAIL_TOKEN_ENCRYPTION_KEY`; set `MAIL_ENABLED=true` and
`VITE_FEATURE_MAIL=true`, then leave every `GMAIL_PUBSUB_*` value empty. Connect,
initial sync, incremental sync, search, mutations, drafts, and send still work.
No watch is created. Reload or refocus the mailbox to retrieve changes made by
another Gmail client. Use a controlled HTTPS tunnel and a separate test
subscription only when push delivery itself must be tested.

## 6. Operations and recovery

Zilobase renews watches, advances full-mailbox indexes, and drains the database
sync outbox from the Node maintenance loop. Alternate deployment adapters,
including Cloudflare scheduled handlers, must invoke the exported
`renewGmailWatches`, `advancePendingMailIndexes`, and
`drainMailDatabaseSyncOutbox` operations at least once per minute. These
operations are bounded and safe to overlap across replicas. Alert on these
structured non-PII events:

- `mail.watch_health` failures or no successes for 24 hours
- `mail.webhook_rejection` increases
- `mail.quota_failure` increases
- `mail.cursor_reset` increases
- `mail.index` failures or no progress while a backfill is pending
- `mail.database_sync` retries or paused jobs
- sustained `mail.socket_state` failures

Gmail watches expire and must be renewed; a successful watch also sends an
immediate notification. If authorization is revoked, Zilobase marks the
connection as requiring reconnection. The user should open Mail, disconnect if
the old connection is still shown, and connect Google again. Do not edit token
rows manually. After a webhook outage, restoring the endpoint is sufficient:
clients synchronize through `history.list` after socket recovery, focus, or
reconnect.

To verify Pub/Sub configuration without mailbox content, inspect the subscription
and topic policy:

```sh
gcloud pubsub subscriptions describe zilobase-gmail-push
gcloud pubsub topics get-iam-policy zilobase-gmail
```

Never include callback query strings, OAuth codes, tokens, message bodies,
subjects, addresses, or attachment data in operational evidence.

## 7. Staging canary

Complete every item with a dedicated test mailbox before production rollout:

- [ ] Connect Google on web and confirm the account email and connected state.
- [ ] Connect different Google identities in two workspaces and confirm neither workspace can read the other's connection, views, properties, or mail.
- [ ] Reuse one Google identity in two workspaces and confirm each workspace keeps independent views, filters, groups, properties, hover actions, and database-sync settings.
- [ ] Connect from desktop and confirm the instance-bound return opens Mail.
- [ ] Complete initial Inbox sync, load more, open a thread, and reload from cache.
- [ ] Change the mailbox in Gmail and confirm authenticated push triggers incremental sync.
- [ ] Create, update, reopen, and delete a Gmail draft.
- [ ] Send a new message with To/Cc/Bcc and an attachment; verify one Sent copy.
- [ ] Reply, reply all, and forward; verify Gmail threading.
- [ ] Mark read/unread, star, archive, trash/restore, spam, and batch-modify threads.
- [ ] Create, rename, recolor, hide, and delete a custom label.
- [ ] Download an attachment and confirm no attachment bytes remain in IndexedDB.
- [ ] Go offline and confirm cached mail remains readable while every mutation is disabled.
- [ ] Disconnect and confirm Google revocation is attempted and the mail IndexedDB is removed.
- [ ] Reconnect, revoke access from the Google account, and confirm Zilobase requests reconnection.
- [ ] Confirm watch renewal and realtime reconnect metrics contain no mailbox PII.
- [ ] Confirm Node and alternate-runtime maintenance advance indexing and database-sync jobs.
- [ ] Enable database sync, verify only post-activation matching threads are created once, update a mapped field, and confirm unmapped database content is preserved.

## Restricted-scope production gate

`gmail.modify` is a restricted Gmail scope. Public production launch is blocked
until Google's OAuth verification is approved and Google confirms completion of
any required security assessment. Restricted-scope applications can require an
annual reassessment. Keep the consent-screen scope list, demo, privacy disclosures,
data-deletion behavior, verified domains, and production URLs synchronized with
the deployed product. See Google's [verification requirements](https://support.google.com/cloud/answer/13464321)
and [security assessment guidance](https://support.google.com/cloud/answer/13465431).

The production release owner must record the verification approval, assessment
status, staging canary evidence, configuration-check output, and watch-health
dashboard link before enabling Gmail for general users.
