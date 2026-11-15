import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import type { Editor, Range } from "@tiptap/core";
import { Send, Sparkles, X } from "@/components/icons";
import { useState } from "react";

import { useAiWriting } from "@zilobase/features/ai/react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { isFeatureEnabled } from "@/platform/environment";
import {
  contextMarkdown,
  editorAiWorkspaceId,
  markdownContent,
} from "../../operations/lib/ai-writing";

type AskAiBlockOptions = {
  workspaceId?: string | null;
};

export function insertAskAiBlock({ editor, range }: { editor: Editor; range: Range }) {
  if (!isFeatureEnabled("askAi")) return;
  editor.chain().focus().deleteRange(range).insertContent({ type: "askAiBlock" }).run();
}

function AskAiBlockView(props: ReactNodeViewProps) {
  if (!isFeatureEnabled("askAi")) {
    return <NodeViewWrapper className="hidden" contentEditable={false} />;
  }
  return <AskAiBlockPanel {...props} />;
}

function AskAiBlockPanel({ editor, getPos, node }: ReactNodeViewProps) {
  const [prompt, setPrompt] = useState("");
  const writing = useAiWriting();
  const workspaceId = editorAiWorkspaceId(editor);
  const position = () => (typeof getPos === "function" ? getPos() : undefined);

  const removeBlock = () => {
    const pos = position();
    if (typeof pos !== "number") return;
    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .run();
  };
  const write = () => {
    const pos = position();
    if (!workspaceId || typeof pos !== "number" || !prompt.trim()) return;
    writing.mutate({
      workspaceId,
      instruction: prompt.trim(),
      context: contextMarkdown(editor, pos),
    });
  };
  const insert = () => {
    const pos = position();
    const markdown = writing.data?.markdown;
    if (typeof pos !== "number" || !markdown || !editor.isEditable) return;
    editor
      .chain()
      .focus()
      .insertContentAt({ from: pos, to: pos + node.nodeSize }, markdownContent(markdown, false))
      .run();
  };

  return (
    <NodeViewWrapper className="ask-ai-block w-full" contentEditable={false}>
      <InputGroup className="flex h-auto min-h-12 w-full items-end gap-2 rounded-md border bg-surface-canvas dark:bg-surface-canvas px-3 py-2 shadow-sm transition-colors focus-within:border-action-focus-ring focus-within:ring-2 focus-within:ring-action-focus-ring">
        <Sparkles aria-hidden="true" className="mt-2 size-4 shrink-0 text-content-secondary" />
        <InputGroupTextarea
          autoFocus
          className="max-h-48 min-h-8 flex-1 resize-none border-0 bg-transparent px-0 py-1 text-base leading-6 shadow-none focus-visible:ring-0"
          disabled={writing.isPending}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              removeBlock();
            } else if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              write();
            }
          }}
          placeholder="Ask AI to write in this page..."
          rows={1}
          value={prompt}
        />
        <InputGroupButton
          aria-label="Remove Ask AI"
          className="size-8 shrink-0 rounded-sm [&_svg]:size-4"
          onClick={removeBlock}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <X />
        </InputGroupButton>
        <InputGroupButton
          aria-label="Send prompt"
          className="size-8 shrink-0 rounded-sm [&_svg]:size-4"
          disabled={!prompt.trim() || writing.isPending}
          onClick={write}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Send />
        </InputGroupButton>
      </InputGroup>
      {writing.isPending && (
        <div className="mt-2 space-y-1">
          <p className="text-sm text-content-secondary" role="status">
            Writing…
          </p>
          {writing.partial && (
            <div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border p-3 text-sm">
              {writing.partial}
            </div>
          )}
        </div>
      )}
      {writing.isError && (
        <p className="mt-2 text-sm text-feedback-danger-text" role="alert">
          {writing.error instanceof Error ? writing.error.message : "AI couldn't write this."}
        </p>
      )}
      {writing.data && !writing.isPending && (
        <div className="mt-2 space-y-2">
          <div
            aria-label="AI suggestion"
            className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border p-3 text-sm"
          >
            {writing.data.markdown}
          </div>
          <div className="flex flex-wrap gap-1">
            <Button onClick={insert} size="sm" type="button">
              Insert
            </Button>
            <Button onClick={write} size="sm" type="button" variant="ghost">
              Try again
            </Button>
            <Button onClick={removeBlock} size="sm" type="button" variant="ghost">
              Discard
            </Button>
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const AskAiBlock = Node.create<AskAiBlockOptions>({
  name: "askAiBlock",

  group: "block",

  atom: true,

  selectable: true,

  addOptions() {
    return {
      workspaceId: null,
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='ask-ai-block']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "ask-ai-block" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer((props) => <AskAiBlockView {...props} />);
  },
});
