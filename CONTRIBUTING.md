# Contributing to Zilobase

Thanks for your interest in improving Zilobase. This guide explains how to set up the repo, make focused changes, and submit pull requests that are straightforward to review.

## Development Setup

Prerequisites:

- Node.js 24
- npm 11
- Docker

Install the workspace dependencies from the repository root:

```sh
npm run setup
npm run dev
```

Development commands load server and Vite variables from the root
`.env.development` file through dotenvx. Encrypted env files are committed;
`.env.keys` is gitignored. Keep that private-key file in a password manager,
never in git. Re-encrypt after edits with `npm run env:encrypt`.

Useful commands:

```sh
npm run dev
npm run build
npm run test:web
npm run db:studio
```

The root supervisor runs the Node runtime and its local dependencies.
`npm run db:studio` opens Drizzle Studio against the local development
database. See
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

See `architecture/README.md` for a deeper walkthrough.

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
`app`. Server infrastructure cannot import feature implementations.

Run the architecture gate before submitting structural changes:

```sh
npm run verify:architecture
```

Run the repository verification commands from the workspace root:

```sh
npm run verify:core         # TypeScript packages, web, and server
npm run verify:desktop      # Rust formatting, clippy, and tests
npm run verify:architecture # Architecture links and published exports
npm run verify              # All of the above
npm run verify:commit       # Fast staged-file checks used by the commit hook
npm run verify:push         # Path-filtered GitHub pull-request checks
npm run verify:push -- --dry-run
```

`npm run setup` points Git at [`.githooks`](.githooks). `git commit` runs the
cheap path-filtered jobs (community boundary, architecture links, and tooling
or token checks when those files are staged). `git push` then runs the same
pull-request jobs GitHub runs: those commit checks plus the web, package, or
desktop suites when those paths changed. Compose self-host, Community Helm, nightly desktop
packaging, and release publishing stay on GitHub; they need Docker/kind
clusters and take much longer. Enable the hooks later with
`npm run hooks:install`. Skip once with `git commit --no-verify`,
`git push --no-verify`, or `ZILOBASE_SKIP_HOOKS=1`.

Verification evidence and the scope of each gate are described in [testing and quality](architecture/setup/testing-and-quality.md). Use current command output for counts and coverage; source moves and new behavioral tests change those measurements.

`verify:architecture` checks local links in architecture and contributor
documents and verifies published package exports against the baseline in
`scripts/refactor/public-exports-baseline.json`.

New and changed units must remain at or below 25 cyclomatic complexity, 40
cognitive complexity, 100 CRAP, and 400 lines.

## License

By contributing to Zilobase, you agree that your contributions are licensed under the MIT License that covers this repository.
