# Release and upgrades

Release tooling synchronizes versions and orchestrates packaging. [Versioned package ownership](../../scripts/release/versioned-packages.mjs) is shared by the setter and release staging so package files cannot drift between those operations. The setter also updates the server version, Electron capture sidecar manifest and its Cargo lockfile record; unrelated dependency versions are preserved. The release command stages these files together and requires a stable version, changelog section and clean tree except the changelog before committing and tagging. The setter retains its broader prerelease/build-version acceptance.

[Version tests](../../scripts/release/set-version.test.mjs) run the actual setter in a temporary fixture and never commit/tag or modify this checkout’s version. Desktop and self-hosted installations have distinct update paths. Internal restructuring preserves published assets, versions and upgrade data formats; executing a refactor does not authorize a release.

The [Electron package configuration](../../apps/desktop/electron-builder.yml) supplies protocol registration, macOS hardened-runtime entitlements and the bundled audio sidecar. [Electron package CI](../../.github/workflows/electron-desktop.yml) builds and smokes unpacked apps on macOS, Windows and Linux. A manual workflow run builds unsigned or signed installer candidates for both macOS and Linux architectures plus Windows x64; [candidate verification](../../scripts/desktop/verify-electron-candidate.mjs) checks installer formats, update metadata, sidecar inclusion and signed platform artifacts. The [release workflow](../../.github/workflows/release.yml) prepares a draft, builds signed Electron installers, [assembles update feeds](../../scripts/desktop/assemble-electron-release.mjs) from all platforms, and publishes only after upload succeeds. It retains the last signed Tauri feed for older clients, which remain on their previous version until a separate migration bridge or manual Electron installation. [Desktop release operations](../../apps/desktop/README.md) describe credentials and acceptance steps.

## Ownership

- [Entrypoint/configuration](../../scripts/release/release.mjs)
- [Implementation](../../scripts/release/set-version.mjs)
- [Contributor guide or operational runbook](../../docs/self-hosting/release-checklist.md)
- [Verification](../../scripts/desktop/verify-electron-candidate.mjs)

Command definitions remain in [package scripts](../../package.json); consult them for the current invocation. [Architecture index](../README.md).
