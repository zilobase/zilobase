# Dropdown menu manual testing

The View Settings design is now the shared baseline: overlay background, border/ring,
shadow, concentric rounded corners, 13px rows, 2px vertical row margins, consistent
icons, inset labels and right-aligned selection checks. Menus retain content-specific
widths; menus without an explicit width default to 18rem. Long menus scroll within
the available viewport. Mobile DropDrawer menus retain their larger touch targets.

Most locations below inherit changes through shared components; they do not need
individual source edits. Explicit migrations are the sidebar section options,
View Settings viewport scrolling, database select/status option picker, linked data-source picker, and native
select/status property-value control used by mail and automation controls.

## Page and control checklist

| Page / app area | Controls to open and test |
| --- | --- |
| Every workspace: sidebar | Workspace/server switcher; page and favorite actions; sharing/permissions; offline availability; section options (Sort and Show now open as subpages); sidebar customization, shortcuts, library views, move-to-tab and database pickers. |
| Page editor: header and navigation | Page actions, overflow breadcrumbs, embedded item presentation (inline/peek/full page), page layout database picker and save scope. |
| Page editor: blocks | Drag-handle action menu and nested menus, paste-as choices, code-block language, meeting options. Slash-command suggestions remain unchanged. |
| Page editor: comments | Comment edit/delete menu, discussion filtering. |
| Database: all views | View switcher/actions, View Settings, layout, property visibility, filter, sort, grouping, conditional color, data sources, sub-items, lock placeholder, More settings flyout. |
| Database: property headers | Add property/type picker; name/property actions; number, select, status, URL, relation and rollup settings; option editing and formula controls. |
| Database: cells and page properties | Select, multi-select and status option search, selection, creation and selected checks; property-value select/status control and Empty. |
| Database: data sources | Link existing source, search databases, open views, Back and select a linked view. |
| Database: table | Multi-row selection toolbar menus and bulk property controls. |
| Database: kanban | Group actions and board/group selectors. |
| Database: timeline/Gantt | Setup property selectors, timescale/toolbar options and Gantt interaction menus. |
| Database: forms | Field actions, move/reorder submenus, form options and share menu. |
| Database: automations | Automation actions, trigger/action option lists, property-value controls and Notion action configuration. |
| Library / Recents | Create-agent menu. |
| AI conversations | Chat history actions, prompt-input attachment/options menus, code-block selects. |
| AI agent settings | Agent options, sharing roles, saved instructions, MCP connections and workspace MCP policy selectors. |
| Mail: conversation/message | Message actions, viewer menus and hover-action menus. |
| Mail: View Settings | Group, Filter, Properties, Database panels and their option lists; database-sync selectors and property-value controls. |
| Notifications | Notification center options. |
| Settings: Preferences | Preference selectors. |
| Settings: API keys | Key-related selectors. |
| Settings: workspace | Registration settings, member roles/actions, invitation options and guest actions. |
| Teamspaces | Teamspace list actions, create dialog and management selectors. |
| OAuth consent | Workspace selector. |
| Shared utilities | Icon/emoji and Phosphor picker select controls; time-picker option lists. Their specialized grids remain unchanged. |

For each relevant control:

1. Compare the popup and rows against Database → View Settings in light and dark themes.
2. Check icons, destructive actions, disabled options, selected checks and long labels.
3. Use keyboard arrows, Enter/Space and Escape; verify focus returns to the trigger on close.
4. Open an inline submenu, change a value, open another level, use Back, then close and reopen.
   Reopening must show the root. Inline choices stay open unless explicitly configured to close.
5. In View Settings → Data sources, verify More settings remains a separate flyout.
6. Check long lists and menus near viewport edges for scrolling and clipping.
7. On mobile, check the DropDrawer bottom sheet, subpages and touch targets.

## Deliberate exceptions

Slash commands, mentions, command palette/search results, AI skill suggestions,
date/calendar editors, color grids, emoji/icon grids, rich property/formula editors,
sharing forms, and media/embed configuration popovers keep their specialized content
and interaction patterns. Select/dropdown controls *inside* these surfaces inherit
shared menu styles. Generic Popover and Command components are not globally restyled.
The landing site, console and clipper are separate applications and were not modified.

## Component API

`DropdownMenu defaultSubDisplayMode="inline"` makes submenus replace the parent
menu with a Back/title/Close header. `defaultSubDisplayMode="nested"` (the default)
uses separate Radix flyouts. Each `DropdownMenuSub displayMode="inline" | "nested"`
overrides the root, with `title` supplying its subpage heading. DropDrawer exposes
the same API on desktop and uses subpages on mobile.

`closeOnSelect` on regular, checkbox and radio dropdown items controls dismissal.
Inline items default to staying open; root items default to closing. DropDrawerItem
also forwards this policy to desktop and mobile menus.

Searchable custom pickers use `PopoverContent variant="menu"` for the shared shell
and `menuItemClassName` for rows without replacing their search/multi-select logic.

## Source inventory

Every direct shared-menu consumer found in the web application is listed below.

### Ai

- [features/ai/conversations/components/elements/ai-chat-history-list.tsx](../../apps/web/src/features/ai/conversations/components/elements/ai-chat-history-list.tsx) — dropdrawer
- [features/ai/conversations/components/elements/code-block.tsx](../../apps/web/src/features/ai/conversations/components/elements/code-block.tsx) — select
- [features/ai/conversations/components/elements/prompt-input.tsx](../../apps/web/src/features/ai/conversations/components/elements/prompt-input.tsx) — dropdown-menu, select
- [features/ai/settings/components/agent-settings-page.tsx](../../apps/web/src/features/ai/settings/components/agent-settings-page.tsx) — select
- [features/ai/settings/components/agent-sharing.tsx](../../apps/web/src/features/ai/settings/components/agent-sharing.tsx) — select
- [features/ai/settings/components/mcp-connections.tsx](../../apps/web/src/features/ai/settings/components/mcp-connections.tsx) — select
- [features/ai/settings/components/saved-instruction-picker.tsx](../../apps/web/src/features/ai/settings/components/saved-instruction-picker.tsx) — dropdown-menu
- [features/ai/settings/components/workspace-mcp-policy.tsx](../../apps/web/src/features/ai/settings/components/workspace-mcp-policy.tsx) — select

### Comments

- [features/comments/components/discussions-sidebar.tsx](../../apps/web/src/features/comments/components/discussions-sidebar.tsx) — dropdown-menu
- [features/comments/components/page-comments.tsx](../../apps/web/src/features/comments/components/page-comments.tsx) — dropdown-menu

### Databases

- [features/automations/actions/notion-action-builder.tsx](../../apps/web/src/features/automations/actions/notion-action-builder.tsx) — select
- [features/automations/database-automation-manager.tsx](../../apps/web/src/features/automations/database-automation-manager.tsx) — dropdrawer
- [features/automations/database-automation-screens.tsx](../../apps/web/src/features/automations/database-automation-screens.tsx) — dropdrawer
- [features/automations/definition/automation-select.tsx](../../apps/web/src/features/automations/definition/automation-select.tsx) — select
- [features/databases/schema/configuration/index.tsx](../../apps/web/src/features/databases/schema/configuration/index.tsx) — dropdrawer
- [features/databases/schema/configuration/number/number-property-settings.tsx](../../apps/web/src/features/databases/schema/configuration/number/number-property-settings.tsx) — dropdrawer
- [features/databases/schema/configuration/relation/relation-property-settings.tsx](../../apps/web/src/features/databases/schema/configuration/relation/relation-property-settings.tsx) — dropdrawer
- [features/databases/schema/configuration/rollup/rollup-property-settings.tsx](../../apps/web/src/features/databases/schema/configuration/rollup/rollup-property-settings.tsx) — dropdrawer, select
- [features/databases/schema/configuration/select/select-property-settings.tsx](../../apps/web/src/features/databases/schema/configuration/select/select-property-settings.tsx) — dropdrawer
- [features/databases/schema/configuration/shared/option-editor-submenu.tsx](../../apps/web/src/features/databases/schema/configuration/shared/option-editor-submenu.tsx) — dropdrawer
- [features/databases/schema/configuration/shared/property-setting-submenu.tsx](../../apps/web/src/features/databases/schema/configuration/shared/property-setting-submenu.tsx) — dropdrawer
- [features/databases/schema/configuration/status/status-property-settings.tsx](../../apps/web/src/features/databases/schema/configuration/status/status-property-settings.tsx) — dropdrawer
- [features/databases/schema/configuration/url/url-property-settings.tsx](../../apps/web/src/features/databases/schema/configuration/url/url-property-settings.tsx) — dropdrawer
- [features/databases/schema/editors/add-database-property-menu.tsx](../../apps/web/src/features/databases/schema/editors/add-database-property-menu.tsx) — dropdrawer
- [features/databases/schema/editors/database-name-property-menu.tsx](../../apps/web/src/features/databases/schema/editors/database-name-property-menu.tsx) — dropdrawer
- [features/databases/schema/editors/database-property-menu.tsx](../../apps/web/src/features/databases/schema/editors/database-property-menu.tsx) — dropdrawer
- [features/databases/schema/editors/database-property-select.tsx](../../apps/web/src/features/databases/schema/editors/database-property-select.tsx) — menu popover
- [features/databases/schema/formula/view/database-formula-dialog.tsx](../../apps/web/src/features/databases/schema/formula/view/database-formula-dialog.tsx) — select
- [features/databases/schema/shared/property-type-picker.tsx](../../apps/web/src/features/databases/schema/shared/property-type-picker.tsx) — dropdrawer
- [features/databases/schema/shared/property-value-control.tsx](../../apps/web/src/features/databases/schema/shared/property-value-control.tsx) — select
- [features/databases/views/components/database-condition-editor.tsx](../../apps/web/src/features/databases/views/components/database-condition-editor.tsx) — select
- [features/databases/views/components/database-filter-control.tsx](../../apps/web/src/features/databases/views/components/database-filter-control.tsx) — dropdrawer
- [features/databases/views/components/database-filter-menu.tsx](../../apps/web/src/features/databases/views/components/database-filter-menu.tsx) — dropdrawer
- [features/databases/views/components/database-searchable-menu-items.tsx](../../apps/web/src/features/databases/views/components/database-searchable-menu-items.tsx) — dropdrawer
- [features/databases/views/components/database-sort-control.tsx](../../apps/web/src/features/databases/views/components/database-sort-control.tsx) — dropdrawer
- [features/databases/views/components/database-sort-menu.tsx](../../apps/web/src/features/databases/views/components/database-sort-menu.tsx) — dropdrawer, select
- [features/databases/views/components/database-view-toolbar.tsx](../../apps/web/src/features/databases/views/components/database-view-toolbar.tsx) — dropdrawer
- [features/databases/views/components/linked-data-source-picker.tsx](../../apps/web/src/features/databases/views/components/linked-data-source-picker.tsx) — menu popover
- [features/databases/views/form/components/database-form-share-menu.tsx](../../apps/web/src/features/databases/views/form/components/database-form-share-menu.tsx) — dropdrawer
- [features/databases/views/form/components/database-form-view.tsx](../../apps/web/src/features/databases/views/form/components/database-form-view.tsx) — dropdrawer, select
- [features/databases/views/kanban/components/database-kanban-group-actions.tsx](../../apps/web/src/features/databases/views/kanban/components/database-kanban-group-actions.tsx) — dropdown-menu, select
- [features/databases/views/kanban/components/database-kanban-view.tsx](../../apps/web/src/features/databases/views/kanban/components/database-kanban-view.tsx) — select
- [features/databases/views/table/components/database-table-selection-toolbar.tsx](../../apps/web/src/features/databases/views/table/components/database-table-selection-toolbar.tsx) — dropdrawer
- [features/databases/views/timeline/components/database-timeline-setup.tsx](../../apps/web/src/features/databases/views/timeline/components/database-timeline-setup.tsx) — select
- [features/databases/views/timeline/components/database-timeline-toolbar.tsx](../../apps/web/src/features/databases/views/timeline/components/database-timeline-toolbar.tsx) — select
- [features/databases/views/timeline/gantt/gantt-interactions.tsx](../../apps/web/src/features/databases/views/timeline/gantt/gantt-interactions.tsx) — context-menu
- [features/databases/views/view-settings/components/chart-settings.tsx](../../apps/web/src/features/databases/views/view-settings/components/chart-settings.tsx) — dropdrawer, select
- [features/databases/views/view-settings/components/conditional-color-settings.tsx](../../apps/web/src/features/databases/views/view-settings/components/conditional-color-settings.tsx) — dropdrawer, select
- [features/databases/views/view-settings/components/data-source-items.tsx](../../apps/web/src/features/databases/views/view-settings/components/data-source-items.tsx) — dropdrawer
- [features/databases/views/view-settings/components/data-source-settings.tsx](../../apps/web/src/features/databases/views/view-settings/components/data-source-settings.tsx) — dropdrawer
- [features/databases/views/view-settings/components/index.tsx](../../apps/web/src/features/databases/views/view-settings/components/index.tsx) — dropdrawer
- [features/databases/views/view-settings/components/layout-settings.tsx](../../apps/web/src/features/databases/views/view-settings/components/layout-settings.tsx) — dropdrawer
- [features/databases/views/view-settings/components/sub-items-settings.tsx](../../apps/web/src/features/databases/views/view-settings/components/sub-items-settings.tsx) — dropdrawer

### Editor

- [features/editor/drag-drop/drag-block-menu.tsx](../../apps/web/src/features/editor/drag-drop/drag-block-menu.tsx) — dropdrawer
- [features/editor/extensions/code-block-shiki.tsx](../../apps/web/src/features/editor/extensions/code-block-shiki.tsx) — dropdrawer
- [features/editor/extensions/meeting/meeting-view.tsx](../../apps/web/src/features/editor/extensions/meeting/meeting-view.tsx) — dropdown-menu, dropdrawer
- [features/editor/paste/paste-choice-menu.tsx](../../apps/web/src/features/editor/paste/paste-choice-menu.tsx) — dropdown-menu

### Library

- [features/library/screens/recents.tsx](../../apps/web/src/features/library/screens/recents.tsx) — dropdown-menu

### Mail

- [features/mail/database-sync/mail-database-sync-panel.tsx](../../apps/web/src/features/mail/database-sync/mail-database-sync-panel.tsx) — select
- [features/mail/messages/mail-actions.tsx](../../apps/web/src/features/mail/messages/mail-actions.tsx) — dropdown-menu
- [features/mail/messages/mail-conversation-viewer.tsx](../../apps/web/src/features/mail/messages/mail-conversation-viewer.tsx) — dropdown-menu
- [features/mail/messages/mail-hover-actions-panel.tsx](../../apps/web/src/features/mail/messages/mail-hover-actions-panel.tsx) — dropdrawer, select
- [features/mail/organization/mail-filter-editor.tsx](../../apps/web/src/features/mail/organization/mail-filter-editor.tsx) — dropdrawer, select
- [features/mail/organization/mail-group-editor.tsx](../../apps/web/src/features/mail/organization/mail-group-editor.tsx) — select
- [features/mail/organization/mail-properties-panel.tsx](../../apps/web/src/features/mail/organization/mail-properties-panel.tsx) — dropdrawer
- [features/mail/organization/mail-view-settings-menu.tsx](../../apps/web/src/features/mail/organization/mail-view-settings-menu.tsx) — dropdrawer

### Notifications

- [features/notifications/notification-center.tsx](../../apps/web/src/features/notifications/notification-center.tsx) — dropdrawer

### Oauth

- [features/oauth/screens/consent.tsx](../../apps/web/src/features/oauth/screens/consent.tsx) — select

### Offline

- [features/offline/components/offline-availability-action.tsx](../../apps/web/src/features/offline/components/offline-availability-action.tsx) — dropdrawer

### Pages

- [features/pages/layout/layout-editor.tsx](../../apps/web/src/features/pages/layout/layout-editor.tsx) — dropdown-menu
- [features/pages/pane/embedded-item-presentation-dropdown.tsx](../../apps/web/src/features/pages/pane/embedded-item-presentation-dropdown.tsx) — dropdown-menu
- [features/pages/pane/page-pane-header.tsx](../../apps/web/src/features/pages/pane/page-pane-header.tsx) — dropdown-menu

### Settings

- [features/settings/screens/api-keys.tsx](../../apps/web/src/features/settings/screens/api-keys.tsx) — select
- [features/settings/screens/preferences.tsx](../../apps/web/src/features/settings/screens/preferences.tsx) — select

### Shared Utilities

- [shared/ui/icon-emoji-picker.tsx](../../apps/web/src/shared/ui/icon-emoji-picker.tsx) — dropdown-menu
- [shared/ui/phosphor-icon-picker.tsx](../../apps/web/src/shared/ui/phosphor-icon-picker.tsx) — dropdown-menu
- [shared/ui/time-picker.tsx](../../apps/web/src/shared/ui/time-picker.tsx) — select

### Sidebar

- [features/sidebar/components/item-share-dropdown.tsx](../../apps/web/src/features/sidebar/components/item-share-dropdown.tsx) — select
- [features/sidebar/components/nav-actions.tsx](../../apps/web/src/features/sidebar/components/nav-actions.tsx) — dropdrawer
- [features/sidebar/components/nav-favorites.tsx](../../apps/web/src/features/sidebar/components/nav-favorites.tsx) — dropdrawer
- [features/sidebar/components/nav-pages.tsx](../../apps/web/src/features/sidebar/components/nav-pages.tsx) — dropdrawer
- [features/sidebar/components/sidebar-customize-panel.tsx](../../apps/web/src/features/sidebar/components/sidebar-customize-panel.tsx) — dropdrawer
- [features/sidebar/components/sidebar-section-menu.tsx](../../apps/web/src/features/sidebar/components/sidebar-section-menu.tsx) — dropdown-menu
- [features/sidebar/workspace-switcher.tsx](../../apps/web/src/features/sidebar/workspace-switcher.tsx) — dropdrawer

### Teamspaces

- [features/teamspaces/components/create-teamspace-dialog.tsx](../../apps/web/src/features/teamspaces/components/create-teamspace-dialog.tsx) — select
- [features/teamspaces/components/manage-teamspace-dialog.tsx](../../apps/web/src/features/teamspaces/components/manage-teamspace-dialog.tsx) — select
- [features/teamspaces/screens/teamspaces.tsx](../../apps/web/src/features/teamspaces/screens/teamspaces.tsx) — select

### Workspaces

- [features/workspaces/guests/components/workspace-guests.tsx](../../apps/web/src/features/workspaces/guests/components/workspace-guests.tsx) — select
- [features/workspaces/members/components/member-invitations.tsx](../../apps/web/src/features/workspaces/members/components/member-invitations.tsx) — select
- [features/workspaces/members/components/member-list.tsx](../../apps/web/src/features/workspaces/members/components/member-list.tsx) — select
- [features/workspaces/settings/registration-settings.tsx](../../apps/web/src/features/workspaces/settings/registration-settings.tsx) — select
