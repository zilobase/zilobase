import { useLocation, useNavigate } from "@tanstack/react-router";
import type { SidebarShortcut } from "@zilobase/features/user-settings";

import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/shared/ui/sidebar";
import { SidebarShortcutIcon } from "./sidebar-layout-icons";
import { getShortcutLabel, isShortcutActive } from "../model/sidebar-layout-model";

export function SidebarShortcutList({
  databases,
  onCreateChat,
  onCreateDatabase,
  onCreatePage,
  onOpenSettings,
  pages,
  settingsOpen,
  shortcuts,
}: {
  databases: Array<{ id: string; name: string; views: Array<{ id: string }> }>;
  onCreateChat: () => Promise<void>;
  onCreateDatabase: () => Promise<void>;
  onCreatePage: () => Promise<void>;
  onOpenSettings?: () => void;
  pages: Array<{ id: string; name: string }>;
  settingsOpen: boolean;
  shortcuts: SidebarShortcut[];
}) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <SidebarGroup className="pb-1">
      <SidebarGroupContent>
        <SidebarMenu aria-label="Shortcuts">
          {shortcuts.map((shortcut) => {
            const target = shortcut.target;
            const page =
              target.type === "page"
                ? pages.find((entry) => entry.id === target.pageId)
                : null;
            const database =
              target.type === "database"
                ? databases.find((entry) => entry.id === target.databaseId)
                : null;
            if (
              (target.type === "page" && !page) ||
              (target.type === "database" && !database)
            ) {
              return null;
            }

            const label =
              shortcut.label ||
              page?.name ||
              database?.name ||
              getShortcutLabel(shortcut);
            const activate = () => {
              if (target.type === "action") {
                if (target.action === "createPage") void onCreatePage();
                else if (target.action === "createDatabase")
                  void onCreateDatabase();
                else void onCreateChat();
              } else if (target.type === "page") {
                void navigate({ params: { pageId: target.pageId }, to: "/p/$pageId" });
              } else if (target.type === "database") {
                void navigate({
                  params: { databaseId: target.databaseId },
                  search: { view: target.viewId },
                  to: "/d/$databaseId",
                });
              } else if (target.type === "library") {
                void navigate({ search: { view: target.view }, to: "/recents" });
              } else if (target.route === "meetings") {
                void navigate({ search: { view: "meetings" }, to: "/recents" });
              } else if (target.route === "settings") {
                onOpenSettings?.();
              } else {
                void navigate({
                  to:
                    target.route === "ai"
                      ? "/ai"
                      : target.route === "tasks"
                        ? "/tasks"
                        : "/trash",
                });
              }
            };

            return (
              <SidebarMenuItem key={shortcut.id}>
                <SidebarMenuButton
                  isActive={isShortcutActive(
                    shortcut,
                    location.pathname,
                    location.search,
                    settingsOpen,
                  )}
                  onClick={activate}
                  type="button"
                >
                  <SidebarShortcutIcon shortcut={shortcut} />
                  <span>{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
