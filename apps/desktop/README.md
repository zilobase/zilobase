# Zilobase desktop

The desktop host is Electron. Its sandboxed renderer uses the versioned
`window.zilobaseDesktop` preload bridge; native authentication, server profiles,
diagnostics, updates and meeting capture are owned by Electron main and the
bundled audio sidecar. The web bundle is shared with the browser application.

## Develop and test

From the repository root, run `npm run dev:desktop` to start a local API and
Electron, or start the normal stack with `npm run dev` and then use
`npm run dev:desktop:node` to attach Electron to that Node profile. Both desktop
commands start Vite on port 1420. The debug default server is
`http://localhost:3000`; packaged builds default to Zilobase Cloud.

`npm run verify:desktop` runs the audio sidecar's Rust formatting, Clippy and
unit tests. To build an unsigned local app, build the web bundle and run
`CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack:electron --workspace @zilobase/desktop`.
Set `ZILOBASE_DESKTOP_BINARY` to the unpacked executable and run
`npm run test:electron:smoke --workspace @zilobase/desktop` and
`npm run test:electron:oauth --workspace @zilobase/desktop`. These tests use
isolated user data; the OAuth test uses a local authorization server. With
`ZILOBASE_E2E_SERVER` set to a compatible instance origin, run
`npm run test:desktop:selfhost`. A second origin may be supplied through
`ZILOBASE_E2E_ADDITIONAL_SERVER`.

The [Electron desktop workflow](../../.github/workflows/electron-desktop.yml)
packages and smokes unpacked apps on macOS, Windows and Linux. Its manual
installer matrix accepts `unsigned` or `signed` and uploads review artifacts.
The [candidate verifier](../../scripts/desktop/verify-electron-candidate.mjs)
checks formats, feeds, sidecar inclusion and signatures when signing is required.
Linux CI starts a GNOME Secret Service session for credential tests and sets
Chromium's unpacked `chrome-sandbox` helper to root ownership and mode `4755`.

## Release signing and updates

The [release workflow](../../.github/workflows/release.yml) builds Electron
installers for macOS Intel and Apple Silicon, Windows x64, and Linux x64 and
ARM64. It requires signed candidates, assembles Electron update feeds and
uploads installers to a draft, publishing it only after every desktop build
and feed assembly passes. macOS automatic
updates use ZIP metadata; Windows uses NSIS; Linux uses AppImage. PKG, MSI,
DEB and RPM are manual installation formats. The release also retains the
last signed Tauri `latest.json` feed for installed legacy clients; this keeps
their updater endpoint valid but does **not** automatically replace them with
Electron. Existing Tauri users must install Electron manually until a
separately validated bridge release is available. Do not publish the cutover
as a seamless upgrade.

Configure these GitHub Actions secrets before a signed candidate or release:

| Secret | Purpose |
| --- | --- |
| `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD` | Base64 Developer ID Application `.p12` and export password |
| `APPLE_INSTALLER_CERTIFICATE`, `APPLE_INSTALLER_CERTIFICATE_PASSWORD` | Base64 Developer ID Installer `.p12` and export password for PKG |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | Apple account, app-specific password and team for notarization |
| `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD` | Authenticode `.pfx` and export password |

`APPLE_CERTIFICATE` and `APPLE_INSTALLER_CERTIFICATE` must include their private
keys. Encode a `.p12` with `openssl base64 -A -in certificate.p12 -out
certificate-base64.txt`; put the output in the corresponding secret. The
Tauri minisign key is used only to authenticate older Tauri updates and cannot
sign Electron releases. Signed candidates must pass the verifier, packaged
OAuth tests, live microphone/system-audio capture and recovery, and update
installation on every supported OS before publishing.

The new runtime keeps the same `com.zilobase` identity, profile configuration
format, local recording artifacts and scoped keyring account names. The
[credential adapter](electron/main/credentials.mjs) imports old keyring entries
through the bundled sidecar, then encrypts them with Electron `safeStorage`.
On Linux, a plaintext or unavailable secret-store backend fails closed.
Removing a server deletes both legacy and new scoped credentials. Keep the two
Tauri client origins on the server allowlist while old installations remain in
use.

## Authentication and server links

Desktop authentication opens `/desktop/authorize` in the system browser with
PKCE and receives the code on an ephemeral `127.0.0.1` callback listener.
The native host validates state, issuer and instance identity before storing
the desktop session. Provider client secrets remain on the server.

Cloud is selected on a new installation. **Change server** verifies
`/.well-known/zilobase` before replacement. `zilobase://connect?server=...`
and `zilobase://open?instance=...&server=...&path=...` are parsed for both
cold start and second instance; query values are excluded from diagnostics.
Switching servers revokes the old session when possible, closes HTTP and
WebSocket work, clears scoped credentials and browser caches, then activates
the verified profile. Unsynced drafts require an explicit user decision.

## Diagnostics

Use **Settings → Preferences → Desktop diagnostics** to open logs or export a
bounded archive. If the window cannot open, run `zilobase-client --diagnostics`
from a terminal. The command writes a ZIP without opening a window.
`ZILOBASE_LOG=debug` enables additional approved diagnostic events; token,
cookie, callback query and document values are not logged. Logs live under
`~/Library/Logs/com.zilobase` on macOS and the application data log directory
on Windows and Linux.
