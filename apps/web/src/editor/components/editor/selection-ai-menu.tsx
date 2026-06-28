import type { Editor, Range } from "@tiptap/core"
import { Loader2, Sparkles } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  normalizeSelectionReplacementMarkdown,
  nextPaint,
  readStreamError,
} from "@/packages/editor/editor-ai-utils"
import { getApiRequestHeaders, toApiUrl } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { SelectionAiDiffPreview } from "@/packages/editor/types"
import { useNotelabAiPages } from "@notelab/features/pages"

type SelectionAiMenuProps = {
  editor: Editor
  onPreviewChange: (preview: SelectionAiDiffPreview | null) => void
  workspaceId?: string | null
}

export function SelectionAiMenu({
  editor,
  onPreviewChange,
  workspaceId,
}: SelectionAiMenuProps) {
  const { data: aiPages = [], isLoading } =
    useNotelabAiPages(workspaceId)
  const skills = React.useMemo(
    () =>
      aiPages.filter(
        (page) => page.metadata.notelabai === "skill",
      ),
    [aiPages],
  )
  const [isOpen, setIsOpen] = React.useState(false)
  const [isStreaming, setIsStreaming] = React.useState(false)
  const [prompt, setPrompt] = React.useState("")
  const [selectedSkillId, setSelectedSkillId] = React.useState<string | null>(
    null,
  )
  const abortControllerRef = React.useRef<AbortController | null>(null)
  const latestMarkdownRef = React.useRef("")
  const selectedRangeRef = React.useRef<Range | null>(null)
  const selectedTextRef = React.useRef("")

  React.useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  const selectedSkill = React.useMemo(
    () => skills.find((skill) => skill.id === selectedSkillId) ?? null,
    [selectedSkillId, skills],
  )

  const captureSelection = () => {
    const { from, to } = editor.state.selection

    if (from === to) {
      selectedRangeRef.current = null
      selectedTextRef.current = ""
      return
    }

    selectedRangeRef.current = { from, to }
    selectedTextRef.current = editor.state.doc.textBetween(from, to, "\n\n", "\n")
  }

  const submitPrompt = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedPrompt = prompt.trim()
    const selectedRange = selectedRangeRef.current

    if (!trimmedPrompt || !selectedRange || isStreaming) {
      return
    }

    setIsStreaming(true)
    latestMarkdownRef.current = ""
    abortControllerRef.current = new AbortController()
    onPreviewChange({
      from: selectedRange.from,
      generatedMarkdown: "",
      isStreaming: true,
      to: selectedRange.to,
    })

    try {
      const headers = getApiRequestHeaders({
        "content-type": "application/json",
      })

      if (workspaceId) {
        headers.set("x-notelab-workspace-id", workspaceId)
      }

      const response = await fetch(toApiUrl("/api/ai/editor"), {
        body: JSON.stringify({
          prompt: trimmedPrompt,
          selectedText: selectedTextRef.current,
          skillPageId: selectedSkill?.id,
        }),
        credentials: "include",
        headers,
        method: "POST",
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        throw new Error(await readStreamError(response))
      }

      if (!response.body) {
        throw new Error("The AI response did not include a stream.")
      }

      setIsOpen(false)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const updatePreview = (isStreamingPreview: boolean) => {
        const generatedMarkdown = isStreamingPreview
          ? latestMarkdownRef.current
          : normalizeSelectionReplacementMarkdown(latestMarkdownRef.current)

        onPreviewChange({
          from: selectedRange.from,
          generatedMarkdown,
          isStreaming: isStreamingPreview,
          to: selectedRange.to,
        })
      }

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        latestMarkdownRef.current += decoder.decode(value, { stream: true })
        updatePreview(true)
        await nextPaint()
      }

      const flushed = decoder.decode()

      if (flushed) {
        latestMarkdownRef.current += flushed
        updatePreview(true)
        await nextPaint()
      }

      updatePreview(false)
      editor.chain().focus().setTextSelection(selectedRange).run()
      setPrompt("")
    } catch (streamError) {
      if (streamError instanceof DOMException && streamError.name === "AbortError") {
        return
      }

      const message =
        streamError instanceof Error
          ? streamError.message
          : "AI generation failed. Try again."

      toast.error("Selection AI failed", { description: message })
      onPreviewChange(null)
    } finally {
      setIsStreaming(false)
      abortControllerRef.current = null
    }
  }

  return (
    <Popover
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          captureSelection()
        }

        setIsOpen(nextOpen)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          aria-label="Ask AI"
          disabled={isStreaming}
          onMouseDown={(event) => event.preventDefault()}
          size="icon"
          title="Ask AI"
          type="button"
          variant="ghost"
        >
          {isStreaming ? <Loader2 className="animate-spin" /> : <Sparkles />}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="selection-ai-menu"
        onOpenAutoFocus={(event) => event.preventDefault()}
        side="bottom"
        sideOffset={8}
      >
        <div className="selection-ai-skills" role="listbox">
          <button
            className={cn(
              "selection-ai-skill",
              !selectedSkillId && "selection-ai-skill-active",
            )}
            onClick={() => setSelectedSkillId(null)}
            type="button"
          >
            General
          </button>
          {skills.map((skill) => (
            <button
              className={cn(
                "selection-ai-skill",
                selectedSkillId === skill.id && "selection-ai-skill-active",
              )}
              key={skill.id}
              onClick={() => setSelectedSkillId(skill.id)}
              title={skill.name}
              type="button"
            >
              {skill.metadata.emoji ? (
                <span className="selection-ai-skill-emoji">
                  {skill.metadata.emoji}
                </span>
              ) : null}
              <span className="truncate">{skill.name || "Untitled skill"}</span>
            </button>
          ))}
          {isLoading ? (
            <div className="selection-ai-empty">Loading skills...</div>
          ) : skills.length === 0 ? (
            <div className="selection-ai-empty">No skills yet</div>
          ) : null}
        </div>
        <form className="selection-ai-form" onSubmit={submitPrompt}>
          <Input
            autoFocus
            disabled={isStreaming}
            onChange={(event) => setPrompt(event.currentTarget.value)}
            placeholder={
              selectedSkill
                ? `Ask ${selectedSkill.name || "this skill"}...`
                : "Ask AI to rewrite the selection..."
            }
            value={prompt}
          />
        </form>
      </PopoverContent>
    </Popover>
  )
}
