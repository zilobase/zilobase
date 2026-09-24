import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ContextAttachment } from "@zilobase/page-context";
import {
  getAttachmentKey,
  parseMentionState,
  type ContextAttachMenuEntry,
  type ContextAttachMenuHandle,
} from "./components/elements/context-attach-menu";
import { removeDraftMention } from "./model/conversation-draft";
import { useConversationContext } from "./use-conversation-context";

export function useConversationDraft({
  workspaceId,
  isSidebar,
  pageId,
  databaseId,
}: {
  workspaceId: string | null;
  isSidebar: boolean;
  pageId: string | null;
  databaseId: string | null;
}) {
  const [text, setText] = useState<string>("");
  const [textCursor, setTextCursor] = useState(0);
  const [attachments, setAttachments] = useState<ContextAttachment[]>([]);
  const [primaryDismissed, setPrimaryDismissed] = useState(false);
  const [dismissedMentionKey, setDismissedMentionKey] = useState<string | null>(null);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [mentionMenuEntries, setMentionMenuEntries] = useState<ContextAttachMenuEntry[]>([]);
  const mentionMenuRef = useRef<ContextAttachMenuHandle | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const context = useConversationContext({
    attachments,
    primaryDismissed,
    workspaceId,
    isSidebar,
    pageId,
    databaseId,
  });
  const { primarySource, effectivePrimarySource } = context;
  useEffect(() => {
    setAttachments([]);
    setDismissedMentionKey(null);
    setPrimaryDismissed(false);
    setSelectedMentionIndex(0);
    setTextCursor(0);
  }, [databaseId, pageId]);

  const mentionTrigger = useMemo(() => parseMentionState(text, textCursor), [text, textCursor]);
  const mentionKey = mentionTrigger
    ? `${mentionTrigger.mentionStart}:${mentionTrigger.mentionQuery}`
    : null;
  const activeMentionTrigger =
    mentionTrigger && mentionKey !== dismissedMentionKey ? mentionTrigger : null;
  const mentionMenuOpen = Boolean(activeMentionTrigger);

  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [activeMentionTrigger?.mentionQuery]);

  const existingAttachmentKeys = useMemo(() => {
    const keys = new Set(attachments.map((item) => getAttachmentKey(item)));

    if (effectivePrimarySource) {
      keys.add(getAttachmentKey(effectivePrimarySource));
    }

    return keys;
  }, [attachments, effectivePrimarySource]);

  const syncTextCursor = useCallback(() => {
    const cursor = textareaRef.current?.selectionStart ?? text.length;
    setTextCursor(cursor);
  }, [text.length]);

  const handleTextChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    const caretPosition = event.target.selectionStart ?? nextValue.length;

    setText(nextValue);
    setTextCursor(caretPosition);
    setDismissedMentionKey(null);
  }, []);

  const clearMentionTrigger = useCallback(() => {
    if (!activeMentionTrigger) {
      return;
    }

    const next = removeDraftMention(text, activeMentionTrigger);
    setText(next.text);
    setTextCursor(next.cursor);
    setDismissedMentionKey(null);
  }, [activeMentionTrigger, text]);

  const handleAttachContext = useCallback(
    (attachment: ContextAttachment) => {
      const key = getAttachmentKey(attachment);

      if (existingAttachmentKeys.has(key)) {
        clearMentionTrigger();
        return;
      }

      if (primarySource && getAttachmentKey(primarySource) === key) {
        setPrimaryDismissed(false);
        clearMentionTrigger();
        textareaRef.current?.focus();
        return;
      }

      setAttachments((current) => [...current, attachment]);
      clearMentionTrigger();
      textareaRef.current?.focus();
    },
    [clearMentionTrigger, existingAttachmentKeys, primarySource],
  );

  const handleRemovePrimary = useCallback(() => {
    setPrimaryDismissed(true);
  }, []);

  const handleTextareaKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!mentionMenuOpen) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedMentionIndex((index) =>
          mentionMenuEntries.length ? (index + 1) % mentionMenuEntries.length : 0,
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedMentionIndex((index) =>
          mentionMenuEntries.length
            ? (index - 1 + mentionMenuEntries.length) % mentionMenuEntries.length
            : 0,
        );
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setDismissedMentionKey(mentionKey);
        return;
      }

      if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey) {
        event.preventDefault();

        const selectedEntry = mentionMenuEntries[selectedMentionIndex];

        if (selectedEntry) {
          mentionMenuRef.current?.activateEntry(selectedEntry);
        } else {
          setDismissedMentionKey(mentionKey);
        }
      }
    },
    [mentionKey, mentionMenuEntries, mentionMenuOpen, selectedMentionIndex],
  );

  const handleRemoveAttachment = useCallback((attachment: ContextAttachment) => {
    setAttachments((current) =>
      current.filter((item) => getAttachmentKey(item) !== getAttachmentKey(attachment)),
    );
  }, []);

  const resetDraft = useCallback(() => {
    setText("");
    setTextCursor(0);
    setAttachments([]);
    setPrimaryDismissed(false);
    setDismissedMentionKey(null);
    setSelectedMentionIndex(0);
    setMentionMenuEntries([]);
  }, []);
  const clearSubmittedDraft = useCallback(() => {
    setText("");
    setTextCursor(0);
    setDismissedMentionKey(null);
  }, []);
  return {
    text,
    attachments,
    setText,
    resetDraft,
    clearSubmittedDraft,
    context,
    composerProps: {
      activeMentionQuery: activeMentionTrigger?.mentionQuery ?? "",
      attachments: attachments,
      contextError: context.contextError,
      currentDatabaseId: databaseId,
      currentPageId: pageId,
      existingAttachmentKeys: existingAttachmentKeys,
      isContextLoading: context.isContextLoading,
      mentionMenuOpen: mentionMenuOpen,
      mentionMenuRef: mentionMenuRef,
      onAttachContext: handleAttachContext,
      onEntriesChange: setMentionMenuEntries,
      onRemoveAttachment: handleRemoveAttachment,
      onRemovePrimary: handleRemovePrimary,
      onTextChange: handleTextChange,
      onTextareaKeyDown: handleTextareaKeyDown,
      primaryAttachment: context.primaryAttachment,
      selectedMentionIndex: selectedMentionIndex,
      setSelectedMentionIndex: setSelectedMentionIndex,
      syncTextCursor: syncTextCursor,
      text: text,
      textareaRef: textareaRef,
    },
  };
}
