import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { Check, ChevronDown, SidebarSimpleIcon, X } from "@/shared/components/icons"
import { toast } from "sonner"

import { LayoutEditorSettings } from "./layout-editor-settings"
import { LayoutApplyDialog } from "@/features/pages/components/layout-apply-dialog"
import { Button } from "@/shared/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { Editor } from "@/packages/editor"
import {
  useDatabase,
  useDatabaseIdForRowPage,
} from "@zilobase/features/databases"
import {
  getPageCover,
  getPageEmoji,
  getPageIconPosition,
  resolvePageFullWidth,
  usePage,
  usePageNavigation,
  useResolvedPageLayout,
  useResetPageLayout,
  useSavePageLayout,
  type PageLayoutConfig,
  type PageLayoutScope,
} from "@zilobase/features/pages"
import {
  defaultUserSettings,
  useUpdateUserSettings,
  useUserSettings,
} from "@zilobase/features/user-settings"

type LayoutEditorTarget = {
  databaseId?: string | null
  pageId?: string | null
}
type LayoutEditorContextValue = {
  openLayoutEditor: (target: LayoutEditorTarget) => void
}

const saveSuccessMessages: Record<PageLayoutScope, string> = {
  database: "Database layout saved.",
  page: "Page layout saved.",
  workspace: "Workspace layout saved.",
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

function PreviewPageDropdown({
  currentPageId,
  loading,
  onSelect,
  pages,
  previewName,
}: {
  currentPageId: string | null | undefined
  loading?: boolean
  onSelect: (pageId: string) => void
  pages: Array<{ id: string; name: string }>
  previewName: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="min-w-0 justify-start gap-2 px-2"
          title={`Preview: ${previewName}`}
          type="button"
          variant="ghost"
        >
          <span className="min-w-0 truncate text-sm font-medium">
            {previewName}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[110] w-72">
        {pages.length ? (
          pages.map((page) => (
            <DropdownMenuItem
              key={page.id}
              onSelect={() => onSelect(page.id)}
            >
              <span className="min-w-0 flex-1 truncate">{page.name}</span>
              {page.id === currentPageId ? <Check className="ml-auto" /> : null}
            </DropdownMenuItem>
          ))
        ) : loading ? (
          <DropdownMenuItem disabled>Loading pages...</DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>No database pages</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
  const pageId = target.pageId ?? resolved?.pageId ?? null
  const cachedRowDatabaseId = useDatabaseIdForRowPage(
    pageId,
    target.databaseId ?? resolved?.databaseId ?? null,
  )
  const [previewPageId, setPreviewPageId] = useState<string | null>(
    pageId ?? null,
  )
  const effectivePreviewPageId = previewPageId ?? pageId
  const { data: page } = usePage(effectivePreviewPageId, {
    refetchOnMount: false,
  })
  const workspaceId = page?.workspaceId ?? resolved?.workspaceId ?? null
  const { data: navigation, isLoading: navigationLoading } =
    usePageNavigation(workspaceId)
  const navigationRowDatabaseId = useMemo(
    () =>
      pageId
        ? (navigation?.placements.find(
            (placement) =>
              placement.parentKind === "database" &&
              placement.itemKind === "page" &&
              placement.itemId === pageId &&
              placement.placementKind === "database_row",
          )?.parentId ?? null)
        : null,
    [navigation?.placements, pageId],
  )
  const databaseId =
    target.databaseId ??
    resolved?.databaseId ??
    cachedRowDatabaseId ??
    navigationRowDatabaseId
  const { data: databasePayload, isLoading: databaseLoading } =
    useDatabase(databaseId)
  const { data: userSettings = defaultUserSettings } = useUserSettings()
  const [draft, setDraft] = useState<PageLayoutConfig | null>(null)
  const [applyDialogOpen, setApplyDialogOpen] = useState(false)
  const saveLayout = useSavePageLayout()
  const resetLayout = useResetPageLayout()
  const updateUserSettings = useUpdateUserSettings()
  const layoutMutationPending = saveLayout.isPending || resetLayout.isPending

  useEffect(() => {
    if (resolved?.config) {
      setDraft(withoutLayoutFullWidth(resolved.config))
    }
  }, [resolved?.config])

  useEffect(() => {
    setPreviewPageId(pageId ?? null)
  }, [pageId])

  const previewName =
    page?.name?.trim() || (databaseId ? "Untitled" : "New page")
  const previewIcon = page ? getPageEmoji(page) : null
  const previewCover = page ? getPageCover(page) : null
  const previewIconPosition = page ? getPageIconPosition(page) : "inline"
  const previewWorkspaceId =
    page?.workspaceId ?? databasePayload?.database.workspaceId ?? null
  const fullWidth = resolvePageFullWidth(page, userSettings.pageFullWidth)
  const previewPages = useMemo(
    () =>
      databasePayload?.rows
        .filter((row) => !row.deletedAt && !row.page.deletedAt)
        .slice()
        .sort((first, second) => first.position - second.position)
        .map((row) => ({
          id: row.pageId,
          name: row.page.name.trim() || "Untitled",
        })) ?? [],
    [databasePayload?.rows],
  )
  const resolvedConfig = useMemo(
    () =>
      resolved?.config ? withoutLayoutFullWidth(resolved.config) : null,
    [resolved?.config],
  )
  const dirty = useMemo(
    () =>
      Boolean(
        draft &&
          resolvedConfig &&
          JSON.stringify(draft) !== JSON.stringify(resolvedConfig),
      ),
    [draft, resolvedConfig],
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
        clearPageOverrides: scope === "database" || undefined,
        config: withoutLayoutFullWidth(draft),
        scope,
        scopeId,
      })
      toast.success(saveSuccessMessages[scope])
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
          <SidebarSimpleIcon className="size-4 text-muted-foreground" />
          <PreviewPageDropdown
            currentPageId={effectivePreviewPageId}
            loading={
              navigationLoading || (Boolean(databaseId) && databaseLoading)
            }
            onSelect={setPreviewPageId}
            pages={previewPages}
            previewName={previewName}
          />
        </div>
        <Button onClick={close} variant="ghost">
          <X /> Cancel
        </Button>
        <div className="ml-2 flex">
          <Button
            className="rounded-r-none"
            disabled={layoutMutationPending}
            onClick={() => setApplyDialogOpen(true)}
          >
            <Check /> Apply
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="Choose apply scope"
                className="rounded-l-none border-l border-primary-foreground px-2"
                disabled={layoutMutationPending}
              >
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[110] w-60">
              <DropdownMenuItem onSelect={() => save("workspace")}>
                Workspace default
              </DropdownMenuItem>
              {resolved.sources.generic ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={async () => {
                    const scope = target.databaseId ? "database" : "page"
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
        <LayoutEditorSettings
          draft={draft}
          fullWidth={fullWidth}
          fullWidthPending={updateUserSettings.isPending}
          onChange={setDraft}
          onDiscussionsVisibleChange={(discussionsVisible) =>
            setDraft((current) =>
              current ? { ...current, discussionsVisible } : current,
            )
          }
          onFullWidthChange={setFullWidth}
        />

        <main className="min-w-0 flex-1 overflow-hidden bg-subtle-surface">
          <div className="h-full w-full">
            <Editor
              content={page?.content ?? ""}
              cover={previewCover ?? undefined}
              databaseId={databaseId}
              editable={false}
              emoji={previewIcon ?? undefined}
              iconPosition={previewIconPosition}
              fullWidth={fullWidth}
              layoutConfig={draft}
              layoutPreview
              onLayoutChange={setDraft}
              pageId={effectivePreviewPageId}
              title={previewName}
              workspaceId={previewWorkspaceId}
            />
          </div>
        </main>
      </div>

      <LayoutApplyDialog
        databaseAvailable={Boolean(databaseId)}
        onApply={(scope) => void save(scope)}
        onOpenChange={setApplyDialogOpen}
        open={applyDialogOpen}
        pageAvailable={Boolean(pageId)}
        pending={saveLayout.isPending}
      />
    </div>
  )
}
