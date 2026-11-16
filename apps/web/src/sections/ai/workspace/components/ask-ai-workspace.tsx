"use client";

import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import { useSession } from "@zilobase/features/auth/react";
import { lazy, Suspense, type ReactNode } from "react";
import {
  ChevronsRightIcon,
  PictureInPicture2Icon,
  SidebarSimpleRightIcon,
  XIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { PageSidePaneLayout } from "@/sections/pages/presentation/components/page-side-pane";

import type { ChatPresentationMode } from "./chat-sidebar";

const Chatbot = lazy(() => import("../../chat/components/chatbot"));

export function AskAiWorkspace({
  pageId,
  databaseId,
  externalSidePane = null,
  externalSidePaneOpen = false,
  externalSidePaneVisible = false,
  isSidebar = false,
  onClose,
  onPresentationModeChange,
  presentationMode = "sidebar",
}: {
  databaseId?: string | null;
  externalSidePane?: ReactNode | null;
  externalSidePaneOpen?: boolean;
  externalSidePaneVisible?: boolean;
  isSidebar?: boolean;
  onClose?: () => void;
  onPresentationModeChange?: (mode: ChatPresentationMode) => void;
  open?: boolean;
  pageId?: string | null;
  presentationMode?: ChatPresentationMode;
}) {
  const workspaceId = useActiveWorkspaceId() ?? null;
  const { data: session } = useSession();
  const chat = (
    <Suspense fallback={<LoadingChat />}>
      <Chatbot
        key={`${session?.session?.id}:${workspaceId}`}
        isSidebar={isSidebar}
        workspaceId={workspaceId}
        pageId={pageId}
        databaseId={databaseId}
      />
    </Suspense>
  );

  const main = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-canvas">
      {isSidebar ? (
        <ChatHeader
          onClose={onClose}
          onPresentationModeChange={onPresentationModeChange}
          presentationMode={presentationMode}
        />
      ) : null}
      <div
        className={
          isSidebar
            ? "min-h-0 flex-1 overflow-hidden px-4 py-4"
            : "min-h-0 flex-1 overflow-hidden pb-5"
        }
        data-ai-workspace-shell
      >
        <div className="h-full min-h-0">{chat}</div>
      </div>
    </div>
  );

  if (isSidebar) return main;
  return (
    <PageSidePaneLayout
      main={main}
      mainScrollClassName="overscroll-y-none"
      sidePane={externalSidePane}
      sidePaneOpen={externalSidePaneOpen}
      sidePaneVisible={externalSidePaneVisible}
    />
  );
}

function ChatHeader({
  onClose,
  onPresentationModeChange,
  presentationMode,
}: {
  onClose?: () => void;
  onPresentationModeChange?: (mode: ChatPresentationMode) => void;
  presentationMode: ChatPresentationMode;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      {onClose ? (
        <Button
          aria-label="Close Ask AI"
          onClick={onClose}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {presentationMode === "floating" ? <XIcon /> : <ChevronsRightIcon />}
        </Button>
      ) : null}
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-heading text-sm font-medium">Ask AI</h2>
      </div>
      {onPresentationModeChange ? (
        <Button
          aria-label={
            presentationMode === "sidebar" ? "Switch to floating chat" : "Dock chat in sidebar"
          }
          onClick={() =>
            onPresentationModeChange(presentationMode === "sidebar" ? "floating" : "sidebar")
          }
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {presentationMode === "sidebar" ? (
            <PictureInPicture2Icon className="size-4" />
          ) : (
            <SidebarSimpleRightIcon className="size-4" />
          )}
        </Button>
      ) : null}
    </header>
  );
}

function LoadingChat() {
  return (
    <div className="flex h-full min-h-40 items-center justify-center text-sm text-content-secondary">
      Loading chat…
    </div>
  );
}
