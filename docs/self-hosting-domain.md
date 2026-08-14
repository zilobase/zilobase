# Self-hosted domains and TLS

Use two DNS names pointing to the host:

- `notes.example.com` for the web app, API, collaboration, and realtime traffic
- `objects.notes.example.com` for private MinIO object transfers signed by the app

Set the corresponding values in `.env.selfhost`:

```dotenv
ZILOBASE_SITE_ADDRESS=notes.example.com
ZILOBASE_STORAGE_SITE_ADDRESS=objects.notes.example.com
CLIENT_URL=https://notes.example.com
BETTER_AUTH_URL=https://notes.example.com
S3_PUBLIC_ENDPOINT=https://objects.notes.example.com
```

Allow inbound TCP 80 and 443 so Caddy can obtain and renew certificates. Do not
publish Postgres or MinIO directly. Caddy terminates TLS for both origins and
proxies object requests to the private MinIO service.

Origins are exact security boundaries. Use lowercase canonical origins without
paths, query strings, fragments, or trailing slash aliases. Self-hosting below a
URL subpath and untrusted self-signed certificates are outside v1. HTTP is
accepted only by the loopback development workflow.

After startup, verify:

```sh
curl --fail https://notes.example.com/health
curl --fail https://notes.example.com/ready
curl --fail https://notes.example.com/.well-known/zilobase
```

The discovery document must report the same HTTPS application origin used by
the browser and desktop app. Open `https://notes.example.com/desktop` for the
secret-free desktop connection link.
