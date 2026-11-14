import type { Editor } from "@tiptap/core";
import { aiSelectionActions } from "@zilobase/features/ai";
import { useAiWriting } from "@zilobase/features/ai/react";
import { Sparkles } from "@/components/icons";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  contextMarkdown,
  editorAiWorkspaceId,
  isInlineRange,
  markdownContent,
  rangeMarkdown,
} from "../../operations/lib/ai-writing";

type Target = { from: number; to: number; markdown: string; instruction: string };

export function SelectionAiMenu({ editor }: { editor: Editor }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [prompt, setPrompt] = React.useState("");
  const [target, setTarget] = React.useState<Target | null>(null);
  const writing = useAiWriting();
  const workspaceId = editorAiWorkspaceId(editor);

  const run = (instruction: string, from = target?.from, to = target?.to) => {
    if (!workspaceId || from === undefined || to === undefined || from === to) return;
    const markdown = rangeMarkdown(editor, from, to);
    setTarget({ from, to, markdown, instruction });
    writing.mutate({
      workspaceId,
      instruction,
      selection: markdown,
      context: contextMarkdown(editor, from),
    });
  };
  const start = (instruction: string) => {
    const { from, to } = editor.state.selection;
    run(instruction, target?.from ?? from, target?.to ?? to);
  };
  const close = () => {
    setIsOpen(false);
    setPrompt("");
    setTarget(null);
    writing.reset();
  };
  const apply = (mode: "replace" | "below") => {
    const result = writing.data?.markdown;
    if (!target || !result || !editor.isEditable) return;
    // The user may have typed since the request; only apply onto the text that was rewritten.
    if (rangeMarkdown(editor, target.from, target.to) !== target.markdown) {
      writing.reset();
      return;
    }
    const chain = editor.chain().focus();
    if (mode === "replace")
      chain
        .insertContentAt(
          { from: target.from, to: target.to },
          markdownContent(result, isInlineRange(editor, target.from, target.to)),
        )
        .run();
    else {
      const end = editor.state.doc.resolve(target.to);
      chain
        .insertContentAt(end.depth ? end.after(1) : target.to, markdownContent(result, false))
        .run();
    }
    close();
  };

  return (
    <Popover onOpenChange={(open) => (open ? setIsOpen(true) : close())} open={isOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label="Ask AI"
          onMouseDown={(event) => event.preventDefault()}
          size="icon"
          title="Ask AI"
          type="button"
          variant="ghost"
        >
          <Sparkles />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="selection-ai-menu w-80"
        onOpenAutoFocus={(event) => event.preventDefault()}
        side="bottom"
        sideOffset={8}
      >
        <form
          className="selection-ai-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (prompt.trim()) start(prompt.trim());
          }}
        >
          <InputGroup className="has-[[data-slot=input-group-control]:focus-visible]:ring-1">
            <InputGroupInput
              className="h-full"
              autoFocus
              disabled={writing.isPending}
              onChange={(event) => setPrompt(event.currentTarget.value)}
              placeholder="Ask AI to rewrite the selection..."
              value={prompt}
            />
          </InputGroup>
        </form>
        {writing.isPending ? (
          <p className="mt-2 text-sm text-content-secondary" role="status">
            Writing…
          </p>
        ) : writing.data ? (
          <div className="mt-2 space-y-2">
            <div
              aria-label="AI suggestion"
              className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-md border bg-surface-canvas p-2 text-sm"
            >
              {writing.data.markdown}
            </div>
            <div className="flex flex-wrap gap-1">
              <Button onClick={() => apply("replace")} size="sm" type="button">
                Replace selection
              </Button>
              <Button onClick={() => apply("below")} size="sm" type="button" variant="ghost">
                Insert below
              </Button>
              <Button
                onClick={() => target && run(target.instruction)}
                size="sm"
                type="button"
                variant="ghost"
              >
                Try again
              </Button>
              <Button onClick={close} size="sm" type="button" variant="ghost">
                Discard
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex flex-col" role="menu">
            {writing.isError && (
              <p className="mb-1 text-sm text-feedback-danger-text" role="alert">
                {writing.error instanceof Error ? writing.error.message : "AI couldn't write this."}
              </p>
            )}
            {aiSelectionActions.map((action) => (
              <Button
                className="justify-start"
                key={action.id}
                onClick={() => start(action.instruction)}
                role="menuitem"
                size="sm"
                type="button"
                variant="ghost"
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
