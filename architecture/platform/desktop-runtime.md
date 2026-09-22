# Desktop runtime

## Interface and flow

The native Tauri host starts the web application and exposes native authentication, server selection, diagnostics and meeting capture. Web modules own the corresponding UI and orchestrate native operations. The [native lifecycle guide](../features/desktop/native-lifecycle.md) maps the serialized contracts, profile rules, persistence, authentication and diagnostic interfaces.

Start at the [entrypoint](../../apps/desktop/src-tauri/src/app/mod.rs); follow the [implementation](../../apps/desktop/src-tauri/src) and [related modules](../../apps/web/src/features/desktop).

## Invariants and failure handling

Native command names, deep links, keychain identifiers and persisted server configuration are compatibility interfaces. Server switching must release old connections and clear the appropriate cached account state.

The server allows the exact `zilo-desktop://app` client origin for the Electron migration alongside the two Tauri origins. The new origin is included in CORS and authentication trusted origins; lookalike hosts are rejected. The current shipped native host remains Tauri until the Electron cutover.

The experimental [Electron host](../../apps/desktop/electron/main/index.mjs) creates one sandboxed main window and serves the packaged web build from a standard secure local protocol. Its [preload](../../apps/desktop/electron/preload/index.cjs) exposes the versioned desktop bridge; the [web adapter](../../apps/web/src/platform/desktop/native.ts) routes supported operations to that bridge or the shipped Tauri runtime. Electron [server profiles](../../apps/desktop/electron/main/server.mjs), [browser PKCE](../../apps/desktop/electron/main/oauth.mjs), [encrypted credentials](../../apps/desktop/electron/main/credentials.mjs), [diagnostics](../../apps/desktop/electron/main/diagnostics.mjs), notifications and the [updater](../../apps/desktop/electron/main/updater.mjs) live in main. A small [sidecar](../../apps/desktop/electron/sidecar/src/main.rs) reads and deletes legacy OS keyring entries for migration. [electron-builder.yml](../../apps/desktop/electron-builder.yml) owns platform packaging and macOS helper signing; the [experimental matrix](../../.github/workflows/electron-desktop.yml) smokes unpacked packages without publishing them. Live capture and signed installers remain release gates.

Manual matrix runs also build signed or unsigned installer candidates for review.
Linux runners install the native D-Bus, libclang, and audio build dependencies; unsigned
jobs clear empty certificate variables before packaging.
Linux packaging pins the executable name to `zilobase-client`; deriving it
from the scoped workspace package would produce a different launch path.
Installer filenames also use the unscoped name so DEB and RPM files stay in the
release directory.
The Linux desktop entry uses `com.zilobase` for launcher and window association.
ARM64 Linux candidates emit a separate `latest-linux-arm64.yml` update feed;
the installer verifier selects the feed for the runner architecture. Linux
smoke tests use an isolated GNOME Secret Service session for credential checks.

## Verification

The [capture host](../../apps/desktop/electron/main/capture.mjs) supervises a native [audio sidecar](../../apps/desktop/electron/sidecar/src/meetings/capture.rs) for devices, recording, transport, and checkpoint recovery. It uses the same recording directory and serialized artifacts as Tauri.

The [packaged Electron smoke test](../../apps/desktop/e2e/electron-smoke.mjs) verifies origin, preload, profile state, encrypted storage and diagnostic redaction. The [Electron self-host test](../../apps/desktop/e2e/electron-selfhost.mjs) drives packaged server selection against a supplied Compose or staging origin; Tauri's [self-host test](../../apps/desktop/e2e/selfhost.mjs) remains the shipped flow. See [testing and quality](../setup/testing-and-quality.md). [Architecture index](../README.md).

Calendar's running-app reminder host can deliver immediate native notifications through `tauri-plugin-notification`. The main-window capability grants the plugin API; the web settings flow requests OS permission explicitly. No native alarm is scheduled, so this adds no closed-app delivery guarantee. See the [Calendar guide](../features/calendar/README.md).
