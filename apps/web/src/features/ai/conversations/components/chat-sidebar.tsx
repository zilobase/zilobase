"use client";

import { AgentChatWorkspace } from "./agent-chat-workspace";
export type ChatPresentationMode = "floating" | "sidebar";

export function ChatSidebarPanel({
  databaseId,
  onClose,
  onPresentationModeChange,
  open = true,
  pageId,
  presentationMode = "sidebar",
}: {
  databaseId?: string | null;
  onClose: () => void;
  onPresentationModeChange?: (mode: ChatPresentationMode) => void;
  open?: boolean;
  pageId?: string | null;
  presentationMode?: ChatPresentationMode;
}) {
  return (
    <AgentChatWorkspace
      databaseId={databaseId}
      isSidebar
      onClose={onClose}
      onPresentationModeChange={onPresentationModeChange}
      open={open}
      pageId={pageId}
      presentationMode={presentationMode}
    />
  );
}
