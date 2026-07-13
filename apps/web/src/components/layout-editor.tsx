import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { Check, ChevronDown, LayoutPanelLeft, X } from "lucide-react"
import { toast } from "sonner"

import { LayoutEditorSettings } from "@/components/layout-editor-settings"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Editor } from "@/packages/editor"
import { useDatabase } from "@notelab/features/databases"
import {
  getPageCover,
  getPageEmoji,
  resolvePageFullWidth,
  usePage,
  useResolvedPageLayout,
  useResetPageLayout,
  useSavePageLayout,
  type PageLayoutConfig,
  type PageLayoutScope,
} from "@notelab/features/pages"
import {
  defaultUserSettings,
  useUpdateUserSettings,
  useUserSettings,
} from "@notelab/features/user-settings"

type LayoutEditorTarget = {
  databaseId?: string | null
  pageId?: string | null
}
type LayoutEditorContextValue = {
  openLayoutEditor: (target: LayoutEditorTarget) => void
}

function withoutLayoutFullWidth(config: PageLayoutConfig): PageLayoutConfig {
  const { fullWidth: _fullWidth, ...layoutConfig } = config
  return layoutConfig
}

const LayoutEditorContext = createContext<LayoutEditorContextValue | null>(null)

export function useLayoutEditor() {
  const context = useContext(LayoutEditorContext)
  if (!context) {
    throw new Error("useLayoutEditor must be used inside LayoutEditorProvider")
  }
  return context
}

export function LayoutEditorProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<LayoutEditorTarget | null>(null)
  const openLayoutEditor = useCallback(
    (next: LayoutEditorTarget) => setTarget(next),
    [],
  )
  const value = useMemo(() => ({ openLayoutEditor }), [openLayoutEditor])

  return (
    <LayoutEditorContext.Provider value={value}>
      {children}
      {target ? (
        <LayoutEditor onClose={() => setTarget(null)} target={target} />
      ) : null}
    </LayoutEditorContext.Provider>
  )
}

function LayoutEditor({
  onClose,
  target,
}: {
  onClose: () => void
  target: LayoutEditorTarget
}) {
  const { data: resolved, isLoading } = useResolvedPageLayout(target)
  const databaseId = target.databaseId ?? resolved?.databaseId ?? null
  const pageId = target.pageId ?? resolved?.pageId ?? null
  const { data: databasePayload } = useDatabase(databaseId)
  const { data: page } = usePage(pageId, { refetchOnMount: false })
  const { data: userSettings = defaultUserSettings } = useUserSettings()
  const [draft, setDraft] = useState<PageLayoutConfig | null>(null)
  const saveLayout = useSavePageLayout()
  const resetLayout = useResetPageLayout()
  const updateUserSettings = useUpdateUserSettings()

  useEffect(() => {
    if (resolved?.config) {
      setDraft(structuredClone(withoutLayoutFullWidth(resolved.config)))
    }
  }, [resolved?.config])

  const properties = databasePayload?.properties ?? []
  const previewName =
    page?.name?.trim() || (databaseId ? "Untitled" : "New page")
  const previewIcon = page ? getPageEmoji(page) : null
  const previewCover = page ? getPageCover(page) : null
  const previewWorkspaceId =
    page?.workspaceId ?? databasePayload?.database.workspaceId ?? null
  const fullWidth = resolvePageFullWidth(page, userSettings.pageFullWidth)
  const resolvedConfig = resolved?.config
    ? withoutLayoutFullWidth(resolved.config)
    : null
  const dirty = Boolean(
    draft &&
      resolvedConfig &&
      JSON.stringify(draft) !== JSON.stringify(resolvedConfig),
  )

  const close = () => {
    if (dirty && !window.confirm("Discard your unsaved layout changes?")) return
    onClose()
  }

  const save = async (scope: PageLayoutScope) => {
    if (!draft || !resolved) return
    const scopeId =
      scope === "workspace"
        ? resolved.workspaceId
        : scope === "database"
          ? databaseId
          : pageId
    if (!scopeId) return
    try {
      await saveLayout.mutateAsync({
        config: withoutLayoutFullWidth(draft),
        scope,
        scopeId,
      })
      toast.success(
        scope === "workspace"
          ? "Workspace layout saved."
          : scope === "database"
            ? "Database layout saved."
            : "Page layout saved.",
      )
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save layout.")
    }
  }

  const setFullWidth = (nextFullWidth: boolean) => {
    updateUserSettings.mutate(
      { pageFullWidth: nextFullWidth },
      {
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not update full width setting.",
          )
        },
      },
    )
  }

  const defaultScope: PageLayoutScope = target.databaseId ? "database" : "page"
  const scopeOptions: Array<{ label: string; scope: PageLayoutScope }> = [
    ...(pageId && !target.databaseId
      ? [{ label: "This page", scope: "page" as const }]
      : []),
    ...(databaseId
      ? [
          {
            label: "All pages in this database",
            scope: "database" as const,
          },
        ]
      : []),
    { label: "Workspace default", scope: "workspace" },
  ]

  if (isLoading || !draft || !resolved) {
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-background text-sm text-muted-foreground">
        Loading layout…
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex h-svh flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center border-b px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <LayoutPanelLeft className="size-4" />
          <span className="font-medium">Customize layout</span>
          <span className="truncate text-sm text-muted-foreground">
            Preview: {previewName}
          </span>
        </div>
        <Button onClick={close} variant="ghost">
          <X /> Cancel
        </Button>
        <div className="ml-2 flex">
          <Button
            className="rounded-r-none"
            disabled={saveLayout.isPending}
            onClick={() => save(defaultScope)}
          >
            <Check /> Apply
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="Choose apply scope"
                className="rounded-l-none border-l border-primary-foreground/20 px-2"
              >
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {scopeOptions.map((option) => (
                <DropdownMenuItem
                  key={option.scope}
                  onSelect={() => save(option.scope)}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
              {resolved.sources.generic ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={async () => {
                    const scope = defaultScope
                    const scopeId = scope === "database" ? databaseId : pageId
                    if (!scopeId) return
                    await resetLayout.mutateAsync({ scope, scopeId })
                    toast.success("Layout reset to inherited settings.")
                    onClose()
                  }}
                >
                  Reset to inherited layout
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-hidden bg-background">
          <div className="h-full w-full">
            <Editor
              content={page?.content ?? ""}
              cover={previewCover ?? undefined}
              databaseId={databaseId}
              editable={false}
              emoji={previewIcon ?? undefined}
              fullWidth={fullWidth}
              layoutConfig={draft}
              layoutPreview
              onLayoutChange={setDraft}
              pageId={pageId}
              title={previewName}
              workspaceId={previewWorkspaceId}
            />
          </div>
        </main>

        <LayoutEditorSettings
          draft={draft}
          fullWidth={fullWidth}
          fullWidthPending={updateUserSettings.isPending}
          onChange={setDraft}
          onFullWidthChange={setFullWidth}
          properties={properties}
        />
      </div>
    </div>
  )
}
