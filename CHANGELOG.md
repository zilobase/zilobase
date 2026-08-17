# Changelog

All notable Zilobase product releases are documented here.

Zilobase uses one product version across the web, server, and desktop apps. Versions stay on `0.x.y` until the self-hosted install, upgrade, auth, data storage, and core note workflows are stable enough for `1.0.0`.

## 0.0.37

### Added

- Desktop now chooses Zilobase Cloud or a hosted server from Change server, then continues sign-in in the system browser.
- Web login still offers Continue with Google with the Google mark.

### Changed

- `npm run dev:desktop` talks to the local API at `http://localhost:3000` and treats Zilobase Cloud as that local instance. Packaged releases still default to live Cloud at `https://api.zilobase.com`.
- Settings change-server signs out onto the server chooser. The reconnect error page does the same when the current instance is down.
- Signed-out desktop now only shows Continue in Browser and Change server. Login and signup happen in the system browser. After continue, the browser stays on `/desktop/connected` instead of `/oauth/complete`. Desktop and browser sessions stay independent.

### Fixed

- Desktop Google sign-in now redirects to Google with the Better Auth state cookie instead of printing `{url, redirect:true}` in the browser.
- Local wrangler no longer rewrites production Cloud requests to localhost when creating OAuth callback URLs.

## 0.0.36

### Changed

- Changing server from Settings now signs out first and opens the login server form, so a new URL or Zilobase Cloud is chosen after the current session is cleared.

## 0.0.35

### Fixed

- Accepted the built-in Zilobase Cloud origins when changing servers. Cloud does not publish `/.well-known/zilobase`, so verifying `api.zilobase.com` or `app.zilobase.com` no longer fails with HTTP 404.

## 0.0.34

### Added

- Added Change server on the desktop reconnect screen so an unreachable instance is not a dead end.
- Added Use Zilobase Cloud when switching away from a custom or self-hosted server.

## 0.0.33

### Changed

- Published Community container images for both amd64 and arm64.

### Fixed

- Stopped the desktop app from staying on "Connecting to Zilobase..." when the server is unreachable. Startup now waits for the first health probe, then opens a saved offline session or shows the reconnect error.

## 0.0.32

### Added

- Added a single-replica Community Helm chart for Kubernetes installs that use operator-managed PostgreSQL and S3-compatible object storage, plus a cluster CI gate for install, restore, and recovery.
- Added Community edition seams so an Enterprise overlay can compile against the MIT core without changing the Community runtime contract.

### Changed

- Documented Helm alongside Docker Compose as a supported self-hosted artifact and recorded the Community Helm cluster and public-release upgrade evidence.
- Hardened Community runtime dependencies and raised the desktop validation heap so release packaging completes reliably.

### Fixed

- Adopted the legacy Drizzle migration journal when upgrading from public `0.0.31` images so existing databases keep their applied migrations and data.
- Waited for restored Community databases to become ready before continuing Helm recovery, and retried MinIO initialization on first boot.
- Stabilized desktop sign-in HTML responses and the login page structure so browser PKCE and the server selector complete against Community instances.
- Kept the worker adapter API runtime-neutral so Community server and Cloud adapter builds stay independent.

## 0.0.31

### Added

- Added the self-hosted instance discovery, compatibility, liveness, and readiness contract, plus a Docker Compose developer workflow with Postgres, MinIO, Mailpit, backup/restore, upgrade, and packaged-desktop validation.
- Added runtime desktop server selection for Cloud, localhost, and public HTTPS instances, including secure connection links and full local-data cleanup when changing servers.
- Added system-browser desktop authorization with PKCE, loopback callbacks, one-time authorization codes, issuer validation, and server-native password, OTP, Google, and SSO login paths.
- Added single-use self-host bootstrap, initial administrator and pinned-workspace setup, and owner-managed invite-only or open registration.
- Added compact Recents navigation and consolidated workspace creation controls in the application sidebar.

### Changed

- Made Docker Compose the canonical self-hosted deployment artifact and added documented local, domain, operations, staging, migration, and release workflows.
- Resolved API, image, collaboration, and realtime endpoints from the selected desktop server instead of compile-time Cloud configuration.

### Fixed

- Fixed desktop authorization consent redirects and callback validation for loopback clients without weakening the page's content security policy.
- Fixed Tauri development builds so selecting a self-hosted server no longer falls back to the compiled Cloud API origin.
- Preserved rapid page-title edits and stabilized desktop tab dragging.
- Repaired self-host CI workflow contexts, backup ownership, and headless keyring initialization so deployment and packaged-desktop gates complete reliably.

### Security

- Scoped desktop credentials to the selected instance, removed compile-time desktop Google credentials, and kept tokens and authorization codes out of deep links and diagnostic logs.
- Made server replacement verify the candidate before revoking the old session and erase the previous keyring credentials, query cache, IndexedDB/Yjs documents, persisted stores, tabs, and session state.

## 0.0.30

### Changed

- Unified desktop tabs with the native titlebar on macOS and Linux, with tabs shrinking to fit and full titles available on hover when truncated.
- Added Command-or-Control tab shortcuts so new-tab and close-tab actions work consistently across desktop platforms.

### Fixed

- Kept Linux window controls, drag regions, sidebar spacing, and page content aligned when a route replaces the fallback titlebar with desktop tabs.

## 0.0.29

### Fixed

- Added the generated Google Desktop client credential required by Google's token endpoint so the native PKCE flow completes after the loopback callback.
- Added release preflight checks for both parts of the desktop OAuth credential and documented their local and CI configuration.

### Security

- Keeps the generated desktop credential out of source control and logs while continuing to use PKCE, per-attempt state, and nonce validation as the protections appropriate to a distributed public client.

## 0.0.28

### Changed

- Replaced the browser-hosted desktop authentication handoff with native Google OAuth using the system browser, PKCE, and an ephemeral loopback callback owned by the running app.
- Kept `zilobase://open` deep links for content navigation while removing authentication deep links, the hosted `/desktop-auth` route, and Better Auth one-time tokens.

### Fixed

- Added explicit waiting, finalizing, cancellation, retry, timeout, provider-denial, server, and keyring failure states so Google sign-in cannot be cleared by window focus or remain on a permanent spinner.
- Made raw Linux AppImage authentication independent from URI-handler registration and aligned macOS and Linux desktop sign-in behavior.

### Security

- Added S256 PKCE, per-attempt state and OpenID nonce validation, bounded loopback HTTP parsing, classified secret-free diagnostics, and immediate removal of authorization codes from the visible browser URL.
- Restricted the native flow to the public Google Desktop client ID; no desktop client secret, Google access token, or Google refresh token is embedded, stored, or forwarded.

## 0.0.27

### Fixed

- Bounded desktop session startup requests so a stalled network response cannot leave the application blank indefinitely.
- Added visible connecting and retry screens for route authentication failures while preserving the saved native-keyring session.
- Added privacy-safe router pending and error diagnostics for blank-window investigations.

## 0.0.26

### Fixed

- Made browser-to-desktop authentication use an explicit user-initiated callback so Linux browsers reliably deliver the one-time token to the running client.
- Reset the desktop Google sign-in state when the app regains focus or the browser handoff times out instead of leaving the login button stuck.
- Added privacy-safe browser-open, focus-return, timeout, and callback diagnostics for desktop authentication support.

## 0.0.25

### Added

- Added persistent, privacy-safe desktop startup diagnostics covering native setup, WebView loading, keyring access, offline restoration, session requests, updater operations, and deep-link authentication.
- Added desktop preferences actions to open logs and export a bounded diagnostics archive, plus `zilobase-client --diagnostics` for blank-window failures.

### Security

- Restricted renderer diagnostics through a native allowlist so authentication tokens, callback URLs, account details, keyring values, and document content cannot be persisted.

## 0.0.24

### Fixed

- Registered the `zilobase://` URL handler at runtime on Linux so browser-based authentication returns reliably to Debian, RPM, and AppImage installations.
- Added privacy-safe diagnostics for desktop deep-link receipt and one-time-token verification without exposing callback tokens.

## 0.0.23

### Fixed

- Installed the explicit `xdg-utils` packaging dependency required by minimal GitHub-hosted Linux ARM64 runners when creating AppImages.

## 0.0.22

### Fixed

- Made Linux AppImage releases resilient to transient GitHub download failures by prefetching Tauri's architecture-specific packaging tools with bounded retries.
- Reused the project-local Tauri tools directory across packaging steps so verified helpers are not downloaded again during the release build.

## 0.0.21

### Added

- Added signed Linux desktop release builds for x64 and ARM64 in both Debian and AppImage formats.
- Added persistent Linux desktop session storage through the system Secret Service and kernel keyring.

### Changed

- Replaced the Linux system title bar with a compact, app-themed window frame that follows Light, Dark, and System appearance settings.
- Added native drag, minimize, maximize, restore, and close behavior without displaying the internal `zilobase-client` title.

### Fixed

- Kept the fixed application sidebar below the Linux window frame so its workspace header no longer renders behind the title bar.
- Synchronized the maximize/restore icon with the actual Linux window state and removed conflicting double-click handling.

## 0.0.20

### Changed

- Matched AI chat history rows to the app sidebar's compact item height, padding, typography, active states, and overflow actions.
- Kept Library navigation exclusive to the app sidebar and replaced its open-book glyph with the stacked-books icon.

## 0.0.19

### Fixed

- Kept page rendering independent from realtime startup by mounting cached or server content first, then preparing Yjs and connecting collaboration after the editor has painted.
- Cancelled deferred collaboration work and ticket requests when navigating between pages, preventing stale connections from racing the active page.
- Hardened hosted Durable Object lifecycle handling for hibernating chat sessions, collaboration refresh grace periods, and database realtime expiry cleanup.

## 0.0.18

### Added

- Added authenticated Yjs collaboration for desktop clients with live page edits, collaborator presence, and cursor awareness across web and desktop.

### Fixed

- Restored editable embedded databases, including database view controls and **New page** actions, for users with edit access.
- Stabilized browser and desktop connectivity detection so health checks and canceled requests no longer cause online/offline loops or repeatedly restart collaboration sockets.
- Negotiated a stable WebSocket protocol while keeping desktop session authentication out of the selected collaboration protocol.

## 0.0.17

### Added

- Published the macOS offline-first release with opt-in workspace storage, durable page editing, read-only databases, and recovery archives.

### Fixed

- Included the Y-ProseMirror runtime dependency required by clean server image builds.

## 0.0.16

### Added

- Added opt-in offline access for macOS workspaces, pages, and read-only databases.
- Added durable offline page editing with IndexedDB-backed Yjs documents and automatic Hocuspocus synchronization after reconnecting.
- Added recovery archive export/import and safeguards that prevent logout or offline-data removal from silently deleting unsynced drafts.

### Changed

- Disabled metadata, comments, database editing, uploads, AI actions, and structural page operations while offline.
- Limited cached desktop access to the matching Keychain account and the existing server-issued session expiry.

## 0.0.15

### Fixed

- Persisted desktop sessions in Apple Keychain instead of the in-memory fallback.
- Prevented local development builds from taking the installed app's single-instance lock.

## 0.0.14

### Fixed

- Recovered browser authentication callbacks when macOS returns focus to the desktop app, so Google sign-in completes reliably.

## 0.0.13

### Fixed

- Exposed the desktop session response header so browser-based Google sign-in completes inside the installed app.

## 0.0.12

### Fixed

- Opened desktop Google sign-in in the system browser and securely returned the authenticated session to the app.
- Routed installed desktop builds to the hosted API and persisted desktop sessions in the operating system keychain.
- Cleared workspace and desktop-tab state when signing out.

## 0.0.11

### Added

- Added an **Open in desktop app** action that preserves the current Zilobase route through a validated desktop deep link.

### Fixed

- Returned successful and cancelled Google sign-in flows to the web app instead of API-hosted pages.
- Shared hosted authentication cookies across the app and API subdomains so Google sessions remain signed in after redirecting.

## 0.0.10

### Added

- Published macOS desktop installers for Apple Silicon and Intel through GitHub Releases.
- Added signed in-app update checks with download, install, and restart support.

### Changed

- Refreshed the desktop app icon, window sizing, title-bar drag regions, and sidebar navigation spacing.

## 0.0.9

### Changed

- Activated desktop tabs when a dragged editor block hovers over them, allowing the block to be dropped into another tab.
- Refined the default primary button color and hover state.

### Fixed

- Opened related sub-items in the current side panel from page metadata.
- Enforced a single parent for database sub-items, removed the legacy row-parent fallback, and repaired existing multi-parent relationships during migration.

## 0.0.8

### Changed

- Strengthened inactive sidebar and database view tab text while preserving active-state emphasis.

### Fixed

- Guarded database section drops into sidepanel pages with explicit move and linked-view choices, preventing circular database hierarchies.
- Persisted linked database placements and retained them beneath favorited database-row pages in sidebar navigation.
- Made GitHub release publication idempotent so reruns update an existing release instead of failing after the image is published.

## 0.0.7

### Changed

- Matched the edited timestamp typography to breadcrumbs and strengthened active database tab text in dark mode.

### Fixed

- Separated database tab and context-menu refs to keep view configuration rerenders stable.
- Stopped chart grouping changes from repeatedly persisting generated colors, preventing request floods and maximum update depth errors.
- Made automatic chart colors deterministic while preserving configured option and persisted colors.

## 0.0.6

### Added

- Added realtime database updates, collaborative page comments, block comments, integration management, and configurable sidebar navigation.
- Added database chart, list, and gallery views, sub-items, cell fill, undo and redo, cross-view row drag and drop, and configurable page layouts and icon positions.

### Changed

- Centralized web color, typography, editor palette, radius, and shadow values in semantic design tokens while preserving the established light and dark palette.
- Refreshed the web component system and normalized navigation, menus, dialogs, forms, sidebars, and database controls.
- Modularized database mutation services, improved server query and persistence performance, and expanded backend quality coverage.

### Fixed

- Improved mobile page routing, sidebar navigation persistence, editor pane interactions, database scrolling, row transfers, and desktop drag-and-drop behavior.
- Synchronized theme initialization and semantic selection and icon colors across web surfaces.

## 0.0.5

### Added

- Added embedded page pane controls for opening pages as full pages, dialogs, or side panels.
- Added row navigation controls for database-backed embedded pages.

### Changed

- Lazy-loaded the AI chatbot UI to reduce initial page weight.

### Fixed

- Kept database table headers visible while scrolling.
- Applied published page owner width preferences for fallback viewers.
- Opened embedded page pane mode menus only on click.

## 0.0.4

### Added

- Added page collaboration runtime support and connected editor collaboration.
- Added gradient avatar fallbacks in the web client.

### Changed

- Bound the hosted web worker to the server service for same-origin API routing.
- Reorganized server runtime and database editor modules.
- Refined database timeline and block drag editor styling.

### Fixed

- Modeled inherited page access in graph permissions.
- Preferred live same-origin API routing in the web client.
- Scoped pooling to the serverful runtime.
- Fixed selection behavior for leading atom blocks.

## 0.0.3

### Changed

- Refined editor slash command menus to use the default command surface.
- Added link conversion choices for typed and pasted editor URLs.
- Moved editor node view styles inline and reduced editor stylesheet size.
- Removed the Canvas button from the topbar.

## 0.0.2

### Added

- Added Basic Autofill entry point and dialog for supported database property types.

### Changed

- Hid Edit property for text, checkbox, email, and phone database properties.

## 0.0.1

### Added

- Initial pre-1.0 product versioning policy.
