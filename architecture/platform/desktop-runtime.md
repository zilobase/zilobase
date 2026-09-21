# Desktop runtime

## Interface and flow

The native Tauri host starts the web application and exposes native authentication, server selection, diagnostics and meeting capture. Web modules own the corresponding UI and orchestrate native operations. The [native lifecycle guide](../features/desktop/native-lifecycle.md) maps the serialized contracts, profile rules, persistence, authentication and diagnostic interfaces.

Start at the [entrypoint](../../apps/desktop/src-tauri/src/app/mod.rs); follow the [implementation](../../apps/desktop/src-tauri/src) and [related modules](../../apps/web/src/features/desktop).

## Invariants and failure handling

Native command names, deep links, keychain identifiers and persisted server configuration are compatibility interfaces. Server switching must release old connections and clear the appropriate cached account state.

The server allows the exact `zilo-desktop://app` client origin for the Electron migration alongside the two Tauri origins. The new origin is included in CORS and authentication trusted origins; lookalike hosts are rejected. The current shipped native host remains Tauri until the Electron cutover.

## Verification

See [tests or test configuration](../../apps/desktop/e2e/selfhost.mjs) and [testing and quality](../setup/testing-and-quality.md). [Architecture index](../README.md).

Calendar's running-app reminder host can deliver immediate native notifications through `tauri-plugin-notification`. The main-window capability grants the plugin API; the web settings flow requests OS permission explicitly. No native alarm is scheduled, so this adds no closed-app delivery guarantee. See the [Calendar guide](../features/calendar/README.md).
