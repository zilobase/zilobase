import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { Copy, HelpCircle, Sigma } from "@/shared/components/icons"
import type { ThemedToken } from "shiki"
import { toast } from "sonner"

import { highlightCode } from "@/features/ai/components/elements/index"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { ScrollArea } from "@/shared/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { Separator } from "@/shared/ui/separator"
import { Switch } from "@/shared/ui/switch"
import { Textarea } from "@/shared/ui/textarea"
import { cn } from "@/shared/lib/utils"

import { getDatabasePropertyType } from "../../../core/database-property-types"
import { useDatabaseViewContext } from "../../../views/model/database-view-context"
import {
  escapeFormulaString,
  getFormulaExpression,
  getMergedFormulaConfig,
} from "../model/formula-config"
import {
  evaluateDatabaseFormula,
} from "../runtime/formula-evaluator"
import { formatFormulaValue } from "../formatting/formula-formatters"
import {
  builtInReferences,
  getPropertyReferenceDescription,
  getPropertyReferenceSnippets,
  type FormulaReferenceItem,
} from "../model/formula-reference-catalog"

type HighlightedFormulaCode = {
  bg: string
  fg: string
  tokens: ThemedToken[][]
}

export function DatabaseFormulaDialog({
  databasePropertyId,
  onOpenChange,
  open,
}: {
  databasePropertyId: string | null
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const {
    items,
    properties,
    propertyValuesByKey,
    titlePropertyLabel,
    updateDatabasePropertyConfig,
  } = useDatabaseViewContext()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [debugMode, setDebugMode] = useState(false)
  const [draftFormula, setDraftFormula] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [previewRowId, setPreviewRowId] = useState<string | null>(null)
  const [selectedReferenceId, setSelectedReferenceId] = useState<string | null>(
    null
  )
  const property = useMemo(
    () =>
      databasePropertyId
        ? properties.find((candidate) => candidate.id === databasePropertyId) ??
          null
        : null,
    [databasePropertyId, properties]
  )
  const previewRow =
    items.find((item) => item.id === previewRowId) ?? items[0] ?? null
  const previewResult = useMemo(() => {
    if (!property || !previewRow) {
      return null
    }

    return evaluateDatabaseFormula({
      currentPropertyId: property.property.id,
      expression: draftFormula,
      properties,
      propertyValuesByKey,
      row: previewRow,
      titlePropertyLabel,
    })
  }, [
    draftFormula,
    previewRow,
    properties,
    property,
    propertyValuesByKey,
    titlePropertyLabel,
  ])
  const hasFormulaChanged =
    property && draftFormula !== getFormulaExpression(property.property.config)
  const insertableProperties = useMemo(
    () => [
      {
        id: "name",
        name: titlePropertyLabel,
        type: "text",
      },
      ...properties
        .filter((candidate) => candidate.property.id !== property?.property.id)
        .map((candidate) => ({
          id: candidate.id,
          name: candidate.property.name,
          type: candidate.property.type,
        })),
    ],
    [properties, property?.property.id, titlePropertyLabel]
  )
  const propertyReferences = useMemo(
    () =>
      insertableProperties.map((item): FormulaReferenceItem => {
        const snippet = `prop("${escapeFormulaString(item.name)}")`

        return {
          category: "property",
          description: getPropertyReferenceDescription(item.type),
          id: `property:${item.id}`,
          label: item.name,
          propertyType: item.type,
          snippets: getPropertyReferenceSnippets(item.type, snippet),
          type: getDatabasePropertyType(item.type).label,
        }
      }),
    [insertableProperties]
  )
  const referenceItems = useMemo(
    () => [...propertyReferences, ...builtInReferences],
    [propertyReferences]
  )
  const selectedReference =
    referenceItems.find((item) => item.id === selectedReferenceId) ??
    referenceItems[0] ??
    null

  useEffect(() => {
    if (!open) {
      return
    }

    setDraftFormula(getFormulaExpression(property?.property.config))
    setPreviewRowId((currentRowId) =>
      items.some((item) => item.id === currentRowId)
        ? currentRowId
        : items[0]?.id ?? null
    )
    setSelectedReferenceId((currentReferenceId) =>
      referenceItems.some((item) => item.id === currentReferenceId)
        ? currentReferenceId
        : referenceItems[0]?.id ?? null
    )
  }, [items, open, property?.property.config, referenceItems])

  const insertSnippet = (snippet: string) => {
    const textarea = textareaRef.current

    if (!textarea) {
      setDraftFormula((currentFormula) => `${currentFormula}${snippet}`)
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const nextFormula =
      draftFormula.slice(0, start) + snippet + draftFormula.slice(end)
    const nextCursorPosition = start + snippet.length

    setDraftFormula(nextFormula)
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(nextCursorPosition, nextCursorPosition)
    })
  }

  const saveFormula = () => {
    if (!property || isSaving) {
      return
    }

    setIsSaving(true)
    void updateDatabasePropertyConfig(
      property.id,
      getMergedFormulaConfig(property.property.config, draftFormula)
    )
      .then(() => {
        toast.success("Formula saved")
        onOpenChange(false)
      })
      .catch(() => {
        toast.error("Couldn't save formula")
      })
      .finally(() => {
        setIsSaving(false)
      })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-4xl">
        <div className="flex max-h-[74vh] min-h-[28rem] flex-col overflow-hidden">
          <DialogHeader className="px-5 py-3 pr-14">
            <DialogTitle className="flex items-center gap-2">
              <Sigma className="size-5 text-muted-foreground" />
              <span>Edit formula</span>
              <a
                aria-label="Formula syntax"
                className="text-muted-foreground transition-colors hover:text-foreground"
                href="https://www.notion.com/help/formula-syntax"
                rel="noreferrer"
                target="_blank"
              >
                <HelpCircle className="size-4" />
              </a>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Write a Notion-style formula for{" "}
              {property?.property.name ?? "this property"}.
            </DialogDescription>
          </DialogHeader>

          <Separator />

          <section className="px-5 py-2.5">
            <label className="sr-only" htmlFor="database-formula-input">
              Your formula
            </label>
            <FormulaEditor
              draftFormula={draftFormula}
              id="database-formula-input"
              onChange={setDraftFormula}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault()
                  saveFormula()
                }
              }}
              placeholder="Your formula"
              textareaRef={textareaRef}
            />
          </section>

          <Separator />

          <section className="grid gap-2.5 px-5 py-2.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <div className="grid min-w-0 gap-2">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                <span>Preview with</span>
                <Select
                  disabled={items.length === 0}
                  onValueChange={setPreviewRowId}
                  value={previewRow?.id}
                >
                  <SelectTrigger className="w-[14rem] max-w-full" size="sm">
                    <SelectValue placeholder="No rows" />
                  </SelectTrigger>
                  <SelectContent align="start">
                    {items.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.page.name.trim() || "Untitled"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div
                className={cn(
                  "min-h-6 text-sm",
                  previewResult && !previewResult.ok
                    ? "text-destructive"
                    : "text-muted-foreground"
                )}
              >
                {!previewRow ? (
                  "Add a row to preview the formula output."
                ) : previewResult?.ok ? (
                  formatFormulaValue(previewResult.value) || "No output"
                ) : (
                  previewResult?.error ?? "Unable to preview this formula."
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 md:justify-end">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch
                  checked={debugMode}
                  onCheckedChange={setDebugMode}
                  size="sm"
                />
                Debug mode
              </label>
              <Badge variant="secondary">
                Type: {previewResult?.type ?? "unknown"}
              </Badge>
            </div>
          </section>

          {debugMode ? (
            <>
              <Separator />
              <pre className="max-h-28 overflow-auto bg-subtle-surface px-5 py-2.5 text-xs text-muted-foreground">
                {JSON.stringify(
                  {
                    formula: draftFormula,
                    previewRow: previewRow?.page.name ?? null,
                    result: previewResult,
                  },
                  null,
                  2
                )}
              </pre>
            </>
          ) : null}

          <Separator />

          <section className="grid min-h-0 flex-1 md:grid-cols-[16rem_minmax(0,1fr)]">
            <ScrollArea className="min-h-0 border-b md:border-r md:border-b-0">
              <FormulaSidebarSection title="Properties">
                {propertyReferences.map((item) => (
                  <FormulaReferenceButton
                    item={item}
                    key={item.id}
                    onSelect={setSelectedReferenceId}
                    selected={selectedReference?.id === item.id}
                  />
                ))}
              </FormulaSidebarSection>
              <FormulaSidebarSection title="Built-ins">
                {builtInReferences.map((item) => (
                  <FormulaReferenceButton
                    item={item}
                    key={item.id}
                    onSelect={setSelectedReferenceId}
                    selected={selectedReference?.id === item.id}
                  />
                ))}
              </FormulaSidebarSection>
            </ScrollArea>

            <ScrollArea className="min-h-0">
              {selectedReference ? (
                <FormulaReferenceDetails
                  item={selectedReference}
                  onInsertSnippet={insertSnippet}
                />
              ) : (
                <div className="p-6 text-sm text-muted-foreground">
                  Select a property or built-in to see formula examples.
                </div>
              )}
            </ScrollArea>
          </section>

          <Separator />

          <DialogFooter className="mx-0 mb-0 rounded-none px-5 py-2.5">
            <Button
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={!property || isSaving || !hasFormulaChanged}
              onClick={saveFormula}
              type="button"
            >
              {isSaving ? "Saving..." : "Save formula"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
function FormulaEditor({
  draftFormula,
  id,
  onChange,
  onKeyDown,
  placeholder,
  textareaRef,
}: {
  draftFormula: string
  id: string
  onChange: (value: string) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void
  placeholder: string
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  const [asyncHighlightedCode, setAsyncHighlightedCode] =
    useState<HighlightedFormulaCode | null>(null)
  const highlightedCode = useMemo(
    () =>
      (highlightCode(draftFormula, "js") as HighlightedFormulaCode | null) ??
      createRawHighlightedFormulaCode(draftFormula),
    [draftFormula]
  )
  const activeHighlightedCode = asyncHighlightedCode ?? highlightedCode
  const highlightOverlayRef = useRef<HTMLPreElement | null>(null)

  useEffect(() => {
    setAsyncHighlightedCode(null)

    highlightCode(draftFormula, "js", (result) => {
      setAsyncHighlightedCode(result as HighlightedFormulaCode)
    })
  }, [draftFormula])

  const syncScroll = (target: HTMLTextAreaElement) => {
    const highlightOverlay = highlightOverlayRef.current

    if (!highlightOverlay) {
      return
    }

    highlightOverlay.scrollTop = target.scrollTop
    highlightOverlay.scrollLeft = target.scrollLeft
  }

  return (
    <div className="relative">
      <pre
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 m-0 overflow-auto rounded-lg border border-input px-2.5 py-2 font-mono text-sm leading-6 whitespace-pre-wrap break-words"
        ref={highlightOverlayRef}
        style={{
          backgroundColor: activeHighlightedCode.bg,
          color: activeHighlightedCode.fg,
        }}
      >
        <code>
          {draftFormula ? (
            activeHighlightedCode.tokens.map((line, lineIndex) => (
              <span className="block" key={`formula-line-${lineIndex}`}>
                {line.length === 0
                  ? "\n"
                  : line.map((token, tokenIndex) => (
                      <span
                        className="dark:!bg-[var(--shiki-dark-bg)] dark:!text-[var(--shiki-dark)]"
                        key={`formula-line-${lineIndex}-token-${tokenIndex}`}
                        style={{
                          backgroundColor: token.bgColor,
                          color: token.color,
                          fontStyle:
                            token.fontStyle && token.fontStyle & 1
                              ? "italic"
                              : undefined,
                          fontWeight:
                            token.fontStyle && token.fontStyle & 2
                              ? "bold"
                              : undefined,
                          textDecoration:
                            token.fontStyle && token.fontStyle & 4
                              ? "underline"
                              : undefined,
                          ...token.htmlStyle,
                        }}
                      >
                        {token.content}
                      </span>
                    ))}
              </span>
            ))
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </code>
      </pre>

      <Textarea
        aria-label="Formula"
        className="relative z-10 min-h-24 resize-none border-transparent bg-transparent font-mono text-sm leading-6 text-transparent caret-foreground selection:bg-primary-subtle focus-visible:border-ring"
        id={id}
        onChange={(event) => {
          onChange(event.target.value)
          syncScroll(event.target)
        }}
        onInput={(event) => {
          syncScroll(event.currentTarget)
        }}
        onKeyDown={onKeyDown}
        onScroll={(event) => {
          syncScroll(event.currentTarget)
        }}
        placeholder={placeholder}
        ref={textareaRef}
        spellCheck={false}
        value={draftFormula}
      />
    </div>
  )
}

function createRawHighlightedFormulaCode(
  code: string
): HighlightedFormulaCode {
  return {
    bg: "transparent",
    fg: "inherit",
    tokens: code.split("\n").map((line) =>
      line === ""
        ? []
        : [
            {
              color: "inherit",
              content: line,
            } as ThemedToken,
          ]
    ),
  }
}

function FormulaSidebarSection({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <section>
      <div className="border-b px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{title}</span>
      </div>
      <div className="divide-y">{children}</div>
    </section>
  )
}

function FormulaReferenceButton({
  item,
  onSelect,
  selected,
}: {
  item: FormulaReferenceItem
  onSelect: (id: string) => void
  selected: boolean
}) {
  const ReferenceIcon = item.propertyType
    ? getDatabasePropertyType(item.propertyType).icon
    : Sigma

  return (
    <Button
      className="h-auto w-full justify-start rounded-none px-3 py-1.5 text-left"
      onClick={() => onSelect(item.id)}
      type="button"
      variant={selected ? "secondary" : "ghost"}
    >
      <ReferenceIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{item.label}</span>
    </Button>
  )
}

function FormulaReferenceDetails({
  item,
  onInsertSnippet,
}: {
  item: FormulaReferenceItem
  onInsertSnippet: (snippet: string) => void
}) {
  const ReferenceIcon = item.propertyType
    ? getDatabasePropertyType(item.propertyType).icon
    : Sigma

  return (
    <div className="grid gap-4 p-5">
      <div className="grid gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ReferenceIcon className="size-4 shrink-0 text-muted-foreground" />
          <h3 className="truncate text-base font-semibold">{item.label}</h3>
        </div>
        <p className="text-sm text-muted-foreground">{item.description}</p>
        <Badge className="w-fit" variant="secondary">
          {item.type}
        </Badge>
      </div>

      <div className="divide-y border-y">
        {item.snippets.map((snippet) => (
          <div className="flex min-w-0 items-center gap-3 py-1.5" key={snippet}>
            <code className="min-w-0 flex-1 truncate font-mono text-sm">
              {snippet}
            </code>
            <Button
              aria-label="Insert formula snippet"
              onClick={() => onInsertSnippet(snippet)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Copy />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
