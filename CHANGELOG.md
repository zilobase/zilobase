# Changelog

All notable Zilobase product releases are documented here.

Zilobase uses one product version across the web, server, desktop, and mobile apps. Versions stay on `0.x.y` until the self-hosted install, upgrade, auth, data storage, and core note workflows are stable enough for `1.0.0`.

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
