# Zilobase desktop releases

The desktop app checks the latest GitHub release on launch. When a newer signed build is available, it offers to download, install, and restart the app.

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
