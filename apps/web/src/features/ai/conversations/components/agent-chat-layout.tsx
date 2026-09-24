import "../../agent-interface.css";
import type { ReactNode } from "react";
import { defaultUserSettings } from "@zilobase/features/user-settings";
import { useUserSettings } from "@zilobase/features/user-settings/react";
export function AgentChatLayout({
  children,
  sidebar = false,
}: {
  children: ReactNode;
  sidebar?: boolean;
}) {
  const { data: settings = defaultUserSettings } = useUserSettings();
  return (
    <div
      data-agent-chat-layout={sidebar ? "sidebar" : settings.pageFullWidth ? "full" : "page"}
      className={
        sidebar
          ? "w-full shrink-0"
          : `mx-auto flex w-full shrink-0 flex-col agent-chat-content ${settings.pageFullWidth ? "" : "max-w-[900px]"}`
      }
    >
      {children}
    </div>
  );
}
