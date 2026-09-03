import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  AutomationJsonValue,
  AutomationTriggerOperand,
  DatabaseAutomationCatalog,
  DatabaseAutomationDefinition,
  DatabaseAutomationEventTriggerClause,
  DatabaseAutomationTriggerOperator,
} from "@zilobase/features/databases/automations";
import {
  useCreateDatabaseAutomation,
  useCreateDatabaseAutomationSecret,
  useDatabaseAutomation,
  useDatabaseAutomationCatalog,
  useDatabaseAutomationLifecycle,
  useDatabaseAutomationRun,
  useDatabaseAutomationRuns,
  useDatabaseAutomations,
  useStartSlackAutomationOauth,
  useUpdateDatabaseAutomation,
  useValidateDatabaseAutomation,
} from "@zilobase/features/databases/automations/react";
import {
  TriangleAlertIcon,
  ArrowLeft,
  Check,
  ChevronDownIcon,
  Clock,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "@/shared/components/icons";

import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/shared/ui/command";
import { Input } from "@/shared/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerTrigger,
} from "@/shared/ui/dropdrawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover";
import { cn } from "@/shared/lib/utils";
import { getColorTokenBadgeClassName } from "@/shared/lib/color-tokens";
import { PageIconDisplay } from "@/features/pages/index";

import { getDatabasePropertyType } from "../core/database-property-types";
import {
  DatabaseConditionValueControl,
  type DatabaseCondition,
} from "../views/view/database-condition-editor";
import type { DatabasePropertyFilterOperator } from "../views/model/database-view-config";
import { DatabaseViewToolbarButton } from "../views/view/database-view-toolbar-button";
import {
  actionForDefinition,
  createNotionActionDraft,
  NOTION_ACTION_OPTIONS,
  NotionActionEditor,
  notionActionDraftFromAction,
  notionActionLabel,
  resolveWebhookHeader,
  type NotionActionDraft,
} from "./notion-action-builder";

import {
  AutomationList,
  ManagerHeader,
  PanelMessage,
  RunDetail,
  RunList,
} from "./database-automation-screens"

import { AutomationSelect } from "./automation-select"
import {
  ScheduleEditor,
  scheduleDefinition,
  scheduleDraft,
  scheduleTriggerLabel,
  type ScheduleDraft,
} from "./automation-schedule"
type Screen = "builder" | "list" | "run" | "runs";
const automationMenuItemClassName = "min-h-9 px-2 py-2 text-[13px]";
type TriggerDraft = {
  id: string;
  operands: string[];
  operator: DatabaseAutomationTriggerOperator;
  propertyId: string;
  type: "page_added" | "property_edited";
};
type TriggerPickerSelection =
  | { type: "page_added" }
  | {
      operands?: string[];
      operator?: DatabaseAutomationTriggerOperator;
      propertyId: string;
      type: "property_edited";
    }
  | { type: "schedule" };
type EventTriggerPickerSelection = Exclude<TriggerPickerSelection, { type: "schedule" }>;
type BuilderDraft = {
  actions: NotionActionDraft[];
  customName: boolean;
  match: "all" | "any";
  name: string;
  schedule: ScheduleDraft;
  scopeViewId: string;
  triggerKind: "event" | "schedule";
  triggers: TriggerDraft[];
};


const operandless = new Set<DatabaseAutomationTriggerOperator>([
  "is_checked",
  "is_empty",
  "is_not_empty",
  "is_unchecked",
  "was_edited",
]);

export function DatabaseAutomationManager({
  dataSourceId,
  databaseId,
  dataSourceName,
  open,
  onOpenChange,
  timezone,
}: {
  dataSourceId: string;
  databaseId: string;
  dataSourceName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timezone: string;
}) {
  const [screen, setScreen] = useState<Screen>("list");
  const [selectedAutomationId, setSelectedAutomationId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BuilderDraft>(() => emptyDraft());
  const [baseline, setBaseline] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const list = useDatabaseAutomations(databaseId, dataSourceId);
  const catalog = useDatabaseAutomationCatalog(databaseId, dataSourceId);
  const detail = useDatabaseAutomation(databaseId, selectedAutomationId ?? "");
  const runs = useDatabaseAutomationRuns(databaseId, selectedAutomationId ?? "");
  const run = useDatabaseAutomationRun(databaseId, selectedAutomationId ?? "", selectedRunId ?? "");
  const create = useCreateDatabaseAutomation(databaseId, dataSourceId);
  const createSecret = useCreateDatabaseAutomationSecret(databaseId, dataSourceId);
  const startSlackOauth = useStartSlackAutomationOauth(databaseId, dataSourceId);
  const update = useUpdateDatabaseAutomation(databaseId, selectedAutomationId ?? "");
  const lifecycle = useDatabaseAutomationLifecycle(databaseId, dataSourceId);
  const validate = useValidateDatabaseAutomation(databaseId);
  const definition = useMemo(
    () => buildDefinition(draft, timezone, catalog.data),
    [catalog.data, draft, timezone],
  );
  const generatedName = generateName(draft, catalog.data);
  const dirty = screen === "builder" && JSON.stringify(draft) !== baseline;
  const effectiveName = draft.customName ? draft.name.trim() : generatedName;

  useEffect(() => {
    if (!definition || screen !== "builder") return;
    const timeout = window.setTimeout(() => {
      validate.mutate({ dataSourceId, definition });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [dataSourceId, definition, screen]);

  useEffect(() => {
    if (screen !== "builder" || !selectedAutomationId || !detail.data) return;
    const next = draftFromDefinition(detail.data.name, detail.data.definition);
    setDraft(next);
    setBaseline(JSON.stringify(next));
  }, [catalog.data, dataSourceId, detail.data, screen, selectedAutomationId]);

  const closeEditor = () => {
    setScreen("list");
    setSelectedAutomationId(null);
  };
  const requestEditorClose = () => {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    closeEditor();
  };
  const requestBack = () => {
    setScreen(screen === "run" ? "runs" : "list");
  };
  const startCreate = () => {
    const next = emptyDraft();
    setSelectedAutomationId(null);
    setDraft(next);
    setBaseline(JSON.stringify(next));
    setScreen("builder");
    onOpenChange(false);
  };
  const startEdit = (automationId: string) => {
    setSelectedAutomationId(automationId);
    setBaseline("");
    setScreen("builder");
    onOpenChange(false);
  };
  const save = async () => {
    if (!definition || !effectiveName) return;
    let saveDraft = draft;
    for (const actionDraft of saveDraft.actions) {
      if (actionDraft.action.type !== "send_webhook") continue;
      for (const header of actionDraft.webhookHeaders) {
        if (!header.name.trim() || !header.value) continue;
        const secret = await createSecret.mutateAsync({ purpose: "webhook_header", value: header.value });
        saveDraft = {
          ...saveDraft,
          actions: saveDraft.actions.map((candidate) =>
            candidate.action.id === actionDraft.action.id
              ? resolveWebhookHeader(candidate, header.key, secret.id)
              : candidate
          ),
        };
      }
    }
    const savedDefinition = buildDefinition(saveDraft, timezone, catalog.data);
    if (!savedDefinition) return;
    if (selectedAutomationId && detail.data) {
      await update.mutateAsync({
        body: { definition: savedDefinition, name: effectiveName },
        version: detail.data.version,
      });
    } else {
      await create.mutateAsync({ definition: savedDefinition, name: effectiveName });
    }
    setDraft(saveDraft);
    setBaseline(JSON.stringify(saveDraft));
    setScreen("list");
  };

  const handleOpenChange = (nextOpen: boolean) => onOpenChange(nextOpen);
  const saving = create.isPending || update.isPending || createSecret.isPending;
  const saveError = create.error ?? update.error ?? createSecret.error;
  const trigger = (
    <DatabaseViewToolbarButton
      aria-label="Open database automations"
      aria-expanded={open}
    >
      <Zap />
    </DatabaseViewToolbarButton>
  );
  const menuPanel = (
    <>
      <ManagerHeader
        onBack={screen === "list" ? undefined : requestBack}
        title={screenTitle(screen, selectedAutomationId)}
      />
      <div className="min-h-0 overflow-y-auto overscroll-contain">
        {screen === "list" ? (
          <AutomationList
            data={list.data?.automations ?? []}
            error={list.isError}
            loading={list.isLoading}
            onCreate={startCreate}
            onEdit={startEdit}
            onLifecycle={(automationId, action) => lifecycle.mutate({ automationId, action })}
            onRuns={(automationId) => {
              setSelectedAutomationId(automationId);
              setScreen("runs");
            }}
          />
        ) : screen === "runs" ? (
          <RunList
            loading={runs.isLoading}
            onSelect={(runId) => {
              setSelectedRunId(runId);
              setScreen("run");
            }}
            runs={runs.data?.runs ?? []}
          />
        ) : (
          <RunDetail loading={run.isLoading} run={run.data} />
        )}
      </div>
    </>
  );

  return (
    <>
      <DropDrawer
        defaultSubDisplayMode="inline"
        open={open}
        onOpenChange={handleOpenChange}
      >
        <DropDrawerTrigger asChild>{trigger}</DropDrawerTrigger>
        <DropDrawerContent
          align="end"
          className="w-72 max-h-[min(36rem,calc(100dvh-1rem))] overflow-y-auto"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {menuPanel}
        </DropDrawerContent>
      </DropDrawer>
      <Dialog
        open={screen === "builder"}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) requestEditorClose();
        }}
      >
        <DialogContent
          className="flex max-h-[min(680px,calc(100dvh-3rem))] w-[min(580px,calc(100vw-2rem))] max-w-[min(580px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(580px,calc(100vw-2rem))]"
          hideMobileDragHandle
          onOpenAutoFocus={(event) => event.preventDefault()}
          showCloseButton={false}
        >
          <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12">
            <DialogTitle className="sr-only">{selectedAutomationId ? "Edit automation" : "New automation"}</DialogTitle>
            <DialogDescription className="sr-only">
              Configure when this database automation runs and which actions it performs.
            </DialogDescription>
            <Input
              aria-label="Automation name"
              className="h-7 border-transparent bg-transparent px-0 font-heading text-sm font-medium focus-visible:px-2"
              onChange={(event) => setDraft({ ...draft, customName: true, name: event.target.value })}
              placeholder={generatedName}
              value={draft.customName ? draft.name : generatedName}
            />
            <Button
              aria-label="Close automation editor"
              className="absolute right-3 top-3 text-content-secondary"
              onClick={requestEditorClose}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <X />
            </Button>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <AutomationBuilder
              catalog={catalog.data}
              databaseId={databaseId}
              dataSourceId={dataSourceId}
              dataSourceName={dataSourceName}
              draft={draft}
              loading={Boolean(selectedAutomationId && detail.isLoading)}
              onChange={setDraft}
              onConnectSlack={() => void startSlackOauth.mutateAsync().then(({ authorizationUrl }) => window.open(authorizationUrl, "_blank", "noopener,noreferrer"))}
            />
          </div>
          <div className="shrink-0 border-t bg-surface-overlay px-4 py-2.5">
            {saveError ? (
              <p className="mb-2 text-xs text-action-danger-text" role="alert">
                {saveError instanceof Error ? saveError.message : "Could not save this automation."}
              </p>
            ) : null}
            {validate.data?.errors[0] ? (
              <p className="mb-2 text-xs text-action-danger-text" role="alert">
                {validate.data.errors[0].message}
              </p>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <Button onClick={requestEditorClose} type="button" variant="ghost">Cancel</Button>
              <Button
                disabled={!definition || !effectiveName || validate.data?.valid === false || saving}
                onClick={() => void save()}
              >
                {saving ? <Loader2 className="animate-spin" /> : <Check />}
                {selectedAutomationId ? "Save changes" : "Create and activate"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard automation changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your unsaved trigger and action changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDiscard(false);
                closeEditor();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function AutomationBuilder({ catalog, databaseId, dataSourceId, dataSourceName, draft, loading, onChange, onConnectSlack }: {
  catalog?: DatabaseAutomationCatalog;
  databaseId: string;
  dataSourceId: string;
  dataSourceName: string;
  draft: BuilderDraft;
  loading: boolean;
  onChange: (draft: BuilderDraft) => void;
  onConnectSlack: () => void;
}) {
  if (loading) return <PanelMessage icon={<Loader2 className="animate-spin" />} title="Loading automation…" />;
  const patch = (value: Partial<BuilderDraft>) => onChange({ ...draft, ...value });
  const broadEditedTriggerCount = draft.triggers.filter(
    (trigger) => trigger.type === "property_edited" && trigger.operator === "was_edited",
  ).length;
  const showAllTriggerTimingWarning = draft.match === "all" && broadEditedTriggerCount > 1;
  const changeTriggerKind = (triggerKind: BuilderDraft["triggerKind"]) => {
    patch({
      actions: triggerKind === "schedule"
        ? draft.actions.map((actionDraft) => {
          const action = actionDraft.action;
          if (action.type === "edit_trigger_page") {
            const replacement = createNotionActionDraft("edit_pages", dataSourceId, catalog);
            return {
              ...replacement,
              action: replacement.action.type === "edit_pages"
                ? { ...replacement.action, id: action.id, operations: action.operations }
                : replacement.action,
            };
          }
          if (action.type === "send_notification") {
            const recipients = action.recipients.filter((recipient) => ["selected_user", "variable"].includes(recipient.type));
            return {
              ...actionDraft,
              action: {
                ...action,
                pageLink: undefined,
                recipients: recipients.length ? recipients : [{ type: "selected_user", userId: catalog?.users[0]?.id ?? "" }],
              },
            } as NotionActionDraft;
          }
          return actionDraft;
        })
        : draft.actions,
      triggerKind,
    });
  };
  const replaceTrigger = (triggerId: string, selection: TriggerPickerSelection) => {
    if (selection.type === "schedule") {
      changeTriggerKind("schedule");
      return;
    }
    patch({
      triggerKind: "event",
      triggers: draft.triggers.map((trigger) => trigger.id === triggerId ? triggerFromSelection(selection, trigger.id, catalog) : trigger),
    });
  };
  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex items-center gap-3 border-b pb-3 text-xs">
        <span className="shrink-0 font-medium text-content-secondary">For pages in</span>
        <AutomationSelect
          ariaLabel="Automation scope"
          className="min-w-0 flex-1 text-content-primary"
          onValueChange={(scopeViewId) => patch({ scopeViewId })}
          options={[
            { label: `${dataSourceName} · Entire data source`, value: "" },
            ...(catalog?.views.map((view) => ({ label: view.name, value: view.id })) ?? []),
          ]}
          value={draft.scopeViewId}
        />
      </div>
      <section className="space-y-2">
        {draft.triggerKind === "schedule" ? (
          <ScheduleTriggerCard
            catalog={catalog}
            onChange={(schedule) => patch({ schedule })}
            onSelect={(selection) => {
              if (selection.type === "schedule") return;
              patch({ triggerKind: "event", triggers: [triggerFromSelection(selection, crypto.randomUUID(), catalog)] });
            }}
            schedule={draft.schedule}
          />
        ) : (
          <>
            <div className="space-y-2">
              {draft.triggers.map((trigger) => (
                <TriggerCard
                  catalog={catalog}
                  key={trigger.id}
                  onRemove={() => patch({ triggers: draft.triggers.filter((item) => item.id !== trigger.id) })}
                  onSelect={(selection) => replaceTrigger(trigger.id, selection)}
                  trigger={trigger}
                />
              ))}
            </div>
            {draft.triggers.length > 1 ? (
              <div className="grid justify-items-end gap-1 px-1">
                <AutomationSelect
                  ariaLabel="How event triggers are combined"
                  className="w-full text-xs"
                  onValueChange={(match) => patch({ match: match as "all" | "any" })}
                  options={[
                    { label: "When any of these occur", value: "any" },
                    { label: "When all of these occur", value: "all" },
                  ]}
                  value={draft.match}
                />
                {showAllTriggerTimingWarning ? (
                  <p className="flex max-w-full items-start gap-1.5 text-[11px] leading-relaxed text-content-secondary">
                    <TriangleAlertIcon className="mt-0.5 size-3 shrink-0 text-feedback-warning-text" />
                    <span>Multiple “is edited” triggers must occur on the same page within about three seconds. Use more specific triggers or separate automations if needed.</span>
                  </p>
                ) : null}
              </div>
            ) : null}
            <TriggerPicker
              catalog={catalog}
              label="Add trigger"
              onSelect={(selection) => {
                if (selection.type === "schedule") {
                  changeTriggerKind("schedule");
                  return;
                }
                patch({ triggers: [...draft.triggers, triggerFromSelection(selection, crypto.randomUUID(), catalog)] });
              }}
              variant="add"
            />
          </>
        )}
      </section>
      <div aria-hidden="true" className="ml-4 h-4 w-px bg-stroke-default" />
      <section className="space-y-1">
        <div className="flex min-h-7 items-center px-1 text-xs font-medium text-content-secondary">Do</div>
        {catalog?.actions.find((item) => item.type === "send_slack")?.reason === "Connect Slack to use this action" ? <Button className="mb-2 w-full" onClick={onConnectSlack} variant="outline">Connect Slack</Button> : null}
        <div className="space-y-0.5">
          {draft.actions.map((action, index) => canUseCompactPropertyAction(action) ? (
            <CompactPropertyActionCard
              catalog={catalog}
              dataSourceId={dataSourceId}
              draft={action}
              index={index}
              key={action.action.id}
              onChange={(next) => patch({ actions: draft.actions.map((item) => item.action.id === action.action.id ? next : item) })}
              onMove={(direction) => patch({ actions: move(draft.actions, index, index + direction) })}
              onRemove={() => patch({ actions: draft.actions.filter((item) => item.action.id !== action.action.id) })}
              scheduled={draft.triggerKind === "schedule"}
            />
          ) : (
            <NotionActionEditor
              catalog={catalog}
              databaseId={databaseId}
              dataSourceId={dataSourceId}
              draft={action}
              index={index}
              key={action.action.id}
              onChange={(next) => patch({ actions: draft.actions.map((item) => item.action.id === action.action.id ? next : item) })}
              onConnectSlack={onConnectSlack}
              onMove={(direction) => patch({ actions: move(draft.actions, index, index + direction) })}
              onRemove={() => patch({ actions: draft.actions.filter((item) => item.action.id !== action.action.id) })}
              scheduled={draft.triggerKind === "schedule"}
            />
          ))}
        </div>
        <ActionPicker
          catalog={catalog}
          dataSourceId={dataSourceId}
          onSelect={(action) => patch({ actions: [...draft.actions, action] })}
          scheduled={draft.triggerKind === "schedule"}
        />
      </section>
    </div>
  );
}

function TriggerCard({ catalog, onRemove, onSelect, trigger }: {
  catalog?: DatabaseAutomationCatalog;
  onRemove?: () => void;
  onSelect: (selection: TriggerPickerSelection) => void;
  trigger: TriggerDraft;
}) {
  return (
    <div className="group/trigger flex min-h-10 items-center gap-2 rounded-lg border border-stroke-default bg-surface-overlay px-2.5 py-1.5">
      <span className="w-10 shrink-0 text-xs font-medium text-content-secondary">When</span>
      <TriggerPicker
        catalog={catalog}
        label={triggerPickerLabel(trigger, catalog)}
        onSelect={onSelect}
        selection={trigger.type === "page_added"
          ? { type: "page_added" }
          : {
              operands: trigger.operands,
              operator: trigger.operator,
              propertyId: trigger.propertyId,
              type: "property_edited",
            }}
      />
      {onRemove ? <Button aria-label="Remove trigger" className="ml-auto text-content-secondary opacity-0 group-hover/trigger:opacity-100 focus-visible:opacity-100" onClick={onRemove} size="icon-sm" variant="ghost"><X /></Button> : null}
    </div>
  );
}

function AutomationTriggerValueControl({ catalog, onChange, property, trigger }: {
  catalog?: DatabaseAutomationCatalog;
  onChange: (operands: string[]) => void;
  property?: DatabaseAutomationCatalog["properties"][number];
  trigger: TriggerDraft;
}) {
  if (!property) {
    return (
      <Input
        aria-label="Trigger value"
        onChange={(event) => onChange([event.target.value])}
        placeholder="Value"
        value={trigger.operands[0] ?? ""}
      />
    );
  }
  const condition: DatabaseCondition = {
    id: trigger.id,
    label: property.name,
    operator: trigger.operator as DatabasePropertyFilterOperator,
    operatorLabel: humanize(trigger.operator),
    propertyId: property.id,
    propertyType: property.type,
    values: trigger.operands,
  };
  const valueOptions = property.type === "person"
    ? (catalog?.users ?? []).map(({ id, name }) => ({ label: name, value: id }))
    : property.options.map(({ color, id, name }) => ({ color, label: name, value: id }));
  return (
    <DatabaseConditionValueControl
      condition={condition}
      onUpdate={(patch) => onChange(patch.values ?? trigger.operands)}
      valueOptions={valueOptions}
    />
  );
}

function ScheduleTriggerCard({ catalog, onChange, onSelect, schedule }: {
  catalog?: DatabaseAutomationCatalog;
  onChange: (schedule: ScheduleDraft) => void;
  onSelect: (selection: TriggerPickerSelection) => void;
  schedule: ScheduleDraft;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="overflow-hidden rounded-lg border border-stroke-default bg-surface-overlay">
      <div className="flex min-h-10 items-center gap-2 px-2.5 py-1.5">
        <span className="w-10 shrink-0 text-xs font-medium text-content-secondary">When</span>
        <TriggerPicker
          catalog={catalog}
          label={scheduleTriggerLabel(schedule)}
          onSelect={onSelect}
          selection={{ type: "schedule" }}
        />
        <span className="ml-auto" />
        <Button
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} schedule trigger`}
          className="text-content-secondary"
          onClick={() => setExpanded((value) => !value)}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <ChevronDownIcon className={cn("transition-transform", expanded && "rotate-180")} />
        </Button>
      </div>
      {expanded ? (
        <div className="border-t border-stroke-default p-2.5">
          <ScheduleEditor onChange={onChange} schedule={schedule} />
        </div>
      ) : null}
    </div>
  );
}

function TriggerPicker({ catalog, label, onSelect, selection, variant = "card" }: {
  catalog?: DatabaseAutomationCatalog;
  label: ReactNode;
  onSelect: (selection: TriggerPickerSelection) => void;
  selection?: TriggerPickerSelection;
  variant?: "add" | "card";
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"operator" | "root" | "value">("root");
  const [configuration, setConfiguration] = useState<TriggerDraft | null>(null);
  const choose = (next: TriggerPickerSelection) => {
    onSelect(next);
    setOpen(false);
    setStep("root");
    setConfiguration(null);
  };
  const openProperty = (property: DatabaseAutomationCatalog["properties"][number]) => {
    const isCurrentProperty = selection?.type === "property_edited" && selection.propertyId === property.id;
    const next: TriggerDraft = {
      id: crypto.randomUUID(),
      operands: isCurrentProperty ? selection.operands ?? [] : [],
      operator: isCurrentProperty
        ? selection.operator ?? property.operators[0] ?? "was_edited"
        : property.operators[0] ?? "was_edited",
      propertyId: property.id,
      type: "property_edited",
    };
    setConfiguration(next);
    setStep(isChoiceTriggerProperty(property.type) ? "value" : "operator");
  };
  const finishConfiguration = () => {
    if (!configuration || !configuredProperty) return;
    const normalizeAnyChoice = isChoiceTriggerProperty(configuredProperty.type)
      && configuration.operator === "was_edited";
    choose({
      operands: normalizeAnyChoice
        ? configuredProperty.options.map((option) => option.id)
        : configuration.operands,
      operator: normalizeAnyChoice
        ? configuredProperty.type === "multi_select" ? "contains" : "is"
        : configuration.operator,
      propertyId: configuration.propertyId,
      type: "property_edited",
    });
  };
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setStep("root");
      setConfiguration(null);
      return;
    }
    if (selection?.type !== "property_edited" || selection.propertyId === "any") return;
    const property = catalog?.properties.find((item) => item.id === selection.propertyId);
    if (property) openProperty(property);
  };
  const selectedPropertyId = selection?.type === "property_edited" ? selection.propertyId : null;
  const configuredProperty = configuration
    ? catalog?.properties.find((item) => item.id === configuration.propertyId)
    : undefined;
  return (
    <Popover modal open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          aria-label={variant === "add" ? "Add trigger" : "Change trigger"}
          className={cn(
            variant === "add"
              ? "h-10 w-full justify-start border-stroke-default px-3 text-sm"
              : "h-7 min-w-0 flex-1 justify-start px-1.5",
          )}
          type="button"
          variant={variant === "add" ? "outline" : "ghost"}
        >
          {variant === "add" ? <Plus /> : triggerPickerIcon(selection)}
          <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-0 p-0">
        {step === "root" ? (
          <Command>
            <CommandInput autoFocus placeholder="Search triggers…" />
            <CommandList
              className="max-h-[min(20rem,calc(100dvh-10rem))] touch-pan-y overscroll-contain"
              onWheelCapture={(event) => event.stopPropagation()}
            >
              <CommandEmpty>No triggers found.</CommandEmpty>
              <CommandGroup heading="Event">
                <CommandItem className={automationMenuItemClassName} data-checked={selection?.type === "page_added"} onSelect={() => choose({ type: "page_added" })} value="Page added">
                  <Plus />Page added
                </CommandItem>
                <CommandItem className={automationMenuItemClassName} data-checked={selection?.type === "schedule"} onSelect={() => choose({ type: "schedule" })} value="Every schedule">
                  <Clock />Every…
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Property edited">
                <CommandItem className={automationMenuItemClassName} data-checked={selectedPropertyId === "any"} onSelect={() => choose({ propertyId: "any", type: "property_edited" })} value="Any property edited">
                  <Pencil />Any property
                </CommandItem>
                {(catalog?.properties ?? []).map((property) => (
                  <CommandItem
                    className={automationMenuItemClassName}
                    data-checked={selectedPropertyId === property.id}
                    key={property.id}
                    onSelect={() => openProperty(property)}
                    value={`${property.name} property edited`}
                  >
                    <AutomationPropertyIcon property={property} />
                    <span className="min-w-0 flex-1 truncate">{property.name}</span>
                    <ChevronDownIcon className="order-last -rotate-90 text-content-secondary" />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        ) : configuration && configuredProperty ? (
          <div className="min-w-0">
            <div className="flex h-10 items-center gap-1 border-b border-stroke-default px-1.5">
              <Button
                aria-label="Back to triggers"
                onClick={() => setStep(step === "value" && !isChoiceTriggerProperty(configuredProperty.type) ? "operator" : "root")}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ArrowLeft />
              </Button>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {step === "operator"
                  ? configuredProperty.name
                  : triggerConfigurationTitle(configuration, configuredProperty)}
              </span>
              {step === "value" ? (
                <Button
                  className="h-7 px-2 text-action-link"
                  disabled={!operandless.has(configuration.operator) && !hasRequiredTriggerValues(configuration)}
                  onClick={finishConfiguration}
                  type="button"
                  variant="ghost"
                >
                  Done
                </Button>
              ) : null}
            </div>
            {step === "operator" ? (
              <Command>
                <CommandList className="max-h-[min(20rem,calc(100dvh-10rem))] p-1">
                  <CommandGroup heading="Run when">
                    {configuredProperty.operators.map((operator) => (
                      <CommandItem
                        className={automationMenuItemClassName}
                        data-checked={configuration.operator === operator}
                        key={operator}
                        onSelect={() => {
                          const next = {
                            ...configuration,
                            operands: nextTriggerOperands(configuration, operator, configuredProperty.type),
                            operator,
                          };
                          setConfiguration(next);
                          if (operandless.has(operator)) {
                            choose({
                              operands: [],
                              operator,
                              propertyId: configuredProperty.id,
                              type: "property_edited",
                            });
                          } else {
                            setStep("value");
                          }
                        }}
                        value={`${configuredProperty.name} ${humanize(operator)}`}
                      >
                        <span className="min-w-0 flex-1 truncate">{triggerOperatorLabel(operator)}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            ) : (
              <TriggerConfigurationValueStep
                catalog={catalog}
                onChange={setConfiguration}
                property={configuredProperty}
                trigger={configuration}
              />
            )}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function TriggerConfigurationValueStep({ catalog, onChange, property, trigger }: {
  catalog?: DatabaseAutomationCatalog;
  onChange: (trigger: TriggerDraft) => void;
  property: DatabaseAutomationCatalog["properties"][number];
  trigger: TriggerDraft;
}) {
  if (isChoiceTriggerProperty(property.type)) {
    const allOptionIds = property.options.map((option) => option.id);
    const anyOption = trigger.operator === "was_edited";
    const effectiveOperands = anyOption ? allOptionIds : trigger.operands;
    const selected = new Set(effectiveOperands);
    const allSelected = allOptionIds.length > 0 && allOptionIds.every((id) => selected.has(id));
    return (
      <div className="max-h-[min(20rem,calc(100dvh-10rem))] overflow-y-auto overscroll-contain p-1.5">
        <TriggerOptionRow
          checked={anyOption || allSelected}
          label="Any option"
          onCheckedChange={(checked) => {
            onChange({
              ...trigger,
              operands: checked ? allOptionIds : [],
              operator: property.type === "multi_select" ? "contains" : "is",
            });
          }}
        />
        <div className="my-1 h-px bg-stroke-default" />
        {property.options.map((option) => (
          <TriggerOptionRow
            checked={selected.has(option.id)}
            color={option.color}
            key={option.id}
            label={option.name}
            onCheckedChange={(checked) => {
              const operands = checked
                ? [...effectiveOperands.filter((value) => value !== option.id), option.id]
                : effectiveOperands.filter((value) => value !== option.id);
              onChange({
                ...trigger,
                operands,
                operator: operands.length === 0
                  ? "was_edited"
                  : property.type === "multi_select" ? "contains" : "is",
              });
            }}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="p-2.5">
      <AutomationTriggerValueControl
        catalog={catalog}
        onChange={(operands) => onChange({ ...trigger, operands })}
        property={property}
        trigger={trigger}
      />
    </div>
  );
}

function TriggerOptionRow({ checked, color, label, onCheckedChange }: {
  checked: boolean;
  color?: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useMemo(() => crypto.randomUUID(), []);
  return (
    <div className="flex min-h-8 items-center gap-2 rounded-md px-2 py-1 hover:bg-action-neutral-hover">
      <Checkbox
        checked={checked}
        id={id}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <label className="flex min-w-0 flex-1 cursor-pointer items-center" htmlFor={id}>
        {color ? <span className={getColorTokenBadgeClassName(color)}>{label}</span> : <span className="truncate">{label}</span>}
      </label>
    </div>
  );
}

function CompactPropertyActionCard({ catalog, dataSourceId, draft, index, onChange, onMove, onRemove, scheduled }: {
  catalog?: DatabaseAutomationCatalog;
  dataSourceId: string;
  draft: NotionActionDraft;
  index: number;
  onChange: (draft: NotionActionDraft) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  scheduled: boolean;
}) {
  const operation = draft.action.type === "edit_trigger_page" ? draft.action.operations[0] : undefined;
  const property = operation ? actionProperties(catalog).find((item) => item.id === operation.propertyId) : undefined;
  return (
    <div className="group/action flex min-h-10 items-center gap-2 rounded-lg border border-stroke-default bg-surface-overlay px-2.5 py-1.5">
      <span className="flex size-6 shrink-0 items-center justify-center text-content-secondary">
        {property ? <AutomationPropertyIcon property={property} /> : <Sparkles className="size-4" />}
      </span>
      <ActionPicker
        catalog={catalog}
        dataSourceId={dataSourceId}
        label={propertyActionLabel(draft, catalog)}
        onSelect={onChange}
        scheduled={scheduled}
        selection={draft}
        variant="card"
      />
      <Button aria-label="Move action up" className="ml-auto text-content-secondary opacity-0 group-hover/action:opacity-100 focus-visible:opacity-100" disabled={index === 0} onClick={() => onMove(-1)} size="icon-sm" variant="ghost">↑</Button>
      <Button aria-label="Move action down" className="text-content-secondary opacity-0 group-hover/action:opacity-100 focus-visible:opacity-100" onClick={() => onMove(1)} size="icon-sm" variant="ghost">↓</Button>
      <Button aria-label="Remove action" className="text-content-secondary opacity-0 group-hover/action:opacity-100 focus-visible:opacity-100" onClick={onRemove} size="icon-sm" variant="ghost"><Trash2 /></Button>
    </div>
  );
}

function ActionPicker({ catalog, dataSourceId, label = "Add action", onSelect, scheduled, selection, variant = "add" }: {
  catalog?: DatabaseAutomationCatalog;
  dataSourceId: string;
  label?: string;
  onSelect: (draft: NotionActionDraft) => void;
  scheduled: boolean;
  selection?: NotionActionDraft;
  variant?: "add" | "card";
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"property" | "root">("root");
  const [propertyConfiguration, setPropertyConfiguration] = useState<{
    property: DatabaseAutomationCatalog["properties"][number];
    values: string[];
  } | null>(null);
  const available = new Map(catalog?.actions.map((item) => [item.type, item]) ?? []);
  const choose = (draft: NotionActionDraft) => {
    onSelect(draft);
    setOpen(false);
    setStep("root");
    setPropertyConfiguration(null);
  };
  const openProperty = (property: DatabaseAutomationCatalog["properties"][number]) => {
    const operation = selection?.action.type === "edit_trigger_page"
      ? selection.action.operations[0]
      : undefined;
    setPropertyConfiguration({
      property,
      values: operation?.propertyId === property.id && operation.value?.type === "literal"
        ? actionValuesFromLiteral(operation.value.value, property.type)
        : [],
    });
    setStep("property");
  };
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setStep("root");
      setPropertyConfiguration(null);
      return;
    }
    const operation = selection?.action.type === "edit_trigger_page"
      ? selection.action.operations[0]
      : undefined;
    const property = operation
      ? actionProperties(catalog).find((item) => item.id === operation.propertyId)
      : undefined;
    if (property) openProperty(property);
  };
  const finishProperty = () => {
    if (!propertyConfiguration?.values.length) return;
    const base = selection?.action.type === "edit_trigger_page"
      ? selection
      : createNotionActionDraft("edit_trigger_page", dataSourceId, catalog);
    if (base.action.type !== "edit_trigger_page") return;
    choose({
      ...base,
      action: {
        ...base.action,
        operations: [{
          mode: "set",
          propertyId: propertyConfiguration.property.id,
          value: {
            type: "literal",
            value: actionLiteralFromValues(propertyConfiguration.values, propertyConfiguration.property.type),
          },
        }],
      },
    });
  };
  return (
    <Popover modal open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          aria-label={variant === "add" ? "Add action" : "Change action"}
          className={cn(
            variant === "add"
              ? "h-10 w-full justify-start border-stroke-default px-3 text-sm"
              : "h-7 min-w-0 flex-1 justify-start px-1.5",
          )}
          type="button"
          variant={variant === "add" ? "outline" : "ghost"}
        >
          {variant === "add" ? <Plus /> : null}
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-0 p-0">
        {step === "root" ? (
          <Command>
            <CommandInput autoFocus placeholder="Search actions…" />
            <CommandList
              className="max-h-[min(20rem,calc(100dvh-10rem))] touch-pan-y overscroll-contain"
              onWheelCapture={(event) => event.stopPropagation()}
            >
              <CommandEmpty>No actions found.</CommandEmpty>
              <CommandGroup heading="Action">
                {NOTION_ACTION_OPTIONS
                  .filter(({ type }) => type !== "edit_trigger_page")
                  .map(({ label: optionLabel, type }) => {
                    const availability = available.get(type);
                    return (
                      <CommandItem
                        className={automationMenuItemClassName}
                        data-checked={selection?.action.type === type}
                        disabled={availability?.available === false}
                        key={type}
                        onSelect={() => choose(createNotionActionDraft(type, dataSourceId, catalog))}
                        value={optionLabel}
                      >
                        <Sparkles className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{optionLabel}</span>
                        <ChevronDownIcon className="order-last -rotate-90 text-content-secondary" />
                      </CommandItem>
                    );
                  })}
              </CommandGroup>
              {!scheduled ? (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Edit property">
                    {actionProperties(catalog).map((property) => (
                      <CommandItem
                        className={automationMenuItemClassName}
                        data-checked={selection?.action.type === "edit_trigger_page"
                          && selection.action.operations[0]?.propertyId === property.id}
                        key={property.id}
                        onSelect={() => openProperty(property)}
                        value={`Set ${property.name}`}
                      >
                        <AutomationPropertyIcon property={property} />
                        <span className="min-w-0 flex-1 truncate">{property.name}</span>
                        <ChevronDownIcon className="order-last -rotate-90 text-content-secondary" />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              ) : null}
            </CommandList>
          </Command>
        ) : propertyConfiguration ? (
          <div className="min-w-0">
            <div className="flex h-10 items-center gap-1 border-b border-stroke-default px-1.5">
              <Button aria-label="Back to actions" onClick={() => setStep("root")} size="icon-sm" type="button" variant="ghost"><ArrowLeft /></Button>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">Set {propertyConfiguration.property.name} to</span>
              <Button className="h-7 px-2 text-action-link" disabled={!propertyConfiguration.values.length} onClick={finishProperty} type="button" variant="ghost">Done</Button>
            </div>
            <ActionPropertyValueStep
              catalog={catalog}
              onChange={(values) => setPropertyConfiguration({ ...propertyConfiguration, values })}
              property={propertyConfiguration.property}
              values={propertyConfiguration.values}
            />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function ActionPropertyValueStep({ catalog, onChange, property, values }: {
  catalog?: DatabaseAutomationCatalog;
  onChange: (values: string[]) => void;
  property: DatabaseAutomationCatalog["properties"][number];
  values: string[];
}) {
  if (["multi_select", "person", "select", "status"].includes(property.type)) {
    const options = property.type === "person"
      ? (catalog?.users ?? []).map(({ id, name }) => ({ id, name }))
      : property.options;
    const selected = new Set(values);
    const multiple = property.type === "multi_select" || property.type === "person";
    return (
      <Command>
        <CommandInput autoFocus placeholder={`Search ${property.name.toLowerCase()}…`} />
        <CommandList className="max-h-[min(20rem,calc(100dvh-10rem))] touch-pan-y overscroll-contain p-1">
          <CommandEmpty>No options found.</CommandEmpty>
          <CommandGroup>
            {options.map((option) => (
              <CommandItem
                className={automationMenuItemClassName}
                key={option.id}
                onSelect={() => onChange(
                  multiple
                    ? selected.has(option.id) ? values.filter((value) => value !== option.id) : [...values, option.id]
                    : selected.has(option.id) ? [] : [option.id]
                )}
                value={option.name}
              >
                <Checkbox checked={selected.has(option.id)} className="pointer-events-none" />
                {"color" in option && typeof option.color === "string"
                  ? <span className={getColorTokenBadgeClassName(option.color)}>{option.name}</span>
                  : <span className="truncate">{option.name}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    );
  }
  if (property.type === "checkbox") {
    return (
      <div className="p-1.5">
        <TriggerOptionRow checked={values[0] === "true"} label="Checked" onCheckedChange={() => onChange(["true"])} />
        <TriggerOptionRow checked={values[0] === "false"} label="Unchecked" onCheckedChange={() => onChange(["false"])} />
      </div>
    );
  }
  const condition: DatabaseCondition = {
    id: `action-${property.id}`,
    label: property.name,
    operator: "is",
    operatorLabel: "Set to",
    propertyId: property.id,
    propertyType: property.type,
    values,
  };
  return (
    <div className="p-2.5">
      <DatabaseConditionValueControl
        condition={condition}
        onUpdate={(patch) => onChange(patch.values ?? values)}
        valueOptions={[]}
      />
    </div>
  );
}

function actionProperties(catalog?: DatabaseAutomationCatalog): DatabaseAutomationCatalog["properties"] {
  return [
    {
      id: "name",
      name: "Name",
      operators: ["was_edited", "is", "is_not", "contains", "does_not_contain", "starts_with", "ends_with", "is_empty", "is_not_empty"],
      options: [],
      type: "title",
      writable: true,
    },
    ...(catalog?.properties.filter(({ writable }) => writable) ?? []),
  ];
}

function canUseCompactPropertyAction(draft: NotionActionDraft) {
  if (draft.action.type !== "edit_trigger_page" || draft.action.operations.length !== 1) return false;
  const operation = draft.action.operations[0];
  return operation?.mode === "set" && operation.value?.type === "literal";
}

function actionValuesFromLiteral(value: AutomationJsonValue, propertyType: string): string[] {
  if (["multi_select", "person", "relation", "select", "status"].includes(propertyType)) {
    const values = Array.isArray(value) ? value : [value];
    return values.flatMap((item) =>
      item && typeof item === "object" && !Array.isArray(item) && "id" in item && typeof item.id === "string"
        ? [item.id]
        : []
    );
  }
  return value === null ? [] : [String(value)];
}

function actionLiteralFromValues(values: string[], propertyType: string): AutomationJsonValue {
  if (propertyType === "number") return Number(values[0] ?? 0);
  if (propertyType === "checkbox") return values[0] === "true";
  if (propertyType === "select" || propertyType === "status") {
    return { entityType: "option", id: values[0] ?? "", type: "entity" };
  }
  if (propertyType === "multi_select") {
    return values.map((id) => ({ entityType: "option", id, type: "entity" }));
  }
  if (propertyType === "person") {
    return values.map((id) => ({ entityType: "user", id, type: "entity" }));
  }
  if (propertyType === "relation") {
    return values.map((id) => ({ entityType: "page", id, type: "entity" }));
  }
  return values[0] ?? "";
}

function propertyActionLabel(draft: NotionActionDraft, catalog?: DatabaseAutomationCatalog) {
  if (draft.action.type !== "edit_trigger_page") return notionActionLabel(draft.action.type);
  const operation = draft.action.operations[0];
  if (!operation) return "Edit property";
  const property = actionProperties(catalog).find((item) => item.id === operation.propertyId);
  if (operation.mode === "clear") return `Clear ${property?.name ?? "property"}`;
  if (operation.value?.type !== "literal") return `Set ${property?.name ?? "property"}`;
  const values = actionValuesFromLiteral(operation.value.value, property?.type ?? "text");
  const labels = values.map((value) =>
    property?.options.find((option) => option.id === value)?.name
      ?? catalog?.users.find((user) => user.id === value)?.name
      ?? value
  );
  return `Set ${property?.name ?? "property"} to ${labels.join(", ") || "value"}`;
}

function AutomationPropertyIcon({ property }: {
  property: DatabaseAutomationCatalog["properties"][number];
}) {
  if (property.icon) {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center">
        <PageIconDisplay size="sm" value={property.icon} />
      </span>
    );
  }
  const PropertyIcon = getDatabasePropertyType(property.type).icon;
  return <PropertyIcon className="size-4 shrink-0 text-content-secondary" />;
}

function triggerPickerIcon(selection: TriggerPickerSelection | undefined) {
  if (selection?.type === "page_added") return <Plus />;
  if (selection?.type === "schedule") return <Clock />;
  if (selection?.type === "property_edited" && selection.propertyId !== "any") return null;
  return <Pencil />;
}

function triggerPickerLabel(trigger: TriggerDraft, catalog?: DatabaseAutomationCatalog) {
  if (trigger.type === "page_added") return "Page added";
  if (trigger.propertyId === "any") return "Any property edited";
  const property = catalog?.properties.find((item) => item.id === trigger.propertyId);
  const propertyName = property?.name ?? "Property";
  const propertyBadge = (
    <span className="flex max-w-32 shrink-0 items-center gap-1 rounded-md bg-surface-subtle px-1.5 py-0.5 text-xs font-medium text-content-primary">
      {property ? <AutomationPropertyIcon property={property} /> : <Pencil className="size-3.5 shrink-0 text-content-secondary" />}
      <span className="truncate">{propertyName}</span>
    </span>
  );
  if (trigger.operator === "was_edited") return <>{propertyBadge}<span className="shrink-0">edited</span></>;
  const options = trigger.operands.map((operand) => {
    const option = property?.options.find((item) => item.id === operand);
    return { color: option?.color, label: option?.name ?? operand, value: operand };
  }).filter(({ label }) => Boolean(label));
  return (
    <>
      {propertyBadge}
      <span className="shrink-0">{triggerOperatorLabel(trigger.operator).toLowerCase()}</span>
      {options.map((option) => option.color ? (
        <span className={cn("max-w-32 shrink-0 truncate", getColorTokenBadgeClassName(option.color))} key={option.value}>
          {option.label}
        </span>
      ) : (
        <span className="max-w-32 shrink-0 truncate rounded-md bg-surface-subtle px-1.5 py-0.5 text-xs" key={option.value}>
          {option.label}
        </span>
      ))}
    </>
  );
}

function isChoiceTriggerProperty(propertyType: string) {
  return ["multi_select", "select", "status"].includes(propertyType);
}

function triggerConfigurationTitle(
  trigger: TriggerDraft,
  property: DatabaseAutomationCatalog["properties"][number],
) {
  if (isChoiceTriggerProperty(property.type)) {
    return `${property.name} set to`;
  }
  return `${property.name} ${triggerOperatorLabel(trigger.operator).toLowerCase()}`;
}

function triggerOperatorLabel(operator: DatabaseAutomationTriggerOperator) {
  if (operator === "was_edited") return "Is edited";
  if (operator === "is") return "Set to";
  return humanize(operator);
}

function emptyDraft(): BuilderDraft {
  return {
    actions: [],
    customName: false,
    match: "any",
    name: "",
    schedule: newSchedule(),
    scopeViewId: "",
    triggerKind: "event",
    triggers: [],
  };
}
const triggerFromSelection = (
  selection: EventTriggerPickerSelection,
  id: string,
  catalog?: DatabaseAutomationCatalog,
): TriggerDraft => selection.type === "page_added"
  ? { id, operands: [], operator: "was_edited", propertyId: "any", type: "page_added" }
  : {
      id,
      operands: selection.operands ?? [],
      operator: selection.operator ?? (selection.propertyId === "any"
        ? "was_edited"
        : catalog?.properties.find((property) => property.id === selection.propertyId)?.operators[0] ?? "was_edited"),
      propertyId: selection.propertyId,
      type: "property_edited",
    };
const newSchedule = (): ScheduleDraft => ({
  customPattern: "daily",
  dayOfMonth: "1",
  endDate: "",
  frequency: "daily",
  interval: 1,
  localTime: "09:00",
  months: [1],
  startDate: new Date().toISOString().slice(0, 10),
  weekdays: [new Date().getDay()],
});

function buildDefinition(draft: BuilderDraft, timezone: string, catalog?: DatabaseAutomationCatalog): DatabaseAutomationDefinition | null {
  if (draft.actions.length === 0) return null;
  if (draft.triggerKind === "event" && draft.triggers.length === 0) return null;
  if (draft.triggerKind === "event" && draft.triggers.some((trigger) =>
    trigger.type === "property_edited" &&
    !operandless.has(trigger.operator) &&
    !hasRequiredTriggerValues(trigger)
  )) return null;
  const clauses: DatabaseAutomationEventTriggerClause[] = draft.triggers.map((trigger) => trigger.type === "page_added"
    ? { id: trigger.id, type: "page_added" }
    : {
        id: trigger.id,
        operator: trigger.operator,
        propertyId: trigger.propertyId,
        type: "property_edited",
        ...(operandless.has(trigger.operator) ? {} : { operand: parseOperand(trigger.operands, catalog?.properties.find((property) => property.id === trigger.propertyId)?.type, trigger.operator) }),
      });
  const actions = draft.actions.map(actionForDefinition);
  const trigger: DatabaseAutomationDefinition["trigger"] = draft.triggerKind === "event"
    ? { clauses, kind: "event", match: draft.match }
    : { kind: "schedule", schedule: scheduleDefinition(draft.schedule, timezone) };
  return { actions, definitionVersion: 1, scope: draft.scopeViewId ? { type: "view", viewId: draft.scopeViewId } : { type: "data_source" }, timezone, trigger };
}

function parseOperand(values: string[], propertyType: string | undefined, operator: DatabaseAutomationTriggerOperator): AutomationTriggerOperand {
  const value = values[0] ?? "";
  if (propertyType === "number") return Number(value || 0);
  if (propertyType === "checkbox") return value === "true";
  if (propertyType === "date") {
    if (operator === "is_between") return { end: new Date(values[1] ?? value).toISOString(), start: new Date(value).toISOString(), type: "date_range" };
    if (operator === "is_relative_to_today") {
      const [, direction = "this", unit = "week"] = value.split(":");
      return {
        amount: 1,
        direction: direction as "next" | "past" | "this",
        type: "relative_date",
        unit: unit as "day" | "month" | "week" | "year",
      };
    }
    return { precision: "date", type: "date", value: new Date(value || Date.now()).toISOString() };
  }
  if (["select", "status", "multi_select"].includes(propertyType ?? "")) {
    return values.length > 1
      ? { entityType: "option", ids: values, type: "entity_list" }
      : { entityType: "option", id: value, type: "entity" };
  }
  if (propertyType === "person") {
    return values.length > 1
      ? { entityType: "user", ids: values, type: "entity_list" }
      : { entityType: "user", id: value, type: "entity" };
  }
  if (propertyType === "relation") return { entityType: "page", id: value, type: "entity" };
  return value;
}

function hasRequiredTriggerValues(trigger: TriggerDraft) {
  if (trigger.operator === "is_between") {
    return Boolean(trigger.operands[0]?.trim() && trigger.operands[1]?.trim());
  }
  return Boolean(trigger.operands[0]?.trim());
}

function nextTriggerOperands(trigger: TriggerDraft, operator: DatabaseAutomationTriggerOperator, propertyType?: string) {
  if (operandless.has(operator)) return [];
  if (operator === "is_relative_to_today") {
    return [trigger.operands[0]?.startsWith("relative:") ? trigger.operands[0] : "relative:this:week"];
  }
  if (["multi_select", "person", "select", "status"].includes(propertyType ?? "")) {
    return trigger.operands;
  }
  return trigger.operands.slice(0, operator === "is_between" ? 2 : 1);
}

function generateName(draft: BuilderDraft, catalog?: DatabaseAutomationCatalog) {
  if (draft.triggerKind === "schedule") {
    return `${humanize(draft.schedule.frequency)} at ${draft.schedule.localTime} → ${draft.actions[0] ? notionActionLabel(draft.actions[0].action.type) : "Run actions"}`;
  }
  const trigger = draft.triggers[0];
  const action = draft.actions[0];
  if (!trigger && !action) return "New automation";
  const property = catalog?.properties.find((item) => item.id === trigger?.propertyId)?.name;
  const when = !trigger
    ? "Add trigger"
    : trigger.type === "page_added"
      ? "When page added"
      : `When ${property ?? "property"} edited`;
  const then = action ? notionActionLabel(action.action.type) : "Add action";
  return `${when} → ${then}`;
}

function draftFromDefinition(name: string, definition: DatabaseAutomationDefinition): BuilderDraft {
  const base = emptyDraft();
  return {
    actions: definition.actions.map(notionActionDraftFromAction),
    customName: true,
    match: definition.trigger.kind === "event" ? definition.trigger.match : "any",
    name,
    schedule: definition.trigger.kind === "schedule" ? scheduleDraft(definition.trigger.schedule) : base.schedule,
    scopeViewId: definition.scope.type === "view" ? definition.scope.viewId : "",
    triggerKind: definition.trigger.kind,
    triggers: definition.trigger.kind === "event" ? definition.trigger.clauses.map((clause): TriggerDraft => clause.type === "page_added" ? { id: clause.id, operands: [], operator: "was_edited", propertyId: "any", type: "page_added" } : { id: clause.id, operands: triggerOperandValues(clause.operand), operator: clause.operator, propertyId: clause.propertyId, type: "property_edited" }) : base.triggers,
  };
}

function triggerOperandValues(operand: AutomationTriggerOperand | undefined): string[] {
  if (operand === undefined || operand === null) return [];
  if (typeof operand === "string" || typeof operand === "number" || typeof operand === "boolean") return [String(operand)];
  if (operand.type === "entity") return [operand.id];
  if (operand.type === "entity_list") return operand.ids;
  if (operand.type === "date") return [operand.value.slice(0, 10)];
  if (operand.type === "date_range") return [operand.start.slice(0, 10), operand.end.slice(0, 10)];
  return [`relative:${operand.direction}:${operand.unit}`];
}

function move<T>(items: T[], from: number, to: number) {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}
const humanize = (value: string) => value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
const screenTitle = (screen: Screen, editing: string | null) => screen === "list" ? "Automations" : screen === "builder" ? (editing ? "Edit automation" : "New automation") : screen === "runs" ? "Recent runs" : "Run details";
