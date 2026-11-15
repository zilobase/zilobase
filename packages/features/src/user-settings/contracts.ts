import type { EmbeddedItemsOpenAs } from "../pages/item-relationships";
import type { SidebarConfig } from "./sidebar-config";

export type UserSettings = {
  embeddedItemsOpenAs: EmbeddedItemsOpenAs;
  pageFullWidth: boolean;
  sidebarConfig: SidebarConfig;
  /** Workspace ID → the page Ask AI follows as the user's instructions. */
  aiInstructionPages?: Record<string, string>;
};
