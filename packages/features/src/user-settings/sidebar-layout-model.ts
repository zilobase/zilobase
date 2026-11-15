import type {
  SidebarSection,
  SidebarShortcut,
  SidebarTab,
  SidebarWorkspaceLayout,
} from "./sidebar-config";
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

type SidebarAvailability = { askAi?: boolean; calendar: boolean; tasks?: boolean };

function isHiddenTab(tab: SidebarTab, availability: SidebarAvailability) {
  return (
    (tab.id === "calendar" && !availability.calendar) ||
    (tab.id === "ai" && availability.askAi === false)
  );
}

function isHiddenShortcut(shortcut: SidebarShortcut, availability: SidebarAvailability) {
  return (
    availability.tasks === false &&
    shortcut.target.type === "route" &&
    shortcut.target.route === "tasks"
  );
}

function isHiddenSection(section: SidebarSection, availability: SidebarAvailability) {
  return availability.tasks === false && section.kind === "tasks";
}

function restoreHiddenEntries<T extends { id: string }>(
  stored: T[],
  next: T[],
  isHidden: (entry: T) => boolean,
) {
  const entries = [...next];
  stored.forEach((entry, index) => {
    if (isHidden(entry) && !entries.some((item) => item.id === entry.id)) {
      entries.splice(Math.min(index, entries.length), 0, entry);
    }
  });
  return entries;
}

export function hideUnconfiguredIntegrationTabs(
  layout: SidebarWorkspaceLayout,
  availability: SidebarAvailability,
): SidebarWorkspaceLayout {
  return {
    ...layout,
    tabs: layout.tabs.flatMap((tab) =>
      isHiddenTab(tab, availability)
        ? []
        : [
            {
              ...tab,
              sections: tab.sections.filter((section) => !isHiddenSection(section, availability)),
              shortcuts: tab.shortcuts.filter(
                (shortcut) => !isHiddenShortcut(shortcut, availability),
              ),
            },
          ],
    ),
  };
}

export function restoreUnconfiguredIntegrationTabs(
  stored: SidebarWorkspaceLayout,
  next: SidebarWorkspaceLayout,
  availability: SidebarAvailability,
): SidebarWorkspaceLayout {
  const hiddenIds = new Set(
    stored.tabs.filter((tab) => isHiddenTab(tab, availability)).map((tab) => tab.id),
  );
  const visible = next.tabs.filter((tab) => !hiddenIds.has(tab.id));
  const tabs =
    hiddenIds.size === 0
      ? [...next.tabs]
      : stored.tabs.flatMap((tab) => {
          if (hiddenIds.has(tab.id)) return [tab];
          const updated = visible.find((item) => item.id === tab.id);
          return updated ? [updated] : [];
        });
  for (const tab of visible) {
    if (!tabs.some((item) => item.id === tab.id)) tabs.push(tab);
  }
  return {
    ...next,
    tabs: tabs.map((tab) => {
      const storedTab = stored.tabs.find((item) => item.id === tab.id);
      if (!storedTab || hiddenIds.has(tab.id)) return tab;
      return {
        ...tab,
        sections: restoreHiddenEntries(storedTab.sections, tab.sections, (section) =>
          isHiddenSection(section, availability),
        ),
        shortcuts: restoreHiddenEntries(storedTab.shortcuts, tab.shortcuts, (shortcut) =>
          isHiddenShortcut(shortcut, availability),
        ),
      };
    }),
  };
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
