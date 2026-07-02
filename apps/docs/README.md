# Notelab Docs

Mintlify docs live in this workspace and should be deployed to:

```text
https://docs.notelab.io
```

## Local development

From the repo root:

```sh
npm run dev:docs
```

Or from this directory:

```sh
npm run dev
```

## Validation

```sh
npm run check:docs
```

The current Mintlify CLI may print React hook warnings during `mint broken-links`
in this monorepo, but the command should exit successfully when links are valid.

## Mintlify project settings

In Mintlify, configure the project to deploy from this monorepo path:

```text
apps/docs
```

The config file is:

```text
apps/docs/docs.json
```

## Domain routing

The docs custom domain should be:

```text
docs.notelab.io
```

Because the domain is managed in Cloudflare, add the DNS record requested by
Mintlify when the custom domain is added in the Mintlify dashboard. Keep the
record proxied or DNS-only according to Mintlify's verification instructions.
