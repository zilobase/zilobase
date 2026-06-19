import { getDatabaseEmoji } from '@notelab/features/databases';
import { useOrganizations } from '@notelab/features/organizations';
import { useSession } from '@notelab/features/auth';
import {
  getWorkspaceEmoji,
  readLinkedItems,
  readParentItemId,
  useWorkspaces,
  type Workspace,
} from '@notelab/features/workspaces';
import { SymbolView } from 'expo-symbols';
import * as React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TopBarInset } from '@/components/top-bar';
import { Text } from '@/components/ui/text';
import { BottomTabInset, Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { type ThemePalette, useThemedStyles } from '@/hooks/use-app-theme';
import { WEB_APP_BASE_URL } from '@/lib/api-base-url';
import { useMobileViewer } from '@/providers/mobile-viewer-provider';

type Palette = ThemePalette;
const LIST_GAP = 12;
const LEADING_SLOT = 24;
const NESTED_INDENT = LIST_GAP * 2.5;

type TreeItem = {
  id: string;
  label: string;
  emoji: string | null;
  icon: 'page' | 'page-filled' | 'database';
  children: TreeItem[];
  section: 'private' | 'teamspace';
  targetPath: string;
};

export default function HomeScreen() {
  const { palette, styles } = useThemedStyles(createStyles);
  const { openItem } = useMobileViewer();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const { data: organizations = [], isPending: isOrganizationsPending } = useOrganizations();
  const activeOrganizationId = session.data?.session?.activeOrganizationId ?? null;
  const organizationId =
    organizations.find((organization) => organization.id === activeOrganizationId)?.id ??
    organizations[0]?.id ??
    null;
  const { data: workspaces = [], isPending: isWorkspacesPending } = useWorkspaces(organizationId);
  const sections = React.useMemo(() => buildWorkspaceSections(workspaces), [workspaces]);
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());

  const toggleExpanded = React.useCallback((id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }, []);

  const contentContainerStyle = React.useMemo(
    () => ({
      paddingTop: TopBarInset + Spacing.two,
      paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
      paddingHorizontal: Spacing.four,
    }),
    [insets.bottom]
  );

  const isLoading = session.isPending || isOrganizationsPending || isWorkspacesPending;
  const hasItems = sections.privateItems.length > 0 || sections.teamspaceItems.length > 0;

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: palette.background }]}
      contentInset={{ top: 0, bottom: 0, left: 0, right: 0 }}
      contentContainerStyle={[styles.contentContainer, contentContainerStyle]}>
      <View style={styles.container}>
        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={palette.foreground} />
            <Text style={styles.loadingText}>Loading your workspace tree...</Text>
          </View>
        ) : hasItems ? (
          <View style={styles.sections}>
            <TreeSection
              expandedIds={expandedIds}
              items={sections.privateItems}
              onOpenItem={openItem}
              onToggleExpanded={toggleExpanded}
              palette={palette}
              sectionLabel="Private"
              styles={styles}
            />
            <TreeSection
              expandedIds={expandedIds}
              items={sections.teamspaceItems}
              onOpenItem={openItem}
              onToggleExpanded={toggleExpanded}
              palette={palette}
              sectionLabel="Teamspaces"
              styles={styles}
            />
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text variant="h4" style={styles.emptyTitle}>
              No pages yet
            </Text>
            <Text style={styles.emptyText}>
              Create a workspace page on web or from another device, then it will appear here with
              the same emoji and nesting structure.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function TreeSection({
  expandedIds,
  items,
  onOpenItem,
  onToggleExpanded,
  palette,
  sectionLabel,
  styles,
}: {
  expandedIds: Set<string>;
  items: TreeItem[];
  onOpenItem: (item: { id: string; title: string; url: string }) => void;
  onToggleExpanded: (id: string) => void;
  palette: Palette;
  sectionLabel: string;
  styles: ReturnType<typeof createStyles>;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionEyebrow}>{sectionLabel}</Text>
        <Text style={styles.sectionMeta}>
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </Text>
      </View>

      <View style={styles.sectionList}>
        {items.map((item) => (
          <TreeRow
            key={item.id}
            expandedIds={expandedIds}
            item={item}
            onOpenItem={onOpenItem}
            onToggleExpanded={onToggleExpanded}
            palette={palette}
            styles={styles}
          />
        ))}
      </View>
    </View>
  );
}

function TreeRow({
  expandedIds,
  item,
  onOpenItem,
  onToggleExpanded,
  palette,
  styles,
}: {
  expandedIds: Set<string>;
  item: TreeItem;
  onOpenItem: (item: { id: string; title: string; url: string }) => void;
  onToggleExpanded: (id: string) => void;
  palette: Palette;
  styles: ReturnType<typeof createStyles>;
}) {
  const isExpanded = expandedIds.has(item.id);
  const hasChildren = item.children.length > 0;

  return (
    <View>
      <View style={styles.row}>
        {hasChildren ? (
          <Pressable
            hitSlop={8}
            onPress={() => onToggleExpanded(item.id)}
            style={({ pressed }) => [styles.chevronButtonLeft, pressed && styles.pressedButton]}>
            <SymbolView
              name={
                isExpanded
                  ? { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }
                  : { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }
              }
              size={16}
              tintColor={palette.mutedForeground}
            />
          </Pressable>
        ) : (
          <View style={styles.leadingIcon}>
            {item.emoji ? (
              <Text style={styles.emoji}>{item.emoji}</Text>
            ) : (
              <SymbolView
                name={getItemSymbol(item.icon)}
                size={18}
                tintColor={palette.mutedForeground}
              />
            )}
          </View>
        )}

        {hasChildren ? (
          <View style={styles.leadingIcon}>
            {item.emoji ? (
              <Text style={styles.emoji}>{item.emoji}</Text>
            ) : (
              <SymbolView
                name={getItemSymbol(item.icon)}
                size={18}
                tintColor={palette.mutedForeground}
              />
            )}
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [styles.rowMainPressable, pressed && styles.pressedButton]}
          onPress={() =>
            onOpenItem({
              id: item.id,
              title: item.label,
              url: resolveWorkspaceItemUrl(item.targetPath),
            })
          }>
          <Text style={styles.rowTitle}>{item.label}</Text>
        </Pressable>
      </View>

      {hasChildren && isExpanded ? (
        <View style={styles.children}>
          {item.children.map((child) => (
            <TreeRow
              key={child.id}
              expandedIds={expandedIds}
              item={child}
              onOpenItem={onOpenItem}
              onToggleExpanded={onToggleExpanded}
              palette={palette}
              styles={styles}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function buildWorkspaceSections(workspaces: Workspace[]) {
  const orderedWorkspaces = [...workspaces].sort(
    (first, second) => getWorkspaceCreatedTime(first) - getWorkspaceCreatedTime(second)
  );
  const nodesById = new Map(
    orderedWorkspaces.map((workspace) => [
      workspace.id,
      {
        id: workspace.id,
        label: workspace.name,
        emoji: getWorkspaceEmoji(workspace),
        icon: 'page' as const,
        children: [] as TreeItem[],
        section: workspace.isTeamspace ? ('teamspace' as const) : ('private' as const),
        targetPath: `/workspace/${workspace.id}`,
      },
    ])
  );
  const roots: TreeItem[] = [];
  const databaseNodesById = new Map<string, TreeItem>();
  const rowPageIds = new Set(
    orderedWorkspaces.flatMap((workspace) =>
      (workspace.databases ?? []).flatMap((database) => database.rows.map((row) => row.pageId))
    )
  );

  for (const workspace of orderedWorkspaces) {
    const parentNode = nodesById.get(workspace.id);

    if (!parentNode) {
      continue;
    }

    for (const database of workspace.databases ?? []) {
      const databaseNode: TreeItem = {
        id: `database:${database.id}`,
        label: database.name,
        emoji: getDatabaseEmoji(database),
        icon: 'database',
        children: [],
        section: parentNode.section,
        targetPath: `/database/${database.id}`,
      };

      databaseNodesById.set(database.id, databaseNode);

      for (const row of [...database.rows].sort((first, second) => first.position - second.position)) {
        const rowNode = nodesById.get(row.pageId);

        if (rowNode && rowNode.id !== parentNode.id) {
          databaseNode.children.push(rowNode);
        }
      }

      parentNode.children.push(databaseNode);
    }
  }

  for (const workspace of orderedWorkspaces) {
    const node = nodesById.get(workspace.id);

    if (!node) {
      continue;
    }

    const parentItemId = readParentItemId(workspace.metadata);
    const parent = parentItemId ? nodesById.get(parentItemId) : null;

    if (rowPageIds.has(workspace.id)) {
      continue;
    }

    if (parent && parent.id !== node.id) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  for (const workspace of orderedWorkspaces) {
    const node = nodesById.get(workspace.id);

    if (!node) {
      continue;
    }

    const existingChildIds = new Set(node.children.map((page) => page.id));

    for (const linkedItem of readLinkedItems(workspace.metadata)) {
      if (linkedItem.kind === 'workspace') {
        const linkedPage = nodesById.get(linkedItem.id);

        if (!linkedPage || linkedPage.id === node.id || existingChildIds.has(linkedPage.id)) {
          continue;
        }

        node.children.push(cloneLinkedTreeNode(linkedPage, new Set([node.id])));
        existingChildIds.add(linkedPage.id);
        continue;
      }

      const linkedDatabase = databaseNodesById.get(linkedItem.id);

      if (!linkedDatabase || existingChildIds.has(linkedDatabase.id)) {
        continue;
      }

      node.children.push(cloneLinkedTreeNode(linkedDatabase, new Set([node.id])));
      existingChildIds.add(linkedDatabase.id);
    }
  }

  const privateItems = roots.filter((item) => item.section === 'private');
  const teamspaceItems = roots.filter((item) => item.section === 'teamspace');

  return { privateItems, teamspaceItems };
}

function cloneLinkedTreeNode(node: TreeItem, visitedIds: Set<string>): TreeItem {
  if (visitedIds.has(node.id)) {
    return { ...node, children: [] };
  }

  const nextVisitedIds = new Set(visitedIds);
  nextVisitedIds.add(node.id);

  return {
    ...node,
    children: node.children.map((child) => cloneLinkedTreeNode(child, nextVisitedIds)),
  };
}

function getWorkspaceCreatedTime(workspace: Workspace) {
  const time = new Date(workspace.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getItemSymbol(icon: TreeItem['icon']): React.ComponentProps<typeof SymbolView>['name'] {
  if (icon === 'database') {
    return { ios: 'tablecells', android: 'database', web: 'database' };
  }

  if (icon === 'page-filled') {
    return { ios: 'doc.text', android: 'description', web: 'description' };
  }

  return { ios: 'doc', android: 'insert_drive_file', web: 'insert_drive_file' };
}

function resolveWorkspaceItemUrl(targetPath: string) {
  const url = new URL(targetPath, WEB_APP_BASE_URL);
  url.searchParams.set('mobileViewer', '1');
  return url.toString();
}

function createStyles(palette: Palette, isDark: boolean) {
  return StyleSheet.create({
    scrollView: {
      flex: 1,
    },
    contentContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
    },
    container: {
      flexGrow: 1,
      maxWidth: MaxContentWidth,
      gap: Spacing.five,
    },
    loadingState: {
      paddingHorizontal: Spacing.one,
      paddingVertical: Spacing.four,
      gap: Spacing.three,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingText: {
      color: palette.mutedForeground,
      textAlign: 'center',
    },
    sections: {
      gap: Spacing.four,
    },
    section: {
      gap: Spacing.two,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.one,
    },
    sectionEyebrow: {
      fontSize: 13,
      lineHeight: 18,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: palette.mutedForeground,
      fontWeight: '700',
    },
    sectionMeta: {
      fontSize: 14,
      lineHeight: 20,
      color: palette.mutedForeground,
    },
    sectionList: {
      gap: Spacing.one,
    },
    row: {
      minHeight: 46,
      paddingLeft: LIST_GAP,
      paddingRight: LIST_GAP,
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'transparent',
      gap: LIST_GAP,
      paddingVertical: 8,
    },
    chevronButtonLeft: {
      width: LEADING_SLOT,
      height: LEADING_SLOT,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    leadingIcon: {
      width: LEADING_SLOT,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emoji: {
      fontSize: 18,
      lineHeight: 20,
    },
    rowTextBlock: {
      flex: 1,
      minWidth: 0,
    },
    rowMainPressable: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
      paddingVertical: 2,
    },
    rowTitle: {
      color: palette.foreground,
      fontSize: 15,
      lineHeight: 18,
      fontWeight: '600',
      fontFamily: Fonts.sans,
    },
    pressedButton: {
      opacity: 0.72,
    },
    children: {
      paddingTop: Spacing.one,
      paddingLeft: NESTED_INDENT,
      gap: Spacing.one,
    },
    emptyState: {
      paddingHorizontal: Spacing.one,
      paddingVertical: Spacing.four,
      gap: Spacing.three,
    },
    emptyTitle: {
      textAlign: 'left',
    },
    emptyText: {
      color: palette.mutedForeground,
      fontSize: 15,
      lineHeight: 23,
      maxWidth: 520,
    },
  });
}
