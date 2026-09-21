# Native application lifecycle

[App composition](../../../apps/desktop/src-tauri/src/app/mod.rs) installs Tauri plugins, manages native state, registers commands and wires startup/window events. The [window module](../../../apps/desktop/src-tauri/src/app/window.rs) keeps window behavior local. Native modules expose the existing command names; the web app selects runtime adapters before rendering.

## Server identity and profiles

[Server contracts](../../../apps/desktop/src-tauri/src/server/contracts.rs) own serialized discovery and profile types. Their camelCase fields, optional-field omission, configuration version and legacy representation are retained. [Profile state](../../../apps/desktop/src-tauri/src/server/profile_state.rs) owns matching, activation, snapshot validation and sanitization without filesystem or keychain calls. Built-in Cloud aliases preserve their special matching rule; custom instance identities remain strict.

[Configuration](../../../apps/desktop/src-tauri/src/server/config.rs) loads, validates, migrates and atomically writes configuration. Development and release configurations use distinct filenames. It owns keychain-backed credential presence and removes a profile only after credential deletion succeeds. Corrupt saved configuration produces an error rather than silently switching to Cloud. [Discovery](../../../apps/desktop/src-tauri/src/server/discovery.rs) verifies origins, metadata, protocol and minimum native version. [Server commands](../../../apps/desktop/src-tauri/src/server/mod.rs) own prepared-candidate state and expiry, and coordinate verification and persistence.

## Authentication

[OAuth](../../../apps/desktop/src-tauri/src/auth/oauth.rs) owns one active authorization attempt, cancellation and completion. [Loopback transport](../../../apps/desktop/src-tauri/src/auth/oauth/loopback.rs), [callback validation](../../../apps/desktop/src-tauri/src/auth/callback.rs) and [token exchange](../../../apps/desktop/src-tauri/src/auth/oauth/token_exchange.rs) retain distinct request limits and validation responsibilities. Authentication uses the selected server identity and preserves state, issuer and PKCE checks.

[Keyring](../../../apps/desktop/src-tauri/src/auth/keyring.rs) owns credential reads/writes/deletion and account naming. Service `com.zilobase` and legacy account names remain compatible. Server profile snapshots contain navigation/workspace state; session credentials remain in the keyring. Web sign-out/server replacement ordering is described in [desktop integration](README.md).

## Diagnostics

[Renderer event rules](../../../apps/desktop/src-tauri/src/diagnostics/renderer_event.rs) validate event names and retain only approved bounded numeric, boolean, status, platform and identifier fields. Unknown/free-text fields are dropped. The single formatter interface is used by the native logging command and its tests; it imports no archive, filesystem or app implementation.

[Diagnostics commands](../../../apps/desktop/src-tauri/src/diagnostics/mod.rs) select log directories, capture runtime metadata and create bounded archives for explicit CLI/UI requests. Archive limits, manifest schema and CLI flags are unchanged. Native diagnostics do not imply that arbitrary application logs are automatically scrubbed by renderer-event rules.

## Verification

Run `verify:desktop` for Rust formatting, Clippy and tests. The 44 native tests include loopback discovery, configuration migration and round trips, profile removal failure, candidate expiry, OAuth/callback behavior and diagnostic redaction. New snapshot/redaction cases passed before extraction. They use temporary files and controlled transports; they do not establish live keychain, packaged-app, device or browser smoke behavior. Follow [testing and quality](../../setup/testing-and-quality.md) and the existing [desktop E2E entrypoint](../../../apps/desktop/e2e/selfhost.mjs) for those checks.
