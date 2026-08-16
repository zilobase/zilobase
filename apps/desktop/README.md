# Zilobase desktop releases

The desktop app checks the latest GitHub release on launch. When a newer signed build is available, it offers to download, install, and restart the app.

## Browser sign-in

Desktop authentication uses the selected Zilobase server's authorization-code
flow with PKCE. The native app opens `/desktop/authorize` in the system browser
and receives the result on an ephemeral loopback address such as
`http://127.0.0.1:43123/oauth/callback`. The browser can use the server's normal
password, email-code, Google, or configured SSO path. Authentication never runs
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

`npm run dev:desktop` starts the local API and points the debug app at
`http://localhost:3000`. Packaged releases keep Zilobase Cloud
(`https://api.zilobase.com`) as the default.

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
