import type { EmbeddedItemsOpenAs } from "../pages/item-relationships";
import type { SidebarConfig } from "./sidebar-config";

export type UserSettings = {
  embeddedItemsOpenAs: EmbeddedItemsOpenAs;
  pageFullWidth: boolean;
  sidebarConfig: SidebarConfig;
};
