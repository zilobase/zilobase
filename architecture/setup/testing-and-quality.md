# Testing and quality

The root scripts compose workspace checks. Server tests use Vitest, packages use their configured Node/tsx runners, web tests use a custom esbuild-backed runner, and Rust uses Cargo. Source-string assertions prove source structure only. `test:tooling`, included in `verify:core`, runs development-profile tests, [self-host cookie tests](../../scripts/selfhost/cookie-jar.test.mjs) and [version setter tests](../../scripts/release/set-version.test.mjs). These unit tests use controlled inputs and temporary files; self-host deployment, upgrade, and packaged desktop checks remain separate integration commands requiring their corresponding local environments.

`test:databases:isolated` uses the [isolated Docker runner](../../scripts/databases/test-isolated-controller.mjs)
and [real PostgreSQL checks](../../apps/server/src/scripts/verify-database-controller.ts).
It applies the production migration set to an empty temporary database, then exercises
private receipt replay, concurrent favorites, navigation actor isolation, query hashes,
atomic placement rollback, sub-item setup, source linking, and lifecycle revisions.
It never reads a development database URL; the runner removes only its own temporary
container. This is persistence/HTTP-handler verification, not a full-browser test.

The root `fmt` command formats supported repository files with Oxfmt, while `fmt:check` verifies the committed baseline without writing. [Oxfmt configuration](../../.oxfmtrc.json) owns formatting conventions and excludes generated snapshots, Helm templates, and agent/tool instruction trees that are generated or use nonstandard syntax. The always-on [CI workflow](../../.github/workflows/ci.yml) and local commit/push checks enforce `fmt:check`; `verify:core` includes the same gate.

The root `lint` command runs Oxlint over the web and shared feature-package sources. [Oxlint configuration](../../.oxlintrc.json) registers `@shadcn/lint` and the official `@tanstack/eslint-plugin-query`. It points component discovery at the web shared UI alias and enforces TanStack Query's strict query-key, option-factory, stable-dependency, property-order and query-function rules. Package unit-test files remain covered by their TypeScript and test runners rather than the application-oriented query lint rules.

## Ownership

- [Entrypoint/configuration](../../package.json)
- [Implementation](../../scripts/refactor/check-architecture.mjs)
- [Contributor guide or operational runbook](../../CONTRIBUTING.md)
- [Verification](../../apps/web/test/support/run-tests.mjs)

Command definitions remain in [package scripts](../../package.json); consult them for the current invocation. [Architecture index](../README.md).

## Architecture checks

`test:architecture` checks local architecture/contributor links and published package entry conditions, names and value/type export kinds using TypeScript resolution. The baseline deliberately ignores implementation paths so moves and explicit re-exports remain compatible. Additive exports are allowed; existing entries cannot disappear. The checker does not prove parameter/type compatibility or runtime semantics: workspace typechecks and behavioral tests remain required. Baseline recapture refuses to overwrite an existing file. This replaces the former exact package-export-key test: additive contract/React entrypoints are allowed while removals remain checked. Shared-package tests also enforce that published contracts have no runtime React/application dependency.

The initial verification at b96f5c3d passed workspace typechecks, web tests, package tests, and server quality checks (976 server tests plus 278 query regressions). Coverage was produced by the server quality script.

Earlier migrations narrowed desktop/offline cross-imports, web feature imports of app composition, editor/page/database/AI imports, broad server feature-to-feature imports, and runtime declarations importing feature-owned types.

Shared mutation tests render real hooks with React DOM's server renderer and execute their MutationObservers against an isolated QueryClient. The renderer is a test dependency pinned to the web workspace's existing version. These tests cover optimistic writes before transport, rollback of source/target caches, publication invalidation, and template navigation refresh; the latter replaces the old source-string assertion.

The [database browser suite](../../scripts/databases/e2e/controller.spec.mjs), invoked
with `npm run test:databases:browser`, runs installed Chrome against isolated Vite
fixtures. It exercises native Kanban drag events with delayed acknowledgements and
stale reads, mounted table/Kanban query identity, and local demo receipt replay. The
fixtures use real controller/drag/query code with controlled transports; this is not
a full signed-in application walkthrough or a substitute for PostgreSQL verification.
It loads no environment files and makes no writes to development databases.

The [signed-in application walkthrough](../../scripts/databases/test-app-browser.mjs)
(`npm run test:databases:app-browser`) starts the actual application against disposable
PostgreSQL, Valkey and object storage. It holds real command requests to verify native
Kanban drag and Table property edits project across view switches before transport,
then checks persistence after acknowledgement and reload. It also rejects React
render-phase parent updates during view switching. This covers local command
reconciliation and delivery to a second independent browser over a real realtime
socket, without manual refresh, including catch-up after an offline interval.
It rejects background lane errors as well.
Deployed upgrade behavior is verified separately by `test:selfhost:upgrade`.
Prerequisites and cleanup are described in the [database runbook](../../docs/databases/operations.md#deployment-and-verification).

Pull requests and main pushes run `verify:core`, lint, and the complete `verify:architecture` suite in one CI job with PostgreSQL. Superseded CI runs are cancelled. The separate backend, web/package, and community-boundary workflows have been consolidated into this job to share dependency installation and keep one core check.

The [self-host suite](../../.github/workflows/selfhost.yml) (Compose, packaged desktop, and upgrade) and [Community Helm suite](../../.github/workflows/community-helm.yml) run only through manual dispatch before releases or deployment changes. They no longer run on every PR, main push, or nightly; operators must trigger them for the candidate ref and review their results.

The [Electron matrix](../../.github/workflows/electron-desktop.yml) builds an unpacked app on each desktop OS and runs the [packaged smoke](../../apps/desktop/e2e/electron-smoke.mjs) and [OAuth loopback test](../../apps/desktop/e2e/electron-oauth.mjs). Its manually dispatched installer matrix also runs [artifact verification](../../scripts/desktop/verify-electron-candidate.mjs), including signature checks when signing credentials are supplied. The [Electron self-host flow](../../apps/desktop/e2e/electron-selfhost.mjs) requires a running compatible server and is a separate integration command. These checks do not exercise a real browser OAuth redirect, signed update installation or live audio devices.

The [commit and push hooks](../../scripts/git/pre-push.mjs) select relevant subsets of CI from staged files (`git commit`) or `origin/main...HEAD`
(`git push`) using their own path filters. GitHub CI runs the complete core suite. Commit only runs the
cheap jobs. Push adds the web, package, or desktop suites when those paths changed. It does not run Compose self-host,
Community Helm, desktop packaging, or release publishing. Setup
installs both hooks through [hook installation](../../scripts/git/install-hooks.mjs);
[hook tests](../../scripts/git/pre-push.test.mjs) cover path selection and skip
behavior.
