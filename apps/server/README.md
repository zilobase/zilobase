# Zilobase Server

```sh
npm install
npm run db:migrate
npm run dev
```

`npm run dev` starts the normal Node/serverful backend on port `3000`.

## Self-hosted bootstrap and registration

Production Node deployments require `ZILOBASE_BOOTSTRAP_TOKEN`. Submit it only
in the `Authorization: Bearer` or `X-Zilobase-Bootstrap-Token` header to
`POST /api/instance/bootstrap`; query-string and request-body tokens are not
accepted. Bootstrap transactionally creates one verified owner, one pinned
workspace, and an owner membership, then permanently marks the instance as
initialized.

When upgrading an older self-hosted database, the migration pins its earliest
workspace and treats that installation as already bootstrapped; it does not
create another administrator or workspace.

After bootstrap, registration is `invite-only`. The pinned workspace owner can
read and update `GET/PATCH /api/instance/settings` to choose `invite-only` or
`open`. In open mode, verified accounts become workspace members when their
session is restored. In invite-only mode, Better Auth user creation requires a
pending, unexpired invitation whose workspace and normalized email both match;
the normal invitation acceptance still creates the membership. Hosted runtime
adapters bypass these self-host-only policies.

## Self-hosted object storage

The Node runtime uses `S3_ENDPOINT` for private server-to-MinIO operations and
`S3_PUBLIC_ENDPOINT` when signing browser upload/read URLs. In Compose these are
the internal `http://minio:9000` address and the public object-storage origin,
respectively. Production uses a dedicated TLS hostname proxied by Caddy; local
development exposes MinIO only on loopback. The public endpoint must not use a
subpath and must be reachable by desktop and browser clients.

## Realtime Collaboration

Editable page bodies use Yjs through Hocuspocus. Run the latest Drizzle
migrations before starting the server. The Node runtime serves the collaboration
WebSocket at `/collaboration`; clients obtain short-lived page-scoped tickets
from `POST /pages/:id/collaboration-ticket`.

`COLLABORATION_SECRET` is optional and falls back to `BETTER_AUTH_SECRET`. Set
it separately when collaboration tickets should have an independent signing
key. Set `COLLABORATION_WEBSOCKET_URL` when the public WebSocket origin cannot
be derived from the API request URL, such as behind a development proxy.

## Runtime Integrations

The server exports an integration surface from `@zilobase/server/adapter-api`.
It includes the Hocuspocus factory, ticket helpers, Yjs conversion helpers, and
collaboration runtime callbacks for alternate runtimes.
