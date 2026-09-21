import type { ReactNode } from "react";
import type { UIMessage } from "ai";
import type { AiChatFeedback } from "@zilobase/features/ai-chat";
import type { PromptInputMessage } from "./components/elements/prompt-input";

export type PendingInitialChatSubmission = {
  body: Record<string, unknown>;
  message: {
    files: PromptInputMessage["files"];
    text: string;
  };
  threadId: string;
};

export type ChatbotProps = {
  beforeComposer?: ReactNode;
  databaseId?: string | null;
  isSidebar?: boolean;
  onDraftDirtyChange?: (dirty: boolean) => void;
  onInitialSubmissionConsumed?: () => void;
  onInitialSubmissionPrepared?: (
    submission: PendingInitialChatSubmission,
  ) => void;
  onThreadCreated?: (threadId: string) => void;
  pendingInitialSubmission?: PendingInitialChatSubmission | null;
  threadId: string | null;
  pageId?: string | null;
};

export type ChatbotConversationInput = ChatbotProps & {
  initialFeedback: AiChatFeedback[];
  initialMessages: UIMessage[];
};
