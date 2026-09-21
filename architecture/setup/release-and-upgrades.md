# Release and upgrades

Release tooling synchronizes versions and orchestrates packaging. [Versioned package ownership](../../scripts/release/versioned-packages.mjs) is shared by the setter and release staging so package files cannot drift between those operations. The setter also updates the server version, Tauri manifest/configuration, Electron capture sidecar manifest and the two targeted Cargo lockfile records; unrelated dependency versions are preserved. The release command stages these files together and requires a stable version, changelog section and clean tree except the changelog before committing and tagging. The setter retains its broader prerelease/build-version acceptance.

[Version tests](../../scripts/release/set-version.test.mjs) run the actual setter in a temporary fixture and never commit/tag or modify this checkout’s version. Desktop and self-hosted installations have distinct update paths. Internal restructuring preserves published assets, versions and upgrade data formats; executing a refactor does not authorize a release.

The experimental [Electron package configuration](../../apps/desktop/electron-builder.yml) supplies protocol registration, macOS hardened-runtime entitlements, and the bundled audio sidecar. [Electron package CI](../../.github/workflows/electron-desktop.yml) builds and smokes unpacked apps on macOS, Windows and Linux without publishing them. The Tauri release workflow remains the only publisher until Electron signing, live capture, updater feed and OS-specific installer checks pass. [Desktop release operations](../../apps/desktop/README.md) describe the separate credentials required to sign Electron packages.

## Ownership

- [Entrypoint/configuration](../../scripts/release/release.mjs)
- [Implementation](../../scripts/release/set-version.mjs)
- [Contributor guide or operational runbook](../../docs/self-hosting/release-checklist.md)
- [Verification](../../scripts/desktop/test-update.mjs)

Command definitions remain in [package scripts](../../package.json); consult them for the current invocation. [Architecture index](../README.md).
