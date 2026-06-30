import { useCallback, useMemo, useState, type ReactNode } from "react"
import {
  ArrowDownToLine,
  ArrowUpRight,
  CalendarRange,
  Check,
  ChevronLeft,
  CircleDashed,
  Database,
  FileText,
  Kanban,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Table2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getColorToken } from "@/lib/color-tokens"
import { cn } from "@/lib/utils"
import {
  useAddDatabaseProperty,
  useDatabase,
  useUpdateDatabase,
} from "@notelab/features/databases"
import { useWorkspaces } from "@notelab/features/workspaces"

import {
  getDatabaseSetupTemplate,
  inferDatabaseSetupTemplateId,
  databaseSetupMoreTemplates,
  databaseSetupSuggestedTemplates,
  type DatabaseSetupTemplate,
  type DatabaseSetupTemplateId,
} from "./database-setup-templates"
import {
  getDatabaseLinkedViews,
  getMergedDatabaseConfig,
  type DatabaseLinkedViewConfig,
} from "./database-view-config"

type SetupView = "main" | "link"

type DatabaseSetupCardProps = {
  databaseId: string
  onComplete: () => void
  onDismiss: () => void
  organizationId?: string | null
  workspaceId?: string | null
}

function SetupSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="database-setup-section-label">{children}</div>
  )
}

function SetupOptionButton({
  children,
  className,
  disabled,
  icon,
  onClick,
  variant = "default",
}: {
  children: ReactNode
  className?: string
  disabled?: boolean
  icon: ReactNode
  onClick: () => void
  variant?: "default" | "subtle"
}) {
  return (
    <button
      className={cn(
        "database-setup-option",
        variant === "subtle" && "database-setup-option-subtle",
        className,
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  )
}

function TemplateIcon({
  colorId,
  icon,
}: {
  colorId: DatabaseSetupTemplate["colorId"]
  icon: ReactNode
}) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md",
        getColorToken(colorId).solidClass,
      )}
    >
      {icon}
    </span>
  )
}

function getTemplateGlyph(template: DatabaseSetupTemplate) {
  switch (template.id) {
    case "tasks-tracker":
      return <Check className="size-4" />
    case "projects":
      return <CircleDashed className="size-4" />
    case "document-hub":
      return <FileText className="size-4" />
    case "content-calendar":
      return <CalendarRange className="size-4" />
    case "meeting-notes":
      return <FileText className="size-4" />
    case "crm":
      return <Database className="size-4" />
    default:
      return <Database className="size-4" />
  }
}

export function DatabaseSetupCard({
  databaseId,
  onComplete,
  onDismiss,
  organizationId,
}: DatabaseSetupCardProps) {
  const [view, setView] = useState<SetupView>("main")
  const [prompt, setPrompt] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showMoreTemplates, setShowMoreTemplates] = useState(false)
  const [linkSearch, setLinkSearch] = useState("")
  const [selectedLinkDatabaseId, setSelectedLinkDatabaseId] = useState<
    string | null
  >(null)

  const addProperty = useAddDatabaseProperty()
  const updateDatabase = useUpdateDatabase()
  const { data: databasePayload } = useDatabase(databaseId)
  const { data: workspaces = [], isLoading: isLoadingWorkspaces } =
    useWorkspaces(organizationId, {
      enabled: view === "link",
    })
  const { data: selectedLinkDatabasePayload, isLoading: isLoadingLinkViews } =
    useDatabase(selectedLinkDatabaseId)

  const linkableDatabases = useMemo(
    () =>
      workspaces.flatMap((workspace) =>
        (workspace.databases ?? [])
          .filter((database) => database.id !== databaseId)
          .map((database) => ({
            database,
            workspaceName: workspace.name.trim() || "Untitled",
          })),
      ),
    [databaseId, workspaces],
  )

  const filteredLinkableDatabases = useMemo(() => {
    const query = linkSearch.trim().toLowerCase()

    if (!query) {
      return linkableDatabases
    }

    return linkableDatabases.filter(({ database, workspaceName }) =>
      `${database.name} ${workspaceName}`.toLowerCase().includes(query),
    )
  }, [linkSearch, linkableDatabases])

  const applyTemplateProperties = useCallback(
    async (
      databaseId: string,
      template: DatabaseSetupTemplate,
      existingPropertyNames: Set<string>,
    ) => {
      for (const property of template.properties) {
        const propertyKey = property.name.toLowerCase()

        if (existingPropertyNames.has(propertyKey)) {
          continue
        }

        await addProperty.mutateAsync({
          config: property.config,
          databaseId,
          name: property.name,
          type: property.type,
        })
        existingPropertyNames.add(propertyKey)
      }
    },
    [addProperty],
  )

  const finishSetup = useCallback(
    async ({
      databaseName,
      linkedView,
      templateId,
    }: {
      databaseName?: string
      linkedView?: DatabaseLinkedViewConfig
      templateId?: DatabaseSetupTemplateId | null
    }) => {
      setIsSubmitting(true)

      try {
        if (linkedView) {
          const linkedDatabaseViews = getDatabaseLinkedViews(
            databasePayload?.database.config,
          )

          await updateDatabase.mutateAsync({
            config: getMergedDatabaseConfig(databasePayload?.database.config, {
              linkedDatabaseViews: [...linkedDatabaseViews, linkedView],
            }),
            databaseId,
          })
        } else if (templateId) {
          const template = getDatabaseSetupTemplate(templateId)

          if (template) {
            if (databaseName && template.name !== databaseName) {
              await updateDatabase.mutateAsync({
                databaseId,
                name: template.name,
              })
            } else if (
              !databaseName &&
              template.name !== databasePayload?.database.name
            ) {
              await updateDatabase.mutateAsync({
                databaseId,
                name: template.name,
              })
            }

            const existingPropertyNames = new Set(
              (databasePayload?.properties ?? []).map((property) =>
                property.property.name.toLowerCase(),
              ),
            )

            await applyTemplateProperties(
              databaseId,
              template,
              existingPropertyNames,
            )
          }
        } else if (databaseName && databaseName !== databasePayload?.database.name) {
          await updateDatabase.mutateAsync({
            databaseId,
            name: databaseName,
          })
        }

        onComplete()
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Database setup failed."

        toast.error("Couldn't update database", { description: message })
      } finally {
        setIsSubmitting(false)
      }
    },
    [
      applyTemplateProperties,
      databaseId,
      databasePayload,
      onComplete,
      updateDatabase,
    ],
  )

  const handlePromptSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const nextPrompt = message.text.trim()

      if (!nextPrompt || isSubmitting) {
        return
      }

      const templateId = inferDatabaseSetupTemplateId(nextPrompt)
      const databaseName =
        nextPrompt.length > 48 ? `${nextPrompt.slice(0, 45).trim()}...` : nextPrompt

      await finishSetup({
        databaseName,
        templateId,
      })
    },
    [finishSetup, isSubmitting],
  )

  const handleLinkView = useCallback(
    async (linkedView: DatabaseLinkedViewConfig) => {
      await finishSetup({ linkedView })
    },
    [finishSetup],
  )

  const renderTemplateButton = (template: DatabaseSetupTemplate) => (
    <SetupOptionButton
      disabled={isSubmitting}
      icon={
        <TemplateIcon
          colorId={template.colorId}
          icon={getTemplateGlyph(template)}
        />
      }
      key={template.id}
      onClick={() =>
        void finishSetup({
          databaseName: template.name,
          templateId: template.id,
        })
      }
    >
      {template.name}
    </SetupOptionButton>
  )

  const renderMainContent = () => (
    <div className="database-setup-columns">
      <div className="database-setup-column database-setup-column-primary">
        <div className="database-setup-prompt">
          <div className="database-setup-prompt-label">
            <Sparkles className="size-3.5" />
            <span>Describe what you want to build</span>
          </div>
          <PromptInput
            className="database-setup-prompt-form"
            inputGroupClassName="h-auto items-stretch overflow-visible focus-within:border-input focus-within:ring-0 has-[[data-slot=input-group-control]:focus-visible]:border-input has-[[data-slot=input-group-control]:focus-visible]:ring-0"
            onSubmit={handlePromptSubmit}
          >
            <div className="relative w-full min-w-0 flex-1 self-stretch">
              <PromptInputTextarea
                autoFocus
                className="database-setup-prompt-textarea"
                disabled={isSubmitting}
                onChange={(event) => setPrompt(event.currentTarget.value)}
                placeholder="Describe what you want to build..."
                value={prompt}
              />
            </div>
            <PromptInputFooter>
              <div />
              <PromptInputSubmit
                disabled={!prompt.trim() || isSubmitting}
                status={isSubmitting ? "submitted" : undefined}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
        <div className="database-setup-actions">
          <SetupOptionButton
            disabled={isSubmitting}
            icon={
              <span className="database-setup-option-icon">
                <Plus className="size-4" />
              </span>
            }
            onClick={onDismiss}
          >
            New empty data source
          </SetupOptionButton>
          <SetupOptionButton
            disabled={isSubmitting}
            icon={
              <span className="database-setup-option-icon">
                <ArrowDownToLine className="size-4" />
              </span>
            }
            onClick={() =>
              toast.message("CSV import is coming soon", {
                description: "Use a template or empty data source for now.",
              })
            }
          >
            Import CSV
          </SetupOptionButton>
        </div>
      </div>
      <div className="database-setup-column database-setup-column-suggested">
        <SetupSectionLabel>Suggested</SetupSectionLabel>
        <div className="database-setup-suggested-list">
          {databaseSetupSuggestedTemplates.map(renderTemplateButton)}
          {showMoreTemplates
            ? databaseSetupMoreTemplates.map(renderTemplateButton)
            : null}
          <SetupOptionButton
            disabled={isSubmitting}
            icon={
              <span className="database-setup-option-icon">
                <MoreHorizontal className="size-4" />
              </span>
            }
            onClick={() => setShowMoreTemplates((current) => !current)}
            variant="subtle"
          >
            {showMoreTemplates ? "Fewer templates" : "More templates"}
          </SetupOptionButton>
        </div>
        <div className="database-setup-link-action">
          <SetupOptionButton
            disabled={isSubmitting}
            icon={
              <span className="database-setup-option-icon">
                <ArrowUpRight className="size-4" />
              </span>
            }
            onClick={() => {
              setView("link")
              setSelectedLinkDatabaseId(null)
              setLinkSearch("")
            }}
          >
            Link to existing data source
          </SetupOptionButton>
        </div>
      </div>
    </div>
  )

  const renderLinkPicker = () => {
    if (selectedLinkDatabaseId) {
      const views = selectedLinkDatabasePayload?.views ?? []
      const databaseName =
        selectedLinkDatabasePayload?.database.name ??
        linkableDatabases.find(
          (item) => item.database.id === selectedLinkDatabaseId,
        )?.database.name ??
        "Untitled database"

      return (
        <div className="space-y-2 px-1 pb-1">
          <SetupOptionButton
            icon={<ChevronLeft className="size-4 text-muted-foreground" />}
            onClick={() => setSelectedLinkDatabaseId(null)}
          >
            Back
          </SetupOptionButton>
          <div className="px-2 text-muted-foreground text-xs">{databaseName}</div>
          {isLoadingLinkViews ? (
            <div className="flex items-center justify-center gap-2 px-2 py-8 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading views...
            </div>
          ) : views.length === 0 ? (
            <div className="px-2 py-8 text-center text-muted-foreground text-sm">
              No views available.
            </div>
          ) : (
            views.map((viewItem) => {
              const ViewIcon =
                viewItem.type === "kanban"
                  ? Kanban
                  : viewItem.type === "timeline"
                    ? CalendarRange
                    : Table2

              return (
                <SetupOptionButton
                  disabled={isSubmitting}
                  icon={
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
                      <ViewIcon className="size-4" />
                    </span>
                  }
                  key={viewItem.id}
                  onClick={() =>
                    void handleLinkView({
                      databaseId: selectedLinkDatabaseId,
                      databaseName,
                      viewId: viewItem.id,
                      viewName: viewItem.name,
                      viewType: viewItem.type,
                    })
                  }
                >
                  {viewItem.name}
                </SetupOptionButton>
              )
            })
          )}
        </div>
      )
    }

    return (
      <div className="space-y-2 px-1 pb-1">
        <SetupOptionButton
          icon={<ChevronLeft className="size-4 text-muted-foreground" />}
          onClick={() => {
            setView("main")
            setSelectedLinkDatabaseId(null)
            setLinkSearch("")
          }}
        >
          Back
        </SetupOptionButton>
        <div className="px-1">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              onChange={(event) => setLinkSearch(event.currentTarget.value)}
              placeholder="Search databases..."
              value={linkSearch}
            />
          </div>
        </div>
        {isLoadingWorkspaces ? (
          <div className="flex items-center justify-center gap-2 px-2 py-8 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" />
            Loading databases...
          </div>
        ) : filteredLinkableDatabases.length === 0 ? (
          <div className="px-2 py-8 text-center text-muted-foreground text-sm">
            No databases available.
          </div>
        ) : (
          filteredLinkableDatabases.map(({ database, workspaceName }) => (
            <SetupOptionButton
              disabled={isSubmitting}
              icon={
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
                  <Database className="size-4" />
                </span>
              }
              key={database.id}
              onClick={() => setSelectedLinkDatabaseId(database.id)}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{database.name}</span>
                <span className="truncate text-muted-foreground text-xs">
                  {workspaceName}
                </span>
              </span>
            </SetupOptionButton>
          ))
        )}
      </div>
    )
  }

  return (
    <div className="database-setup-overlay">
      <div className="database-setup-card">
        <Button
          aria-label="Close database setup"
          className="database-setup-close"
          onClick={onDismiss}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
        {view === "main" ? renderMainContent() : renderLinkPicker()}
        {isSubmitting ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/70 backdrop-blur-[1px]">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : null}
      </div>
    </div>
  )
}