# Web runtime

## Interface and flow

Feature providers supply the shared client with authentication and request behavior. The request implementation lives under platform/network for both browser and desktop callers. It resolves origins, adds credentials, handles timeouts and applies hosted-demo behavior.

Start at the [entrypoint](../../apps/web/src/app/providers/features-provider.tsx); follow the [implementation](../../apps/web/src/platform/network/api.ts) and [connectivity](../../apps/web/src/platform/network/connectivity.ts).

## Invariants and failure handling

Features receive the provider interface; routing and provider ordering belong to app composition. Desktop server replacement also clears query and indexed-cache state, so changing this ordering can leak data between servers.

## Verification

See [tests or test configuration](../../apps/web/test/shared/api.test.mjs) and [testing and quality](../setup/testing-and-quality.md). [Architecture index](../README.md).

Transport, runtime detection, server-origin resolution, credentials and diagnostics live under [platform](../../apps/web/src/platform). Desktop feature entrypoints temporarily re-export the existing interface. [Application request composition](../../apps/web/src/app/runtime/configure-requests.ts) installs demo policy before startup. The transport captures one policy per request; interception runs before network checks, observations run only after transport outcomes, and overlays run after successful response parsing. Timeouts and cancellation bypass connectivity failure handling. Platform code imports no feature implementations.

## Shared menu presentation

[Menu styles](../../apps/web/src/shared/ui/menu-styles.ts) owns the View Settings
visual baseline for [dropdown menus](../../apps/web/src/shared/ui/dropdown-menu.tsx),
[context menus](../../apps/web/src/shared/ui/context-menu.tsx) and
[select lists](../../apps/web/src/shared/ui/select.tsx). Feature-specific widths and
rich content remain caller-owned. [Popover](../../apps/web/src/shared/ui/popover.tsx)
opts searchable custom pickers into the same shell with `variant="menu"`; generic
popovers and editor command/suggestion surfaces retain their own presentation.

DropdownMenu exposes `defaultSubDisplayMode` at the root and `displayMode` on each
Sub: `inline` navigates within the popup, while `nested` preserves Radix flyouts.
Separate flyouts render in portals so scrolling parent menus cannot clip them.
Inline panels have Back/title/Close controls and reset on dismissal. Regular,
checkbox and radio items expose `closeOnSelect`, defaulting to persistence inside
inline panels and dismissal at the root. [DropDrawer](../../apps/web/src/shared/ui/dropdrawer.tsx)
adapts these menus to mobile drawers with larger touch targets and subpages.
The [manual checklist](../../docs/testing/dropdown-menus.md) maps consumers to
application areas. Navigation behavior is covered by
[dropdown tests](../../apps/web/test/shared/dropdown-navigation.test.mjs).

## Shared button-group presentation

[Button](../../apps/web/src/shared/ui/button.tsx) exposes a `selected` variant for
persistent neutral selection styling. Database filter and sort pills use this
shared variant rather than styling button internals in the feature.

[ButtonGroup](../../apps/web/src/shared/ui/button-group.tsx) owns connected,
floating, plain and selection-toolbar geometry. Width and density are component
props; grouped actions use `ButtonGroupItem`, nested action runs use
`ButtonGroupSection`, and labels use the `ButtonGroupText` variants. Features may
still position a group, but must not recreate its border, surface, radius,
separator or joined-button behavior in feature CSS. The editor selection toolbar,
mobile editor actions, database bulk-selection toolbar, calendar actions, cover
controls and AI branch controls all consume this contract. Its variant coverage is
in the [button-group tests](../../apps/web/test/shared/button-group.test.mjs).

## Shared tab presentation

[App tabs](../../apps/web/src/shared/ui/app-tabs.tsx) owns tab-list geometry,
active and hover states, trigger sizing, overflow behavior and count badges. The
Share dialog is the canonical default presentation. Consumers choose layout with
`gap`, `width`, `align`, `overflow` and trigger `width` props; feature-level tab
borders, square-corner overrides and duplicated badge classes are not supported.
This keeps dialogs, sidebars, database views, editor pickers and settings screens
on one visual contract. Coverage lives in the
[tabs design-system tests](../../apps/web/test/shared/tabs-design-system.test.mjs).

## Calendar and the right dock

[App layout](../../apps/web/src/app/shell/content/app-layout.tsx) installs the
Calendar workspace provider and arbitrates Calendar versus AI visibility.
[Right sidebars](../../apps/web/src/app/shell/side-panel/right-sidebars.tsx) accepts
Calendar content as a primary panel and applies existing sizing, transitions,
resizing and mobile presentation. Calendar owns its event editor and portals it
through a stable target; the shell does not own event data or mutation logic.
Hidden Calendar content remains mounted and inert so temporary AI use preserves
drafts. AI's saved sidebar/floating preference is independent of this visibility.
