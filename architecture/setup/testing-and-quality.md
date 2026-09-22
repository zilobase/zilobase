# Testing and quality

The root scripts compose workspace checks. Server tests use Vitest, packages use their configured Node/tsx runners, web tests use a custom esbuild-backed runner, and Rust uses Cargo. Source-string assertions prove source structure only. `test:tooling`, included in `verify:core`, runs development-profile tests, [self-host cookie tests](../../scripts/selfhost/cookie-jar.test.mjs) and [version setter tests](../../scripts/release/set-version.test.mjs). These unit tests use controlled inputs and temporary files; self-host deployment, upgrade, and packaged desktop checks remain separate integration commands requiring their corresponding local environments.

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

Pull requests and main pushes run the complete `verify:architecture` suite.

The [Electron matrix](../../.github/workflows/electron-desktop.yml) builds an unpacked app on each desktop OS and runs the [packaged smoke](../../apps/desktop/e2e/electron-smoke.mjs) and [OAuth loopback test](../../apps/desktop/e2e/electron-oauth.mjs). Its manually dispatched installer matrix also runs [artifact verification](../../scripts/desktop/verify-electron-candidate.mjs), including signature checks when signing credentials are supplied. The [Electron self-host flow](../../apps/desktop/e2e/electron-selfhost.mjs) requires a running compatible server and is a separate integration command. These checks do not exercise a real browser OAuth redirect, signed update installation or live audio devices.

The [commit and push hooks](../../scripts/git/pre-push.mjs) select those
pull-request jobs from staged files (`git commit`) or `origin/main...HEAD`
(`git push`), matching the workflow `paths:` filters. Commit only runs the
cheap jobs. Push adds the web, package, or desktop suites when those paths changed. It does not run Compose self-host,
Community Helm, nightly desktop packaging, or release publishing. Setup
installs both hooks through [hook installation](../../scripts/git/install-hooks.mjs);
[hook tests](../../scripts/git/pre-push.test.mjs) cover path selection and skip
behavior.
