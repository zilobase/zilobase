import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CalendarRange,
  Check,
  ChevronLeft,
  CircleDashed,
  Database,
  FileText,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  X,
} from "@/shared/components/icons";
import { toast } from "sonner";

import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/features/ai/components/elements/index";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { getIconSolidClassName } from "@/shared/lib/color-tokens";
import { DEFAULT_DATABASE_ITEM_ICON } from "@/features/pages/index";
import { getDatabaseIconNode, PageIconDisplay } from "@/features/pages/index";
import { cn } from "@/shared/lib/utils";
import posthog from "@/shared/lib/posthog";
import {
  useApplyDatabaseTemplate,
  useDatabase,
  useLinkDatabaseDataSource,
  useUpdateDataSource,
} from "@zilobase/features/databases";
import { usePageNavigation } from "@zilobase/features/pages";

import {
  getDatabaseSetupTemplate,
  inferDatabaseSetupTemplateId,
  databaseSetupMoreTemplates,
  databaseSetupSuggestedTemplates,
  type DatabaseSetupTemplate,
  type DatabaseSetupTemplateId,
} from "../model/database-setup-templates";
import {
  getDatabaseSetupDismissed,
  getDatabaseViewIcon,
  getMergedDatabaseConfig,
} from "../../views/model/database-view-config";
import type { DatabaseSourceViewSelection } from "../../views/model/database-view-context";
import { ViewTypeOptionGrid } from "../../views/view-settings/view/view-type-option-grid";
import {
  getDatabaseViewTypePresentation,
  type DatabaseViewType,
} from "../../views/view-settings/model/view-type-options";
import { serializePropertyValue } from "../../core/database-property-values";

type SetupView = "main" | "link";

function captureDatabaseSetupCompleted(selection: DatabaseSetupSelection) {
  posthog?.capture("database_setup_completed", {
    setup_method: selection.sourceView
      ? "linked_data_source"
      : selection.csvImport
        ? "csv_import"
        : selection.templateId
          ? "template"
          : "guided",
  });
}

type DatabaseSetupCardProps = {
  databaseId: string;
  excludedDatabaseIds?: string[];
  onComplete: () => void;
  onDismiss: () => void;
  onSelectDataSource?: (selection: DatabaseSetupSelection) => Promise<void>;
  workspaceId?: string | null;
  pageId?: string | null;
};

export type DatabaseSetupSelection = {
  csvImport?: {
    headers: string[];
    name: string;
    rows: string[][];
  };
  databaseName?: string;
  sourceView?: DatabaseSourceViewSelection;
  templateId?: DatabaseSetupTemplateId | null;
};

function parseCsv(text: string) {
  const records: string[][] = [];
  let field = "";
  let quoted = false;
  let record: string[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.replace(/\r$/, ""));
      if (record.some((value) => value.length > 0)) records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  record.push(field.replace(/\r$/, ""));
  if (record.some((value) => value.length > 0)) records.push(record);

  return {
    headers: (records[0] ?? []).map((value, index) =>
      value.trim() || (index === 0 ? "Name" : `Column ${index + 1}`),
    ),
    rows: records.slice(1),
  };
}

type TextNode = {
  type: "text";
  text: string;
};

type ContentNode = {
  attrs?: Record<string, unknown>;
  content?: Array<ContentNode | TextNode>;
  type: string;
};

function createTextNode(text: string): TextNode {
  return {
    type: "text",
    text,
  };
}

function createParagraphNode(text: string): ContentNode {
  return {
    type: "paragraph",
    ...(text ? { content: [createTextNode(text)] } : {}),
  };
}

function createHeadingNode(text: string, level: number): ContentNode {
  return {
    type: "heading",
    attrs: { level },
    content: [createTextNode(`${getSampleHeadingEmoji(text, level)} ${text}`)],
  };
}

function getSampleHeadingEmoji(text: string, level: number) {
  const normalized = text.toLowerCase();

  if (
    /checklist|next steps|action items|follow-up|send checklist/.test(
      normalized,
    )
  ) {
    return "✅";
  }

  if (/risk|blocker|difficult/.test(normalized)) {
    return "⚠️";
  }

  if (/goal|objective|purpose|campaign/.test(normalized)) {
    return "🎯";
  }

  if (/summary|overview|context|status/.test(normalized)) {
    return "📌";
  }

  if (/metric|criteria|proof|success/.test(normalized)) {
    return "📈";
  }

  if (/link|asset|input|channel|stakeholder|contact/.test(normalized)) {
    return "🔗";
  }

  if (/question|open/.test(normalized)) {
    return "❓";
  }

  if (/decision|requirement|scope|non-goal/.test(normalized)) {
    return "🧭";
  }

  if (/note|observation|feedback|research|interview/.test(normalized)) {
    return "📝";
  }

  return level === 1 ? "✨" : "📍";
}

function createListItemNode(text: string): ContentNode {
  return {
    type: "listItem",
    content: [createParagraphNode(text)],
  };
}

function createTaskItemNode(text: string, checked: boolean): ContentNode {
  return {
    type: "taskItem",
    attrs: { checked },
    content: [createParagraphNode(text)],
  };
}

export function createSampleRowContent(markdown: string) {
  const content: ContentNode[] = [];
  const lines = markdown.trim().split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);

    if (heading) {
      content.push(createHeadingNode(heading[2], heading[1].length));
      continue;
    }

    if (line.startsWith("> ")) {
      content.push({
        type: "blockquote",
        content: [createParagraphNode(line.slice(2).trim())],
      });
      continue;
    }

    const task = /^-\s+\[( |x|X)\]\s+(.+)$/.exec(line);

    if (task) {
      const items: ContentNode[] = [];

      while (index < lines.length) {
        const nextTask = /^-\s+\[( |x|X)\]\s+(.+)$/.exec(
          (lines[index] ?? "").trim(),
        );

        if (!nextTask) {
          index -= 1;
          break;
        }

        items.push(
          createTaskItemNode(nextTask[2], nextTask[1].toLowerCase() === "x"),
        );
        index += 1;
      }

      content.push({ type: "taskList", content: items });
      continue;
    }

    if (line.startsWith("- ")) {
      const items: ContentNode[] = [];

      while (index < lines.length) {
        const nextLine = (lines[index] ?? "").trim();

        if (
          !nextLine.startsWith("- ") ||
          /^-\s+\[( |x|X)\]\s+/.test(nextLine)
        ) {
          index -= 1;
          break;
        }

        items.push(createListItemNode(nextLine.slice(2).trim()));
        index += 1;
      }

      content.push({ type: "bulletList", content: items });
      continue;
    }

    content.push(createParagraphNode(line));
  }

  return {
    type: "doc",
    content,
  };
}

function getPageMetadataWithEmoji(metadata: unknown, emoji: string) {
  return {
    ...(metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata
      : {}),
    emoji,
  };
}

function SetupSectionLabel({ children }: { children: ReactNode }) {
  return <div className="database-setup-section-label">{children}</div>;
}

function SetupOptionButton({
  children,
  className,
  disabled,
  icon,
  onClick,
  variant = "default",
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  icon: ReactNode;
  onClick: () => void;
  variant?: "default" | "subtle";
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
  );
}

function TemplateIcon({
  colorId,
  icon,
}: {
  colorId: DatabaseSetupTemplate["colorId"];
  icon: ReactNode;
}) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md",
        getIconSolidClassName(colorId),
      )}
    >
      {icon}
    </span>
  );
}

function getTemplateGlyph(template: DatabaseSetupTemplate) {
  switch (template.id) {
    case "tasks-tracker":
      return <Check className="size-4" />;
    case "projects":
      return <CircleDashed className="size-4" />;
    case "document-hub":
      return <FileText className="size-4" />;
    case "content-calendar":
      return <CalendarRange className="size-4" />;
    case "meeting-notes":
      return <FileText className="size-4" />;
    case "crm":
      return <Database className="size-4" />;
    default:
      return <Database className="size-4" />;
  }
}

export function DatabaseSetupCard({
  databaseId,
  excludedDatabaseIds = [],
  onComplete,
  onDismiss,
  onSelectDataSource,
  workspaceId,
}: DatabaseSetupCardProps) {
  const [view, setView] = useState<SetupView>("main");
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMoreTemplates, setShowMoreTemplates] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [selectedLinkDatabaseId, setSelectedLinkDatabaseId] = useState<
    string | null
  >(null);
  const [creatingLinkView, setCreatingLinkView] = useState(false);
  const [linkViewName, setLinkViewName] = useState("");

  const applyTemplate = useApplyDatabaseTemplate();
  const updateDatabase = useUpdateDataSource();
  const linkDatabaseDataSource = useLinkDatabaseDataSource();
  const { data: databasePayload } = useDatabase(databaseId);
  const { data: navigation, isLoading: isLoadingPages } = usePageNavigation(
    workspaceId,
    {
      enabled: view === "link",
    },
  );
  const { data: selectedLinkDatabasePayload, isLoading: isLoadingLinkViews } =
    useDatabase(selectedLinkDatabaseId);
  const dismissSetup = useCallback(async () => {
    if (
      databasePayload &&
      databasePayload.activeDataSource &&
      !getDatabaseSetupDismissed(databasePayload.activeDataSource.config)
    ) {
      await updateDatabase.mutateAsync({
        config: getMergedDatabaseConfig(
          databasePayload.activeDataSource.config,
          {
          setupDismissed: true,
          },
        ),
        databaseId: databasePayload.activeDataSource.id,
      });
    }

    onDismiss();
  }, [databaseId, databasePayload, onDismiss, updateDatabase]);

  const linkableDatabases = useMemo(() => {
    const excludedIds = new Set([databaseId, ...excludedDatabaseIds]);
    const pagesById = new Map(
      (navigation?.pages ?? []).map((page) => [page.id, page]),
    );

    return (navigation?.databases ?? [])
      .filter((database) => !excludedIds.has(database.id))
      .map((database) => ({
        database,
        pageName: database.pageId
          ? pagesById.get(database.pageId)?.name.trim() || "Untitled"
          : "Standalone",
      }));
  }, [databaseId, excludedDatabaseIds, navigation]);

  const filteredLinkableDatabases = useMemo(() => {
    const query = linkSearch.trim().toLowerCase();

    if (!query) {
      return linkableDatabases;
    }

    return linkableDatabases.filter(({ database, pageName }) =>
      `${database.name} ${pageName}`.toLowerCase().includes(query),
    );
  }, [linkSearch, linkableDatabases]);

  const finishSetup = useCallback(
    async ({
      csvImport,
      databaseName,
      sourceView,
      templateId,
    }: DatabaseSetupSelection) => {
      setIsSubmitting(true);

      try {
        if (onSelectDataSource) {
          await onSelectDataSource({
            csvImport,
            databaseName,
            sourceView,
            templateId,
          });
          captureDatabaseSetupCompleted({
            csvImport,
            databaseName,
            sourceView,
            templateId,
          });
          onComplete();
          return;
        }

        const activeDataSource = databasePayload?.activeDataSource;

        if (!activeDataSource) {
          throw new Error("Database has no active data source.");
        }

        let setupDismissedPersisted = false;

        if (sourceView) {
          await linkDatabaseDataSource.mutateAsync({
            databaseId,
            config: sourceView.viewConfig,
            dataSourceId: sourceView.dataSourceId,
            name: sourceView.viewName,
            type: sourceView.viewType,
          });
          await updateDatabase.mutateAsync({
            config: getMergedDatabaseConfig(activeDataSource.config, {
              setupDismissed: true,
            }),
            databaseId: activeDataSource.id,
          });
          setupDismissedPersisted = true;
        } else if (csvImport) {
          await applyTemplate.mutateAsync({
            config: getMergedDatabaseConfig(activeDataSource.config, {
              setupDismissed: true,
            }),
            databaseId: activeDataSource.id,
            name: csvImport.name,
            properties: csvImport.headers.slice(1).map((name) => ({
              name,
              type: "text",
            })),
            rows: csvImport.rows.map((row, rowIndex) => ({
              title: row[0]?.trim() || `Row ${rowIndex + 1}`,
              values: csvImport.headers.slice(1).map((propertyName, index) => ({
                propertyName,
                value: serializePropertyValue("text", row[index + 1] ?? ""),
              })),
            })),
          });
          setupDismissedPersisted = true;
        } else if (templateId) {
          const template = getDatabaseSetupTemplate(templateId);

          if (template) {
            const nextDatabasePatch: {
              config: unknown;
              databaseId: string;
              name?: string;
            } = {
              config: getMergedDatabaseConfig(
                activeDataSource.config,
                {
                  emoji: template.emoji,
                  setupDismissed: true,
                },
              ),
              databaseId: activeDataSource.id,
            };

            if (template.name !== databasePayload?.database.name) {
              nextDatabasePatch.name = template.name;
            }

            const propertyTypesByName = new Map(
              (databasePayload?.properties ?? []).map((property) => [
                property.property.name.toLowerCase(),
                property.property.type,
              ]),
            );

            for (const property of template.properties) {
              const propertyKey = property.name.toLowerCase();

              if (!propertyTypesByName.has(propertyKey)) {
                propertyTypesByName.set(propertyKey, property.type);
              }
            }

            await applyTemplate.mutateAsync({
              config: nextDatabasePatch.config,
              databaseId: activeDataSource.id,
              name: nextDatabasePatch.name ?? template.name,
              properties: template.properties,
              rows: template.sampleRows.map((sampleRow) => ({
                content: createSampleRowContent(sampleRow.content),
                metadata: getPageMetadataWithEmoji(null, sampleRow.emoji),
                title: sampleRow.title,
                values: Object.entries(sampleRow.values ?? {}).flatMap(
                  ([propertyName, value]) => {
                    const propertyType = propertyTypesByName.get(
                      propertyName.toLowerCase(),
                    );

                    return propertyType
                      ? [
                          {
                            propertyName,
                            value: serializePropertyValue(propertyType, value),
                          },
                        ]
                      : [];
                  },
                ),
              })),
            });
            setupDismissedPersisted = true;
          }
        } else if (
          databaseName &&
          databaseName !== activeDataSource.name
        ) {
          await updateDatabase.mutateAsync({
            databaseId: activeDataSource.id,
            name: databaseName,
          });
        }

        captureDatabaseSetupCompleted({
          csvImport,
          databaseName,
          sourceView,
          templateId,
        });
        if (setupDismissedPersisted) {
          onDismiss();
        } else {
          await dismissSetup();
        }
        onComplete();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Database setup failed.";

        toast.error("Couldn't update database", { description: message });
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      applyTemplate,
      databaseId,
      databasePayload,
      dismissSetup,
      onComplete,
      onDismiss,
      onSelectDataSource,
      updateDatabase,
    ],
  );

  const handlePromptSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const nextPrompt = message.text.trim();

      if (!nextPrompt || isSubmitting) {
        return;
      }

      const templateId = inferDatabaseSetupTemplateId(nextPrompt);
      const databaseName =
        nextPrompt.length > 48
          ? `${nextPrompt.slice(0, 45).trim()}...`
          : nextPrompt;

      await finishSetup({
        databaseName,
        templateId,
      });
    },
    [finishSetup, isSubmitting],
  );

  const handleLinkView = useCallback(
    async (sourceView: DatabaseSourceViewSelection) => {
      await finishSetup({ sourceView });
    },
    [finishSetup],
  );

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
  );

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
            inputGroupClassName="h-auto items-stretch overflow-visible border-stroke-default focus-within:border-stroke-default focus-within:ring-0 has-[[data-slot=input-group-control]:focus-visible]:border-stroke-default has-[[data-slot=input-group-control]:focus-visible]:ring-0"
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
            onClick={() => {
              if (onSelectDataSource) {
                void finishSetup({ databaseName: "New data source" });
                return;
              }

              onDismiss();
            }}
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
            onClick={() => csvInputRef.current?.click()}
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
              setView("link");
              setSelectedLinkDatabaseId(null);
              setCreatingLinkView(false);
              setLinkViewName("");
              setLinkSearch("");
            }}
          >
            Link to existing data source
          </SetupOptionButton>
        </div>
      </div>
    </div>
  );

  const renderLinkPicker = () => {
    if (selectedLinkDatabaseId) {
      const sourceDataSourceId =
        selectedLinkDatabasePayload?.activeDataSource?.id;
      const views =
        selectedLinkDatabasePayload?.views.filter(
          (viewItem) =>
            !sourceDataSourceId || viewItem.dataSourceId === sourceDataSourceId,
        ) ?? [];
      const databaseName =
        selectedLinkDatabasePayload?.database.name ??
        linkableDatabases.find(
          (item) => item.database.id === selectedLinkDatabaseId,
        )?.database.name ??
        "Untitled database";

      if (creatingLinkView && sourceDataSourceId) {
        return (
          <div className="space-y-3 px-3 py-3 pr-12">
            <SetupOptionButton
              icon={<ChevronLeft className="size-4 text-content-secondary" />}
              onClick={() => {
                setCreatingLinkView(false);
                setLinkViewName("");
              }}
            >
              Choose another view
            </SetupOptionButton>
            <Input
              aria-label="Linked view name"
              autoFocus
              onChange={(event) => setLinkViewName(event.currentTarget.value)}
              placeholder="View name"
              value={linkViewName}
            />
            <ViewTypeOptionGrid
              className="p-0"
              onSelect={(type: DatabaseViewType) => {
                const { label } = getDatabaseViewTypePresentation(type);

                void handleLinkView({
                  dataSourceId: sourceDataSourceId,
                  dataSourceName:
                    selectedLinkDatabasePayload.activeDataSource?.name ||
                    databaseName,
                  parentDatabaseId: selectedLinkDatabaseId,
                  viewId: `new-${type}`,
                  viewName: linkViewName.trim() || label,
                  viewType: type,
                });
              }}
            />
          </div>
        );
      }

      return (
        <div className="flex max-h-[min(32rem,calc(100vh-5rem))] min-h-0 flex-col px-1 pb-1">
          <SetupOptionButton
            icon={<ChevronLeft className="size-4 text-content-secondary" />}
            onClick={() => {
              setSelectedLinkDatabaseId(null);
              setCreatingLinkView(false);
              setLinkViewName("");
            }}
          >
            Back
          </SetupOptionButton>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <SetupOptionButton
              disabled={!sourceDataSourceId || isSubmitting}
              icon={
                <span className="database-setup-option-icon">
                  <Plus className="size-4" />
                </span>
              }
              onClick={() => setCreatingLinkView(true)}
            >
              Create a new view
            </SetupOptionButton>
            <div className="px-2 pt-3 text-content-secondary text-xs">
              Views on {databaseName}
            </div>
            {isLoadingLinkViews ? (
              <div className="flex items-center justify-center gap-2 px-2 py-8 text-content-secondary text-sm">
                <Loader2 className="size-4 animate-spin" />
                Loading views...
              </div>
            ) : views.length === 0 ? (
              <div className="px-2 py-8 text-center text-content-secondary text-sm">
                No existing views.
              </div>
            ) : (
              views.map((viewItem) => {
                const { Icon: ViewIcon } = getDatabaseViewTypePresentation(
                  viewItem.type,
                );

                return (
                  <SetupOptionButton
                    disabled={isSubmitting}
                    icon={
                      <span className="database-setup-option-icon">
                        <ViewIcon className="size-4" />
                      </span>
                    }
                    key={viewItem.id}
                    onClick={() =>
                      void handleLinkView({
                        dataSourceId: viewItem.dataSourceId,
                        dataSourceName: databaseName,
                        parentDatabaseId: selectedLinkDatabaseId,
                        viewConfig: viewItem.config,
                        viewIcon: getDatabaseViewIcon(viewItem.config),
                        viewId: viewItem.id,
                        viewName: viewItem.name,
                        viewType: viewItem.type,
                      })
                    }
                  >
                    {viewItem.name}
                  </SetupOptionButton>
                );
              })
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex max-h-[min(32rem,calc(100vh-5rem))] min-h-0 flex-col overflow-hidden px-1 pb-1">
        <div className="shrink-0 space-y-2 bg-surface-card">
          <SetupOptionButton
            icon={<ChevronLeft className="size-4 text-content-secondary" />}
            onClick={() => {
              setView("main");
              setSelectedLinkDatabaseId(null);
              setCreatingLinkView(false);
              setLinkViewName("");
              setLinkSearch("");
            }}
          >
            Back
          </SetupOptionButton>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-content-secondary" />
            <Input
              className="h-9 pl-8"
              onChange={(event) => setLinkSearch(event.currentTarget.value)}
              placeholder="Search databases..."
              value={linkSearch}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-2">
          {isLoadingPages ? (
            <div className="flex items-center justify-center gap-2 px-2 py-8 text-content-secondary text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading databases...
            </div>
          ) : filteredLinkableDatabases.length === 0 ? (
            <div className="px-2 py-8 text-center text-content-secondary text-sm">
              No databases available.
            </div>
          ) : (
            filteredLinkableDatabases.map(({ database, pageName }) => (
              <SetupOptionButton
                disabled={isSubmitting}
                icon={
                  getDatabaseIconNode(database) ?? (
                    <PageIconDisplay
                      size="sm"
                      value={DEFAULT_DATABASE_ITEM_ICON}
                    />
                  )
                }
                key={database.id}
                onClick={() => setSelectedLinkDatabaseId(database.id)}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{database.name}</span>
                  <span className="truncate text-content-secondary text-xs">
                    {pageName}
                  </span>
                </span>
              </SetupOptionButton>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="database-setup-overlay">
      <div className="database-setup-card">
        <input
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;

            void file
              .text()
              .then((text) => {
                const csv = parseCsv(text);
                if (csv.headers.length === 0) {
                  toast.error("The CSV file has no columns.");
                  return;
                }

                const name =
                  file.name.replace(/\.csv$/i, "").trim() || "Imported data";
                void finishSetup({
                  csvImport: { ...csv, name },
                  databaseName: name,
                });
              })
              .catch(() => toast.error("The CSV file could not be read."));
          }}
          ref={csvInputRef}
          type="file"
        />
        <Button
          aria-label="Close database setup"
          className="database-setup-close"
          onClick={() => {
            if (onSelectDataSource) {
              onDismiss();
              return;
            }

            void dismissSetup();
          }}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
        {view === "main" ? renderMainContent() : renderLinkPicker()}
        {isSubmitting ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-effect-backdrop backdrop-blur-[1px]">
            <Loader2 className="size-5 animate-spin text-content-secondary" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
