# Native application lifecycle

[Electron main](../../../apps/desktop/electron/main/index.mjs) creates the main
window, registers the secure asset protocol, enforces one instance, handles
cold-start and second-instance links, and validates every IPC sender. The
[preload bridge](../../../apps/desktop/electron/preload/index.cjs) exposes named
version 1 operations and serializable `{ code, message }` errors. The
[renderer adapter](../../../apps/web/src/platform/desktop/native.ts) isolates
web features from the bridge.

## Server identity and profiles

[Server profiles](../../../apps/desktop/electron/main/server.mjs) own version 2
configuration, discovery, active-instance matching, workspace snapshots and
verified candidate expiry. Development and packaged builds use separate
filenames. The adapter imports an existing config once from the old location,
then writes atomically under Electron user data. Discovery rejects redirects,
large responses and unsupported protocol/minimum versions; non-loopback origins
must use HTTPS. Removing a profile deletes its scoped credentials first.

## Authentication and credentials

[Browser authorization](../../../apps/desktop/electron/main/oauth.mjs) runs one
PKCE attempt at a time with an ephemeral loopback listener, state and issuer
checks, cancellation and token exchange. The system browser handles the server
login. [Credential storage](../../../apps/desktop/electron/main/credentials.mjs)
uses `safeStorage` for scoped token and owner values and the
[legacy sidecar](../../../apps/desktop/electron/sidecar/src/main.rs) to read and
delete old OS keyring entries. Linux plaintext storage backends fail closed.
[Desktop integration](README.md) describes sign-out and server replacement
ordering.

## Diagnostics and updates

[Diagnostics](../../../apps/desktop/electron/main/diagnostics.mjs) allowlist
renderer fields, rotate logs and export bounded archives. `--diagnostics`
exports without creating a window. [Updater](../../../apps/desktop/electron/main/updater.mjs)
checks the packaged Electron feed and downloads an accepted update before
restart. [Packaging](../../../apps/desktop/electron-builder.yml) defines
protocol registration, icons, installers and macOS hardened runtime.

## Meeting capture

[Capture main](../../../apps/desktop/electron/main/capture.mjs) validates
requests and supervises the bundled sidecar with bounded messages and
timeouts. The [sidecar](../../../apps/desktop/electron/sidecar/src/meetings/mod.rs)
owns CPAL devices, 24 kHz mixing, transport, WAV checkpointing and recovery.
It retains the previous recording directory and serialized artifacts.

## Verification

Run `npm run verify:desktop` for sidecar formatting, Clippy and unit tests.
The [packaged smoke](../../../apps/desktop/e2e/electron-smoke.mjs),
[OAuth test](../../../apps/desktop/e2e/electron-oauth.mjs) and
[self-host test](../../../apps/desktop/e2e/electron-selfhost.mjs) exercise
runtime boundaries. Live device, browser, signed installer and updater checks
remain separate acceptance tests.
