import type { SidebarWorkspaceLayout, SidebarTab, SidebarShortcut } from "./sidebar-config";
export function updateSidebarTab(
  layout: SidebarWorkspaceLayout,
  tabId: string,
  update: (tab: SidebarTab) => SidebarTab,
): SidebarWorkspaceLayout {
  return {
    ...layout,
    tabs: layout.tabs.map((tab) => (tab.id === tabId ? update(tab) : tab)),
  };
}

export function hideUnconfiguredIntegrationTabs(
  layout: SidebarWorkspaceLayout,
  availability: { askAi?: boolean; calendar: boolean },
): SidebarWorkspaceLayout {
  return {
    ...layout,
    tabs: layout.tabs.flatMap((tab) => {
      if (tab.id === "calendar" && !availability.calendar) return [];
      if (tab.id === "ai" && availability.askAi === false) return [];
      return [tab];
    }),
  };
}

export function restoreUnconfiguredIntegrationTabs(
  stored: SidebarWorkspaceLayout,
  next: SidebarWorkspaceLayout,
  availability: { askAi?: boolean; calendar: boolean },
): SidebarWorkspaceLayout {
  const hiddenIds = new Set(
    stored.tabs
      .filter(
        (tab) =>
          (tab.id === "calendar" && !availability.calendar) ||
          (tab.id === "ai" && availability.askAi === false),
      )
      .map((tab) => tab.id),
  );
  if (hiddenIds.size === 0) return next;
  const visible = next.tabs.filter((tab) => !hiddenIds.has(tab.id));
  const tabs = stored.tabs.flatMap((tab) => {
    if (hiddenIds.has(tab.id)) return [tab];
    const updated = visible.find((item) => item.id === tab.id);
    return updated ? [updated] : [];
  });
  for (const tab of visible) {
    if (!tabs.some((item) => item.id === tab.id)) tabs.push(tab);
  }
  return { ...next, tabs };
}

export function moveArrayItem<T>(items: T[], index: number, offset: -1 | 1) {
  const nextIndex = index + offset;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
  return next;
}

export function moveLayoutEntry(
  layout: SidebarWorkspaceLayout,
  sourceTabId: string,
  targetTabId: string,
  entryType: "sections" | "shortcuts",
  entryId: string,
) {
  if (sourceTabId === targetTabId || isStaticTabId(sourceTabId) || isStaticTabId(targetTabId))
    return layout;
  const source = layout.tabs.find((tab) => tab.id === sourceTabId);
  const entry = source?.[entryType].find((item) => item.id === entryId);
  const target = layout.tabs.find((tab) => tab.id === targetTabId);
  if (
    !entry ||
    !target ||
    target[entryType].some((item) => item.id === entryId) ||
    target[entryType].length >= 24
  )
    return layout;

  return {
    ...layout,
    tabs: layout.tabs.map((tab) => {
      if (tab.id === sourceTabId) {
        return { ...tab, [entryType]: tab[entryType].filter((item) => item.id !== entryId) };
      }
      if (tab.id === targetTabId) {
        return { ...tab, [entryType]: [...tab[entryType], entry] };
      }
      return tab;
    }),
  };
}

function isStaticTabId(tabId: string) {
  return tabId === "ai" || tabId === "calendar";
}

export function hasShortcutTarget(tab: SidebarTab, target: SidebarShortcut["target"]) {
  return tab.shortcuts.some(
    (shortcut) => JSON.stringify(shortcut.target) === JSON.stringify(target),
  );
}
