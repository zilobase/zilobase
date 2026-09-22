# Desktop runtime

The [Electron main process](../../apps/desktop/electron/main/index.mjs) owns the
900×650 main window, single-instance lock, `zilobase://` protocol handling,
security policy and native integrations. The [sandboxed preload](../../apps/desktop/electron/preload/index.cjs)
exposes API version 1 through `window.zilobaseDesktop`; the
[web adapter](../../apps/web/src/platform/desktop/native.ts) is the renderer's
only desktop entrypoint. `contextIsolation` and `sandbox` are enabled and Node
integration is disabled. Main validates IPC sender frame and origin, enforces a
CSP and permits only approved renderer permissions and navigation.

[Server profiles](../../apps/desktop/electron/main/server.mjs) preserve version 2
configuration, scoped snapshots, verified candidates and discovery rules. The
server accepts the Electron `zilo-desktop://app` origin. It also accepts the two
legacy Tauri origins for already installed clients; remove those only after a
separate client retirement decision. Server replacement clears credentials and
renderer state through the [desktop integration flow](../features/desktop/README.md).

[Browser PKCE](../../apps/desktop/electron/main/oauth.mjs) uses a loopback
listener and the system browser. [Credentials](../../apps/desktop/electron/main/credentials.mjs)
use Electron `safeStorage`; the [sidecar](../../apps/desktop/electron/sidecar/src/main.rs)
imports and deletes instance-scoped legacy keyring entries. [Diagnostics](../../apps/desktop/electron/main/diagnostics.mjs)
filter renderer events and create bounded log archives. [Updates](../../apps/desktop/electron/main/updater.mjs)
read Electron Builder feeds. The [release workflow](../../.github/workflows/release.yml)
packages signed installers and assembles those feeds. The retained legacy
`latest.json` keeps old clients' updater endpoint valid but does not upgrade a
Tauri installation to Electron automatically.

[Meeting capture main](../../apps/desktop/electron/main/capture.mjs) validates
requests and supervises the [native audio sidecar](../../apps/desktop/electron/sidecar/src/meetings/mod.rs).
The sidecar keeps recording directories and checkpoint formats compatible with
previous desktop versions. [Native lifecycle](../features/desktop/native-lifecycle.md)
describes each boundary in detail.

## Verification

The [packaged smoke](../../apps/desktop/e2e/electron-smoke.mjs) checks preload,
origin, deep link, profile, credential, diagnostic and idle capture behavior.
The [OAuth test](../../apps/desktop/e2e/electron-oauth.mjs) uses an isolated
local authorization server. The [self-host test](../../apps/desktop/e2e/electron-selfhost.mjs)
checks discovery and selection against a compatible server. [Electron CI](../../.github/workflows/electron-desktop.yml)
runs packaged checks on each OS and verifies installer candidates. Live audio,
notarized installation and update installation need separate OS acceptance.
See [testing and quality](../setup/testing-and-quality.md).
