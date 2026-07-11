import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { Copy, HelpCircle, Sigma } from "lucide-react"
import type { ThemedToken } from "shiki"
import { toast } from "sonner"

import { highlightCode } from "@/components/ai-elements/code-block"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import { getDatabasePropertyType } from "../../core/database-property-types"
import { useDatabaseViewContext } from "../../views/database-view-context"
import {
  escapeFormulaString,
  getFormulaExpression,
  getMergedFormulaConfig,
} from "./formula-config"
import {
  evaluateDatabaseFormula,
  formatFormulaValue,
} from "./formula-engine"

type FormulaReferenceItem = {
  category: "property" | "built-in"
  description: string
  id: string
  label: string
  propertyType?: string
  snippets: string[]
  type: string
}

type HighlightedFormulaCode = {
  bg: string
  fg: string
  tokens: ThemedToken[][]
}

const builtInReferences: FormulaReferenceItem[] = [
  createBuiltInReference("if", "Return one value when a condition is true and another when it is false.", [
    'if(prop("Done"), "Complete", "Todo")',
  ]),
  createBuiltInReference("ifs", "Check conditions in order and return the first matching value.", [
    'ifs(prop("Priority") == "High", 1, prop("Priority") == "Low", 3, 2)',
  ]),
  createBuiltInReference("empty", "Check whether a value is empty.", [
    'empty(prop("Due Date"))',
  ]),
  createBuiltInReference("length", "Count characters in text or items in a list.", [
    'length(prop("Name"))',
    'prop("Name").length()',
  ]),
  createBuiltInReference("contains", "Check whether text or a list contains a value.", [
    'contains(prop("Name"), "Q")',
  ]),
  createBuiltInReference("format", "Convert a value to text.", [
    'format(prop("Price"))',
  ]),
  createBuiltInReference("dateAdd", "Add time to a date.", [
    'dateAdd(prop("Due Date"), 1, "days")',
  ]),
  createBuiltInReference("dateBetween", "Calculate the distance between two dates.", [
    'dateBetween(prop("Due Date"), now(), "days")',
  ]),
  createBuiltInReference("now", "Use the current date and time.", ["now()"]),
  createBuiltInReference("today", "Use today without a time value.", ["today()"]),
  createBuiltInReference("sum", "Add numbers together.", [
    'sum(prop("Price"), prop("Tax"))',
  ]),
  createBuiltInReference("mean", "Find the average of numbers.", [
    'mean(prop("Score"), prop("Bonus"))',
  ]),
  createBuiltInReference("round", "Round a number.", [
    'round(prop("Price"), 2)',
  ]),
  createBuiltInReference("formatDate", "Format a date with tokens like YYYY, MM, DD, h, and mm.", [
    'formatDate(prop("Due Date"), "YYYY-MM-DD")',
  ]),
  createBuiltInReference("formatNumber", "Format a number as text, including decimal precision or currencies.", [
    'formatNumber(prop("Revenue"), "usd", 0)',
  ]),
  createBuiltInReference("date parts", "Read individual parts of a date.", [
    'year(prop("Due Date"))',
    'month(prop("Due Date"))',
    'date(prop("Due Date"))',
  ]),
  createBuiltInReference("timestamp", "Convert dates to and from Unix timestamps in milliseconds.", [
    'timestamp(prop("Due Date"))',
    "fromTimestamp(1693443300000)",
  ]),
  createBuiltInReference("let", "Create a variable for the final expression.", [
    "let(radius, 4, round(pi() * radius ^ 2))",
  ]),
  createBuiltInReference("lets", "Create multiple variables for the final expression.", [
    'lets(a, "Hello", b, "world", a + " " + b)',
  ]),
  createBuiltInReference("map", "Transform each item in a list with current and index.", [
    "map([1, 2, 3], current + index)",
  ]),
  createBuiltInReference("filter", "Keep list items where the expression is true.", [
    "filter([1, 2, 3], current > 1)",
  ]),
  createBuiltInReference("find", "Return the first list item that matches an expression.", [
    "find([1, 2, 3], current > 2)",
    "findIndex([1, 2, 3], current > 2)",
  ]),
  createBuiltInReference("some / every", "Check whether any or all list items match an expression.", [
    "some([1, 2, 3], current == 2)",
    "every([1, 2, 3], current > 0)",
  ]),
  createBuiltInReference("list helpers", "Sort, combine, flatten, de-dupe, slice, and join lists.", [
    'unique(sort(concat([3, 1], [2, 1]))).join("-")',
    'split("apple,pear", ",")',
  ]),
  createBuiltInReference("trim", "Remove whitespace from the beginning and end of text.", [
    '" notion ".trim()',
  ]),
]

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
              <pre className="max-h-28 overflow-auto bg-muted/30 px-5 py-2.5 text-xs text-muted-foreground">
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
        className="relative z-10 min-h-24 resize-none border-transparent bg-transparent font-mono text-sm leading-6 text-transparent caret-foreground selection:bg-primary/20 focus-visible:border-ring/60"
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

function createBuiltInReference(
  label: string,
  description: string,
  snippets: string[]
): FormulaReferenceItem {
  return {
    category: "built-in",
    description,
    id: `built-in:${label}`,
    label,
    snippets,
    type: "Built-in",
  }
}

function getPropertyReferenceDescription(type: string) {
  if (type === "text") {
    return "Text value that can be formatted, measured, split, or combined."
  }

  if (type === "number") {
    return "Numeric value that can be used in arithmetic and comparisons."
  }

  if (type === "checkbox") {
    return "Boolean value that can drive conditions."
  }

  if (type === "date" || type === "created_time" || type === "edited_time") {
    return "Date value that works with date functions and comparisons."
  }

  if (type === "select" || type === "status" || type === "multi_select") {
    return "Option value that can be checked, counted, or matched."
  }

  return "Database property value available through prop()."
}

function getPropertyReferenceSnippets(type: string, baseSnippet: string) {
  if (type === "text") {
    return [
      baseSnippet,
      `${baseSnippet}.style("b")`,
      `${baseSnippet}.split(" ").at(0)`,
    ]
  }

  if (type === "number") {
    return [baseSnippet, `${baseSnippet} * 2`, `round(${baseSnippet}, 2)`]
  }

  if (type === "checkbox") {
    return [baseSnippet, `not ${baseSnippet}`, `if(${baseSnippet}, "Yes", "No")`]
  }

  if (type === "date" || type === "created_time" || type === "edited_time") {
    return [baseSnippet, `dateBetween(${baseSnippet}, now(), "days")`]
  }

  return [
    baseSnippet,
    `${baseSnippet}.length()`,
    `if(empty(${baseSnippet}), "", ${baseSnippet})`,
  ]
}
