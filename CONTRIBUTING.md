# Contributing to Zilobase

Thanks for your interest in improving Zilobase. This guide explains how to set up the repo, make focused changes, and submit pull requests that are straightforward to review.

## Development Setup

Prerequisites:

- Node.js 24
- npm 11
- Docker

Install the workspace dependencies from the repository root:

```sh
npm install
npm run dev:doctor
npm run dev:setup
npm run dev:local
```

Development commands load server and Vite variables from the root
`.env.development` file through dotenvx. Encrypted env files are committed;
`.env.keys` is gitignored. Keep that private-key file in a password manager,
never in git. Re-encrypt after edits with `npm run env:encrypt`.

Useful commands:

```sh
npm run dev:web
npm run build:web
npm run test:web
npm run dev:server
npm run build:server
```

The root supervisor can run the sibling Cloudflare adapter at the same time as
the Node runtime, with isolated databases, storage, origins, and debuggers. See
[Unified local development](./docs/development-workflows.md) for the complete
command, Kubernetes, editor, environment, and reset contract.

For local self-hosting:

```sh
npm run selfhost:up
```

Then open the setup URL printed by the command. Development credentials are
generated once in ignored `.env.selfhost.development`; Mailpit captures OTP and
invitation email at `http://127.0.0.1:8025`.

Use `npm run selfhost:down` to stop containers without losing data. Use
`npm run selfhost:reset` only when you intend to delete the local Postgres,
MinIO, and Caddy volumes. The command requires an explicit confirmation. Run
the production-image integration suite in an isolated Compose project with:

```sh
npm run test:selfhost
```

## Project Structure

- `apps/web/src/app`: web composition, routing, providers, shell, and global setup.
- `apps/web/src/features`: web domain behavior and presentation.
- `apps/web/src/shared`: domain-neutral design-system UI, components, hooks,
  styles, types, and utilities.
- `apps/server/src/app`: API and Node runtime composition.
- `apps/server/src/features`: server routes, services, and models by domain.
- `apps/server/src/infrastructure`: database, storage, email, realtime, and
  runtime mechanisms.
- `apps/server/src/public`: compatibility entrypoints published by
  `@zilobase/server`.
- `apps/desktop/src-tauri/src`: native app, auth, diagnostics, meeting, and
  server-selection modules.
- `packages/features`: published queries, mutations, cache behavior, and shared
  domain contracts.
- `packages/page-context`: canonical page/editor conversion and markdown helpers.
- `packages/markdown-text-splitter`: standalone markdown splitting utilities.

See `ARCHITECTURE.md` for a deeper walkthrough.

## Issues

Before opening an issue, search existing issues to avoid duplicates.

Bug reports should include:

- Operating system and browser, when relevant
- Node.js and npm versions
- Steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots, logs, or stack traces if useful

Feature requests should include:

- The problem or workflow you want to improve
- The proposed behavior
- Any alternatives you considered

Security issues should not be reported in public issues. See `SECURITY.md`.

## Pull Requests

Use a focused branch name:

```sh
git checkout -b fix/page-title-save
git checkout -b feature/inbox-filter
```

Before opening a PR:

- Keep the PR focused on one change.
- Add or update tests for behavior changes.
- Update docs when setup, public APIs, or user-facing behavior changes.
- Run the relevant checks from the root workspace.
- Include screenshots or screen recordings for UI changes.

PR descriptions should explain:

- What changed
- Why the change is needed
- How it was tested
- Any known limitations or follow-up work

## Coding Standards

- Use TypeScript for new JavaScript code.
- Follow existing file and component patterns in the area you touch.
- Prefer shared package APIs over duplicating app-specific logic.
- Keep server state in TanStack Query patterns used by `packages/features`.
- Keep UI changes consistent with the existing design system and component style.
- Avoid unrelated refactors in feature or bug-fix PRs.

### Where does this file belong?

Before adding or moving a file, use this checklist:

1. Which user or server domain owns the behavior? Put it in that feature.
2. Is it only application composition, routing, provider setup, or shell layout?
   Put it in `app`.
3. Is it genuinely domain-neutral and app-local, with no feature or app import?
   Put it in that app's `shared` layer.
4. Is the same contract or behavior consumed by multiple apps or runtimes? Put
   it in the existing workspace package that owns the contract; do not create a
   package for hypothetical reuse.
5. Is it a database, storage, email, transport, or runtime mechanism? Put it in
   server `infrastructure`; put concrete feature composition in server `app`.
6. Is it part of a published server/package API? Keep its external specifier and
   symbol set stable, and expose it only through the package/public entrypoint.
7. Does another feature need it? Prefer the owner's narrow `index.ts`; do not
   create a broad barrel or a forwarding file for a private legacy path.

Web features cannot import `app`, and web `shared` cannot import `features` or
`app`. Server infrastructure cannot import feature implementations. Fallow
enforces the current approved graph in `.fallowrc.json`.

Run the architecture gate before submitting structural changes:

```sh
npm run verify:architecture
```

Run the repository verification commands from the workspace root:

```sh
npm run verify:core         # TypeScript packages, web, server, and changed code
npm run verify:desktop      # Rust formatting, clippy, and tests
npm run verify:architecture # Complete production Fallow report
npm run verify              # All of the above
```

The post-refactor verification baseline is 701 server tests, 140 shared-feature
tests, and 42 desktop tests. Server coverage is 45.15% statements, 40.12%
branches, 49.05% functions, and 46.47% lines. Production duplication is 2.15%,
the initial web JavaScript chunk is approximately 0.49 MB, all 25 ordinary
route chunks remain below 1 MB, and the lockfile contains one Shiki
installation. Every TypeScript workspace typechecks independently.

`verify:architecture` requires zero production unresolved imports, dependency
cycles, boundary violations, unused files, unused exports, and dependency
ownership findings. It also enforces the duplication ceiling and the
identity-based legacy health baseline. Full-repository reporting runs on
`main` and nightly, while pull requests block newly introduced changed-file
findings.

New and changed units must remain at or below 25 cyclomatic complexity, 40
cognitive complexity, 100 CRAP, and 400 lines. Do not regenerate the health
baseline to accommodate a change. An inline suppression must name the exception
and explain why it cannot be reduced in the same change.

## License

By contributing to Zilobase, you agree that your contributions are licensed under the MIT License that covers this repository.
