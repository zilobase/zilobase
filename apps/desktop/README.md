# Zilobase desktop releases

The desktop app checks the latest GitHub release on launch. When a newer signed build is available, it offers to download, install, and restart the app.

## Experimental Electron shell

The Electron implementation is under development and is not part of the release
pipeline. Start the web dev server on port 1420, then run
`npm run dev:electron --workspace @zilobase/desktop`. Build a local package with
`npm run build:electron --workspace @zilobase/desktop`. The shell now includes
server profiles, browser authorization, encrypted session storage, diagnostics,
native notifications, an Electron update feed, and a supervised native meeting
capture sidecar. The sidecar also reads legacy keyring entries. For an unsigned local package,
build the web app and sidecar first, then run
`CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack:electron --workspace @zilobase/desktop`.
Set `ZILOBASE_DESKTOP_BINARY` to the packaged executable and run
`npm run test:electron:smoke --workspace @zilobase/desktop`. This uses temporary
user data and logs, and checks the preload, profile, second-instance link,
credential, capture-idle, diagnostics export and `--diagnostics` CLI contracts. The experimental CI
workflow runs it on all three desktop OSes.
Run `npm run test:electron:oauth --workspace @zilobase/desktop` with the same
packaged executable to test the loopback callback, state/issuer validation,
PKCE token exchange, scoped session persistence, and diagnostic redaction
against an isolated local authorization server. The test captures the browser
URL inside its temporary profile; normal app launches still use the system
browser.

Run the **Experimental Electron desktop** GitHub Actions workflow manually to
produce installer candidates for macOS Intel/Apple Silicon, Windows x64, and
Linux x64/ARM64. Select `unsigned` for packaging review or `signed` for release
acceptance. The workflow checks each installer format, update metadata, and the
bundled native sidecar before uploading short-lived review artifacts. It never
publishes a GitHub Release or changes the Tauri update feed. The package and
metadata checks are in `scripts/desktop/verify-electron-candidate.mjs`.

To test server selection against a running compatible self-hosted instance, set
`ZILOBASE_E2E_SERVER` to its canonical origin and run
`npm run test:electron:selfhost --workspace @zilobase/desktop`. The test opens
the packaged Electron app with isolated user data and verifies discovery and the
selected profile. A second origin can be supplied as
`ZILOBASE_E2E_ADDITIONAL_SERVER`. Live OAuth, microphone/loopback capture,
signed installers and update installation still require manual parity checks
before Electron can replace Tauri.
On macOS, starting input capture requests microphone permission through the
Electron host before it launches the native sidecar. If macOS previously denied
access, enable it in System Settings and restart the app.

### Electron signing and update feed

Electron Builder uses the same product identity (`com.zilobase`) and version as
Tauri, but its update metadata (`latest-mac.yml`, `latest.yml`, `latest-linux.yml`)
and installer formats differ from Tauri's signed `latest.json` feed. Keep Electron
artifacts out of the live GitHub release until an explicit cutover; existing Tauri
clients still need their own updater assets. The Electron updater expects signed
DMG/ZIP on macOS, NSIS on Windows, and AppImage on Linux. MSI, PKG, DEB and RPM
are manual distribution targets; they do not use this update flow.

For a signed Electron release, map the existing Apple Developer ID Application
certificate to `CSC_LINK` (`APPLE_CERTIFICATE`) and `CSC_KEY_PASSWORD`
(`APPLE_CERTIFICATE_PASSWORD`). Map `APPLE_ID`, `APPLE_PASSWORD` to
`APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` for notarization. PKG also
needs a Developer ID Installer certificate as `CSC_INSTALLER_LINK` and
`CSC_INSTALLER_KEY_PASSWORD`; the current Tauri secrets do not provide it.
Windows signing needs a separate certificate through `WIN_CSC_LINK` and
`WIN_CSC_KEY_PASSWORD`. The Tauri minisign key
`TAURI_SIGNING_PRIVATE_KEY` cannot sign Electron updates. The macOS entitlements
and helper signing paths are in `electron-builder.yml`. Verify the sidecar's
microphone permission and hardened runtime on a notarized build before shipping.

For the signed candidate workflow, provide these GitHub Actions secrets:
`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`,
`APPLE_TEAM_ID` (already used by Tauri), plus
`APPLE_INSTALLER_CERTIFICATE` and `APPLE_INSTALLER_CERTIFICATE_PASSWORD` for PKG,
and `WINDOWS_CERTIFICATE` and `WINDOWS_CERTIFICATE_PASSWORD` for Authenticode.
The certificate values are base64 encoded `.p12`/`.pfx` files. The workflow
fails before building if a required signing secret is absent. Its validation
checks the macOS app signature/notarization ticket and PKG signer, and the
Windows executable/installer signatures. Review these artifacts and run the
device acceptance checks before changing the release workflow.

## Browser sign-in

Desktop authentication uses the selected Zilobase server's authorization-code
flow with PKCE. The native app opens `/desktop/authorize` in the system browser
and receives the result on an ephemeral loopback address such as
`http://127.0.0.1:43123/oauth/callback`. The browser can use the server's normal
password, email-code, Google, or configured organization-provider path. Authentication never runs
in an embedded WebView or returns through a custom deep link.

The server stores only a SHA-256 hash of each five-minute authorization code and
binds it to the exact callback and S256 challenge. A successful exchange
atomically consumes the code and creates a separate Better Auth desktop session.
The native app validates callback state, issuer, instance identity, and the token
response before saving the session in the instance-scoped system keyring.

Desktop builds no longer contain Google client IDs or secrets. Social-provider
configuration belongs only to the server that renders the browser login. The
same desktop artifact can therefore sign in to Cloud or a compatible self-hosted
server without being rebuilt.

## Server links and replacement

Zilobase Cloud is selected for a new installation. Add a self-hosted server by
entering its canonical origin under **Change server** / **Settings →
Preferences → Desktop server**, or by opening the server's
`zilobase://connect?server=...` link. The native app requires HTTPS except for
loopback development, fetches `/.well-known/zilobase` without redirects, checks
protocol/version/origin/TLS compatibility, and holds the candidate in memory.
The saved server and current credentials are untouched until the user confirms.

`zilobase://open` links include `instance`, `server`, and `path`. The app opens
the path directly only when the selected instance and canonical origin match;
otherwise it verifies the target and uses the normal replacement workflow.
Neither connection link contains a token or authorization code. Cold-start and
running-app links use the same parser, and diagnostics record only accepted or
rejected event types.

Changing servers retains no account from the old instance. Unsynced offline
drafts block replacement until the user chooses Sync, Export, Discard, or
Cancel. After that decision, the app best-effort revokes the old session, aborts
old HTTP work, destroys WebSockets, removes the instance-scoped keyring entries,
query cache, IndexedDB/Yjs documents, app/auth stores, tabs, and session storage,
then commits the verified candidate and reloads. Returning to Cloud uses this
same destructive workflow.

`npm run dev:desktop` starts its own local API and points the debug app at
`http://localhost:3000`. Do not run it alongside `npm run dev`; they both
bind that API port. To use the full local stack (Postgres, MinIO, Mailpit,
and Vite), start `npm run dev` first and then `npm run dev:desktop:node`,
which attaches Tauri to that Node profile instead of launching another API.
Packaged releases keep Zilobase Cloud (`https://api.zilobase.com`) as the
default.

On macOS, Cargo signs the local debug executable with the first valid Apple
Development identity before launching it. The stable `com.zilobase.debug`
identity prevents rebuilt debug binaries from repeatedly requesting access to
the saved desktop session in Keychain. Set
`ZILOBASE_APPLE_DEVELOPMENT_IDENTITY` to a certificate SHA-1 to select a
specific identity, or `ZILOBASE_SKIP_DEBUG_SIGNING=1` to opt out.

For an end-to-end Compose server, run `npm run selfhost:up` at the repository root.
After the one-time setup page is complete, open the printed
`zilobase://connect?server=http%3A%2F%2F127.0.0.1%3A8787` link or enter
`http://127.0.0.1:8787` under **Change server**. No desktop rebuild or
provider credentials are needed. Stop the stack with `npm run selfhost:down`;
the saved instance and desktop session remain valid after the next start.

## One-time GitHub setup

Add this required Actions secret to `zilobase/zilobase`:

- `TAURI_SIGNING_PRIVATE_KEY`: contents of the updater private key. The current development key is stored locally at `~/.tauri/zilobase.key`; back it up securely because existing installations cannot accept updates signed by a replacement key.

Add these optional secrets to sign and notarize the macOS app with an Apple Developer ID:

- `APPLE_CERTIFICATE`: base64-encoded Developer ID Application `.p12` certificate.
- `APPLE_CERTIFICATE_PASSWORD`: password used when exporting the `.p12` certificate.
- `APPLE_ID`: Apple Developer account email.
- `APPLE_PASSWORD`: app-specific password for that Apple ID.
- `APPLE_TEAM_ID`: Apple Developer Team ID.
- `KEYCHAIN_PASSWORD`: a strong temporary password used for the CI keychain.

The updater key is separate from Apple's Developer ID certificate. The updater key verifies Zilobase update bundles; the Apple certificate signs and notarizes the macOS application.
Without the Apple secrets, the workflow uses the ad-hoc signing identity recommended by Tauri so macOS builds can still be downloaded from GitHub Releases.

To encode the Apple certificate:

```sh
openssl base64 -A -in /path/to/developer-id-application.p12 -out certificate-base64.txt
```

## Publishing

Prepare and push a normal product release:

```sh
npm run release -- 0.0.10
git push origin main
git push origin v0.0.10
```

The release workflow continues to publish the server image, then builds and uploads separate Apple Silicon and Intel macOS installers. When Apple credentials are configured, it also signs and notarizes them. Tauri Action uploads `latest.json` and signed updater archives used by installed desktop apps.

## Local update test

Run the complete update flow without publishing a GitHub release:

```sh
npm run test:update-local
```

The command builds the current version as a disposable baseline, builds the next patch version as a signed update, serves it from `http://127.0.0.1:8123`, and opens the baseline app. Click **Update and restart**, then stop the local server with Control-C.

The test uses `zilobase-update-test` and `com.zilobase.update-test`, so it does not replace the normal Zilobase application. It verifies update discovery, signature validation, installation, and restart; Apple notarization remains part of the GitHub release workflow.

For a local release build, provide the updater signing key:

```sh
export TAURI_SIGNING_PRIVATE_KEY="$HOME/.tauri/zilobase.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=
npm run build --workspace @zilobase/desktop -- --bundles app,dmg
```

## Installed-app diagnostics

Release builds persist privacy-safe native and renderer startup logs. They include
startup milestones, durations, platform metadata, keyring outcomes, session request
status, deep-link registration, and sanitized error types. They do not include auth
tokens, keyring values, cookies, account details, callback query values, or document
content.

Logs are stored in the platform application log directory:

- Linux: `${XDG_DATA_HOME:-$HOME/.local/share}/com.zilobase/logs`
- macOS: `~/Library/Logs/com.zilobase`
- Windows: `%LOCALAPPDATA%/com.zilobase/logs`

When the UI is available, use **Settings → Preferences → Desktop diagnostics** to
open the logs or export an archive. If the app window is blank, run the installed
binary from a terminal:

```sh
zilobase-client --diagnostics
# Or, for a directly downloaded AppImage:
./zilobase-client.AppImage --diagnostics
```

The command does not open the application window. It creates a diagnostics ZIP in
the current directory containing safe system metadata and up to four recent log
files. Set `ZILOBASE_LOG=debug` when launching from a terminal to opt into verbose
diagnostic events; secrets remain excluded by the diagnostic event schema.
