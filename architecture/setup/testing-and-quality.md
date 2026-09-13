# Testing and quality

The root scripts compose workspace checks. Server tests use Vitest, packages use their configured Node/tsx runners, web tests use a custom esbuild-backed runner, and Rust uses Cargo. Fallow gates imports, dead code, duplication and identity-baselined health. The health wrapper refreshes server coverage before scoring; running it repeats server tests. Source-string assertions prove source structure only. `test:tooling`, included in `verify:core`, runs development-profile tests, [self-host cookie tests](../../scripts/selfhost/cookie-jar.test.mjs) and [version setter tests](../../scripts/release/set-version.test.mjs). These unit tests use controlled inputs and temporary files; self-host deployment, upgrade, and packaged desktop checks remain separate integration commands requiring their corresponding local environments.

## Ownership

- [Entrypoint/configuration](../../package.json)
- [Implementation](../../scripts/refactor/check-health.mjs)
- [Contributor guide or operational runbook](../../CONTRIBUTING.md)
- [Verification](../../apps/web/test/support/run-tests.mjs)

Command definitions remain in [package scripts](../../package.json); consult them for the current invocation. [Architecture index](../README.md).

## Architecture checks

`test:architecture` checks local architecture/contributor links and published package entry conditions, names and value/type export kinds using TypeScript resolution. The baseline deliberately ignores implementation paths so moves and explicit re-exports remain compatible. Additive exports are allowed; existing entries cannot disappear. The checker does not prove parameter/type compatibility or runtime semantics: workspace typechecks and behavioral tests remain required. Baseline recapture refuses to overwrite an existing file. This replaces the former exact package-export-key test: additive contract/React entrypoints are allowed while removals remain checked. Shared-package tests also enforce that published contracts have no runtime React/application dependency.

The initial verification at b96f5c3d passed workspace typechecks, web tests, package tests, server quality checks (976 server tests plus 278 query regressions), and the changed-file Fallow audit. Coverage was produced by the server quality script; an audit of changed files is not a claim that every existing function satisfies the final target structure.

The initial dependency exceptions are recorded in the history of [Fallow](../../.fallowrc.json): desktop/offline cross-imports, web feature imports of app composition, editor/page/database/AI imports, broad server feature-to-feature imports, and runtime declarations importing feature-owned types. The current configuration narrows these in each owning migration; preserve the identity health baseline and existing thresholds.

Shared mutation tests render real hooks with React DOM's server renderer and execute their MutationObservers against an isolated QueryClient. The renderer is a test dependency pinned to the web workspace's existing version. These tests cover optimistic writes before transport, rollback of source/target caches, publication invalidation, and template navigation refresh; the latter replaces the old source-string assertion.

Pull requests gate newly introduced Fallow findings; main pushes and scheduled
runs execute the complete `verify:architecture` suite. Modules loaded by the web
harness through `loadModule()` must be recorded in Fallow’s `dynamicallyLoaded`
list, including the pending-page-embed plugin exercised by editor drag/drop tests.

The [commit and push hooks](../../scripts/git/pre-push.mjs) select those
pull-request jobs from staged files (`git commit`) or `origin/main...HEAD`
(`git push`), matching the workflow `paths:` filters. Commit only runs the
cheap jobs. Push adds Fallow (including server tests) and the web, package, or
desktop suites when those paths changed. It does not run Compose self-host,
Community Helm, nightly desktop packaging, or release publishing. Setup
installs both hooks through [hook installation](../../scripts/git/install-hooks.mjs);
[hook tests](../../scripts/git/pre-push.test.mjs) cover path selection and skip
behavior.
