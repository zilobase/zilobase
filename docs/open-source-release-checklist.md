# Open Source Release Checklist

Run this checklist before making a public release.

## Repository Hygiene

- Confirm `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `GOVERNANCE.md`, `SUPPORT.md`, and `ARCHITECTURE.md` are current.
- Confirm no real secrets are tracked:

```sh
git ls-files '*env*'
```

Only example env files and harmless generated TypeScript env declaration files should be committed.

- Search for accidental private references or credentials:

```sh
rg -n "secret|token|password|api[_-]?key|private|cloudflare-adapter" -g '!node_modules' -g '!package-lock.json'
```

Review matches manually; schema fields and placeholder env names are expected.

## Checks

```sh
npm install
npm run build:web
npm run build:server
npm run test:web
npm run check:docs
npm run test --workspace @notelab/features
npm run test:databases --workspace @notelab/server
docker compose config
```

Optionally smoke test self-hosting:

```sh
docker compose up -d --build
curl http://localhost/health
docker compose down
```

## GitHub Settings

- Enable private vulnerability reporting.
- Add repository topics.
- Confirm issue templates and pull request template render correctly.
- Confirm the default branch protection and required checks match the available CI.

## Docs

- Verify README quickstart commands.
- Verify self-hosting docs match `docker-compose.yml`.
- Verify security contact is current.
