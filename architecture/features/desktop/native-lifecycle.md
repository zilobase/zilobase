# Native application lifecycle

[App composition](../../../apps/desktop/src-tauri/src/app/mod.rs) installs Tauri plugins, manages native state, registers commands and wires startup/window events. The [window module](../../../apps/desktop/src-tauri/src/app/window.rs) keeps window behavior local. Native modules expose the existing command names; the web app selects runtime adapters before rendering.

## Server identity and profiles

[Server contracts](../../../apps/desktop/src-tauri/src/server/contracts.rs) own serialized discovery and profile types. Their camelCase fields, optional-field omission and configuration version define the only accepted persisted representation. [Profile state](../../../apps/desktop/src-tauri/src/server/profile_state.rs) owns matching, activation, snapshot validation and sanitization without filesystem or keychain calls. Built-in Cloud aliases preserve their special matching rule; custom instance identities remain strict.

[Configuration](../../../apps/desktop/src-tauri/src/server/config.rs) loads, validates and atomically writes configuration. Development and release configurations use distinct filenames. Unsupported configuration versions fail explicitly instead of being upgraded in place. It owns keychain-backed credential presence and removes a profile only after credential deletion succeeds. Corrupt saved configuration produces an error rather than silently switching to Cloud. [Discovery](../../../apps/desktop/src-tauri/src/server/discovery.rs) verifies origins, metadata, protocol and minimum native version. [Server commands](../../../apps/desktop/src-tauri/src/server/mod.rs) own prepared-candidate state and expiry, and coordinate verification and persistence.

## Authentication

[OAuth](../../../apps/desktop/src-tauri/src/auth/oauth.rs) owns one active authorization attempt, cancellation and completion. [Loopback transport](../../../apps/desktop/src-tauri/src/auth/oauth/loopback.rs), [callback validation](../../../apps/desktop/src-tauri/src/auth/callback.rs) and [token exchange](../../../apps/desktop/src-tauri/src/auth/oauth/token_exchange.rs) retain distinct request limits and validation responsibilities. Authentication uses the selected server identity and preserves state, issuer and PKCE checks.

[Keyring](../../../apps/desktop/src-tauri/src/auth/keyring.rs) owns credential reads/writes/deletion and server-scoped account naming under service `com.zilobase`. Unscoped credentials are not read or migrated. Server profile snapshots contain navigation/workspace state; session credentials remain in the keyring. Web sign-out/server replacement ordering is described in [desktop integration](README.md).

## Diagnostics

[Renderer event rules](../../../apps/desktop/src-tauri/src/diagnostics/renderer_event.rs) validate event names and retain only approved bounded numeric, boolean, status, platform and identifier fields. Unknown/free-text fields are dropped. The single formatter interface is used by the native logging command and its tests; it imports no archive, filesystem or app implementation.

[Diagnostics commands](../../../apps/desktop/src-tauri/src/diagnostics/mod.rs) select log directories, capture runtime metadata and create bounded archives for explicit CLI/UI requests. Archive limits, manifest schema and CLI flags are unchanged. Native diagnostics do not imply that arbitrary application logs are automatically scrubbed by renderer-event rules.

## Electron implementation in progress

The [Electron main entrypoint](../../../apps/desktop/electron/main/index.mjs) validates IPC sender frame and origin, installs a privileged asset protocol, enforces a response CSP, registers one application instance and passes only typed deep links to the renderer. The [preload bridge](../../../apps/desktop/electron/preload/index.cjs) exposes named operations under API version 1. [Server profiles](../../../apps/desktop/electron/main/server.mjs) keep configuration version 2 and import the Tauri config once; [credential storage](../../../apps/desktop/electron/main/credentials.mjs) encrypts each scoped profile's token and owner with Electron safeStorage and uses the [legacy sidecar](../../../apps/desktop/electron/sidecar/src/main.rs) to migrate scoped OS keyring entries. Linux plaintext safeStorage backends fail closed.

[Browser authorization](../../../apps/desktop/electron/main/oauth.mjs) owns an ephemeral loopback listener, PKCE challenge, state and issuer checks, cancellation and token exchange. [Electron diagnostics](../../../apps/desktop/electron/main/diagnostics.mjs) filter renderer fields before logging and export bounded ZIPs; [updates](../../../apps/desktop/electron/main/updater.mjs) use the Electron Builder feed once packaging adds its platform metadata. The Tauri host remains the release target until capture and packaging parity is verified.

## Verification

Run `verify:desktop` for Rust formatting, Clippy and tests. The native tests include loopback discovery, configuration round trips and version rejection, profile removal failure, candidate expiry, OAuth/callback behavior and diagnostic redaction. New snapshot/redaction cases passed before extraction. They use temporary files and controlled transports; they do not establish live keychain, packaged-app, device or browser smoke behavior. Follow [testing and quality](../../setup/testing-and-quality.md) and the existing [desktop E2E entrypoint](../../../apps/desktop/e2e/selfhost.mjs) for those checks.

For Electron, build a local package and run the [isolated smoke test](../../../apps/desktop/e2e/electron-smoke.mjs). It exercises the packaged preload and main IPC, a profile snapshot round trip, encrypted credential round trip and diagnostic redaction without touching the release app's user data. OAuth and device capture still require separate live acceptance tests.
