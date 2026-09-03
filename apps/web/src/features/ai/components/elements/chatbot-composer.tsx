"use client";

import { toast } from "sonner";
import {
  useCallback,
  type ChangeEvent,
  type Dispatch,
  type KeyboardEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import type { ChatStatus } from "ai";
import type { ContextAttachment } from "@zilobase/page-context";
import type { WorkspaceAiChatModel } from "@zilobase/features/ai-chat";
import { PlusIcon, CheckIcon } from "@/shared/components/icons";
import { getProviderLogoSlug } from "../../model/chat-runtime-model";
import { ContextAttachChips } from "./context-attach-chips";
import {
  ContextAttachMenu,
  type ContextAttachMenuEntry,
  type ContextAttachMenuHandle,
} from "./context-attach-menu";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorLogoGroup,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "./model-selector";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachments,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "./prompt-input";
import {
  AI_FILE_ACCEPT,
  MAX_AI_FILE_BYTES,
  MAX_AI_FILES,
} from "../../lib/ai-file-upload";
import { ChatbotScrollButton } from "./chatbot-scroll-control";

const ModelItem = ({
  m,
  isSelected,
  onSelect,
}: {
  m: WorkspaceAiChatModel;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) => {
  const handleSelect = useCallback(() => {
    onSelect(m.id);
  }, [onSelect, m.id]);

  return (
    <ModelSelectorItem
      onSelect={handleSelect}
      title={m.description}
      value={m.id}
    >
      <ModelSelectorLogo provider={getProviderLogoSlug(m.chefSlug)} />
      <ModelSelectorName>{m.name}</ModelSelectorName>
      <ModelSelectorLogoGroup>
        {m.providers.map((provider) => (
          <ModelSelectorLogo
            key={provider}
            provider={getProviderLogoSlug(provider)}
          />
        ))}
      </ModelSelectorLogoGroup>
      {isSelected ? (
        <CheckIcon className="ml-auto size-4" />
      ) : (
        <div className="ml-auto size-4" />
      )}
    </ModelSelectorItem>
  );
};

type ChatbotComposerProps = {
  activeMentionQuery: string;
  attachments: ContextAttachment[];
  chefs: string[];
  contextError: unknown;
  createThreadPending: boolean;
  currentDatabaseId: string | null;
  currentPageId: string | null;
  existingAttachmentKeys: Set<string>;
  hasMessages: boolean;
  isContextLoading: boolean;
  isSidebar: boolean;
  mentionMenuOpen: boolean;
  mentionMenuRef: RefObject<ContextAttachMenuHandle | null>;
  model: string;
  modelSelectorOpen: boolean;
  models: WorkspaceAiChatModel[];
  onAttachContext: (attachment: ContextAttachment) => void;
  onEntriesChange: Dispatch<SetStateAction<ContextAttachMenuEntry[]>>;
  onModelSelect: (modelId: string) => void;
  onModelSelectorOpenChange: Dispatch<SetStateAction<boolean>>;
  onRemoveAttachment: (attachment: ContextAttachment) => void;
  onRemovePrimary: () => void;
  onStop: () => void;
  onSubmit: (message: PromptInputMessage) => void | Promise<void>;
  onTextChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onTextareaKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  pageContextReady: boolean;
  primaryAttachment: ContextAttachment | null;
  rootRef: RefObject<HTMLDivElement | null>;
  selectedMentionIndex: number;
  selectedModel: WorkspaceAiChatModel | undefined;
  setSelectedMentionIndex: Dispatch<SetStateAction<number>>;
  status: ChatStatus;
  syncTextCursor: () => void;
  text: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

export const ChatbotComposer = ({
  activeMentionQuery,
  attachments,
  chefs,
  contextError,
  createThreadPending,
  currentDatabaseId,
  currentPageId,
  existingAttachmentKeys,
  hasMessages,
  isContextLoading,
  isSidebar,
  mentionMenuOpen,
  mentionMenuRef,
  model,
  modelSelectorOpen,
  models,
  onAttachContext,
  onEntriesChange,
  onModelSelect,
  onModelSelectorOpenChange,
  onRemoveAttachment,
  onRemovePrimary,
  onStop,
  onSubmit,
  onTextChange,
  onTextareaKeyDown,
  pageContextReady,
  primaryAttachment,
  rootRef,
  selectedMentionIndex,
  selectedModel,
  setSelectedMentionIndex,
  status,
  syncTextCursor,
  text,
  textareaRef,
}: ChatbotComposerProps) => (
  <div
    className={
      hasMessages || isSidebar
        ? "sticky bottom-0 z-10 -mx-4 mt-auto grid shrink-0 gap-3 bg-gradient-to-t from-surface-canvas via-effect-backdrop to-transparent px-4 pb-4 pt-16 md:mx-0 md:px-4 md:pb-6 md:pt-20"
        : "z-10 -mx-4 grid shrink-0 gap-3 px-4 pb-4 md:mx-0 md:px-4"
    }
  >
    <ChatbotScrollButton targetRef={rootRef} />
    <div className="mx-auto w-full max-w-3xl">
      {isSidebar ? (
        <div className="mb-2 px-1 text-xs text-content-secondary">
          {isContextLoading
            ? "Loading page context..."
            : contextError
              ? "Page context failed"
              : pageContextReady
                ? "Page context ready"
                : null}
        </div>
      ) : null}
      <PromptInput
        accept={AI_FILE_ACCEPT}
        globalDrop
        inputGroupClassName="h-auto items-stretch overflow-visible focus-within:border-control-border focus-within:ring-0 has-[[data-slot=input-group-control]:focus-visible]:border-control-border has-[[data-slot=input-group-control]:focus-visible]:ring-0"
        maxFileSize={MAX_AI_FILE_BYTES}
        maxFiles={MAX_AI_FILES}
        multiple
        onError={(attachmentError) =>
          toast.error("Cannot attach file", {
            description: attachmentError.message,
          })
        }
        onSubmit={onSubmit}
      >
        <PromptInputAttachments />
        <ContextAttachChips
          attachments={attachments}
          onRemove={onRemoveAttachment}
          onRemovePrimary={onRemovePrimary}
          primaryAttachment={primaryAttachment}
        />
        <div className="relative w-full min-w-0 flex-1 self-stretch">
          {mentionMenuOpen ? (
            <ContextAttachMenu
              currentDatabaseId={currentDatabaseId}
              currentPageId={currentPageId}
              existingAttachmentKeys={existingAttachmentKeys}
              onEntriesChange={onEntriesChange}
              onSelect={onAttachContext}
              open={mentionMenuOpen}
              query={activeMentionQuery}
              ref={mentionMenuRef}
              selectedIndex={selectedMentionIndex}
              setSelectedIndex={setSelectedMentionIndex}
            />
          ) : null}
          <PromptInputTextarea
            className="w-full px-2 focus-visible:border-transparent focus-visible:ring-0"
            onChange={onTextChange}
            onClick={syncTextCursor}
            onKeyDown={onTextareaKeyDown}
            onSelect={syncTextCursor}
            placeholder={
              isSidebar
                ? "Ask AI to update this page, or type @ to add context..."
                : "Ask AI to find, create, or update anything..."
            }
            ref={textareaRef}
            value={text}
          />
        </div>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger tooltip="Attach files">
                <PlusIcon className="size-4" />
              </PromptInputActionMenuTrigger>
              <PromptInputActionMenuContent>
                <PromptInputActionAddAttachments />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
            <ModelSelector
              onOpenChange={onModelSelectorOpenChange}
              open={modelSelectorOpen}
            >
              <ModelSelectorTrigger asChild>
                <PromptInputButton>
                  {selectedModel?.chefSlug ? (
                    <ModelSelectorLogo
                      provider={getProviderLogoSlug(selectedModel.chefSlug)}
                    />
                  ) : null}
                  {selectedModel?.name ? (
                    <ModelSelectorName>{selectedModel.name}</ModelSelectorName>
                  ) : null}
                </PromptInputButton>
              </ModelSelectorTrigger>
              <ModelSelectorContent>
                <ModelSelectorInput placeholder="Search models..." />
                <ModelSelectorList>
                  <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                  {chefs.map((chef) => (
                    <ModelSelectorGroup heading={chef} key={chef}>
                      {models
                        .filter((item) => item.chef === chef)
                        .map((item) => (
                          <ModelItem
                            isSelected={model === item.id}
                            key={item.id}
                            m={item}
                            onSelect={onModelSelect}
                          />
                        ))}
                    </ModelSelectorGroup>
                  ))}
                </ModelSelectorList>
              </ModelSelectorContent>
            </ModelSelector>
          </PromptInputTools>
          <PromptInputSubmit
            onStop={onStop}
            status={createThreadPending ? "submitted" : status}
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  </div>
);
