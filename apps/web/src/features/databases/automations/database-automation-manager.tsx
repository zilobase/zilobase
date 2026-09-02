import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  AutomationTriggerOperand,
  AutomationNotificationRecipient,
  DatabaseAutomationAction,
  DatabaseAutomationCatalog,
  DatabaseAutomationDefinition,
  DatabaseAutomationEventTriggerClause,
  DatabaseAutomationSchedule,
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
  useSlackAutomationChannels,
  useStartSlackAutomationOauth,
  useUpdateDatabaseAutomation,
  useValidateDatabaseAutomation,
} from "@zilobase/features/databases/automations/react";
import {
  TriangleAlertIcon,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Clock,
  Copy,
  Loader2,
  Pause,
  Play,
  Plus,
  Trash2,
  X,
  Zap,
} from "@/shared/components/icons";

import { Button } from "@/shared/ui/button";
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
import { cn } from "@/shared/lib/utils";

import { DatabaseViewToolbarButton } from "../views/view/database-view-toolbar-button";

type Screen = "builder" | "list" | "run" | "runs";
type TriggerDraft = {
  id: string;
  operand: string;
  operator: DatabaseAutomationTriggerOperator;
  propertyId: string;
  type: "page_added" | "property_edited";
};
type ActionDraft = {
  bcc: string;
  cc: string;
  connectionId: string;
  displayName: string;
  id: string;
  linkTriggerPage: boolean;
  mode: "add" | "clear" | "remove" | "set";
  propertyId: string;
  recipientType: "email" | "page_creator" | "person_property" | "selected_user" | "trigger_person" | "variable";
  recipientValue: string;
  replyTo: string;
  subject: string;
  to: string;
  type: "add_page" | "define_variables" | "edit_pages" | "edit_trigger_page" | "send_gmail" | "send_notification" | "send_slack" | "send_webhook";
  value: string;
  variableName: string;
  webhookHeaderName: string;
  webhookHeaderValue: string;
  webhookSecretId: string;
  webhookUrl: string;
  slackChannelId: string;
  slackLinkLabel: string;
  slackLinkUrl: string;
  slackMentionId: string;
  slackMentionKind: "channel" | "user";
};
type BuilderDraft = {
  actions: ActionDraft[];
  customName: boolean;
  match: "all" | "any";
  name: string;
  schedule: ScheduleDraft;
  scopeViewId: string;
  triggerKind: "event" | "schedule";
  triggers: TriggerDraft[];
};
type ScheduleDraft = {
  customPattern: "daily" | "monthly" | "weekly" | "yearly";
  dayOfMonth: string;
  endDate: string;
  frequency: DatabaseAutomationSchedule["frequency"];
  interval: number;
  localTime: string;
  months: number[];
  startDate: string;
  weekdays: number[];
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
  const pendingClose = useRef(false);
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
    () => buildDefinition(draft, dataSourceId, timezone, catalog.data),
    [catalog.data, dataSourceId, draft, timezone],
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
    if (!open) {
      setScreen("list");
      setSelectedAutomationId(null);
      setSelectedRunId(null);
      setConfirmDiscard(false);
    }
  }, [open]);

  useEffect(() => {
    if (screen !== "builder" || !selectedAutomationId || !detail.data) return;
    const next = draftFromDefinition(detail.data.name, detail.data.definition);
    setDraft(next);
    setBaseline(JSON.stringify(next));
  }, [detail.data, screen, selectedAutomationId]);

  const requestClose = () => {
    if (dirty) {
      pendingClose.current = true;
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  };
  const requestBack = () => {
    if (dirty) {
      pendingClose.current = false;
      setConfirmDiscard(true);
      return;
    }
    setScreen(screen === "run" ? "runs" : "list");
  };
  const startCreate = () => {
    const next = emptyDraft();
    setSelectedAutomationId(null);
    setDraft(next);
    setBaseline(JSON.stringify(next));
    setScreen("builder");
  };
  const startEdit = (automationId: string) => {
    setSelectedAutomationId(automationId);
    setBaseline("");
    setScreen("builder");
  };
  const save = async () => {
    if (!definition || !effectiveName) return;
    let saveDraft = draft;
    for (const action of saveDraft.actions) {
      if (action.type !== "send_webhook" || !action.webhookHeaderName.trim() || !action.webhookHeaderValue) continue;
      const secret = await createSecret.mutateAsync({ purpose: "webhook_header", value: action.webhookHeaderValue });
      saveDraft = {
        ...saveDraft,
        actions: saveDraft.actions.map((candidate) => candidate.id === action.id
          ? { ...candidate, webhookHeaderValue: "", webhookSecretId: secret.id }
          : candidate),
      };
    }
    const savedDefinition = buildDefinition(saveDraft, dataSourceId, timezone, catalog.data);
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

  return (
    <>
      <DropDrawer
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) onOpenChange(true);
          else requestClose();
        }}
      >
        <DropDrawerTrigger asChild>
          <DatabaseViewToolbarButton
            aria-label="Open database automations"
            aria-expanded={open}
          >
            <Zap />
          </DatabaseViewToolbarButton>
        </DropDrawerTrigger>
        <DropDrawerContent
          align="end"
          className="flex h-[min(720px,var(--radix-dropdown-menu-content-available-height))] max-h-(--radix-dropdown-menu-content-available-height) w-[min(448px,var(--radix-dropdown-menu-content-available-width))] max-w-(--radix-dropdown-menu-content-available-width) flex-col overflow-hidden p-0 max-sm:h-[calc(100dvh-1rem)] max-sm:w-[calc(100vw-1rem)]"
          onCloseAutoFocus={(event) => event.preventDefault()}
          side="left"
          sideOffset={8}
        >
          <ManagerHeader
            onBack={screen === "list" ? undefined : requestBack}
            onClose={requestClose}
            title={screenTitle(screen, selectedAutomationId)}
          />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
            ) : screen === "builder" ? (
              <AutomationBuilder
                catalog={catalog.data}
                databaseId={databaseId}
                dataSourceId={dataSourceId}
                dataSourceName={dataSourceName}
                draft={draft}
                generatedName={generatedName}
                loading={Boolean(selectedAutomationId && detail.isLoading)}
                onChange={setDraft}
                onConnectSlack={() => void startSlackOauth.mutateAsync().then(({ authorizationUrl }) => window.open(authorizationUrl, "_blank", "noopener,noreferrer"))}
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
          {screen === "builder" ? (
            <div className="border-t p-3">
              {(create.error ?? update.error ?? createSecret.error) ? (
                <p className="mb-2 text-xs text-action-danger-text" role="alert">
                  {(create.error ?? update.error ?? createSecret.error) instanceof Error
                    ? (create.error ?? update.error ?? createSecret.error)!.message
                    : "Could not save this automation."}
                </p>
              ) : null}
              {validate.data?.errors[0] ? (
                <p className="mb-2 text-xs text-action-danger-text" role="alert">
                  {validate.data.errors[0].message}
                </p>
              ) : null}
              <Button
                className="w-full"
                disabled={!definition || !effectiveName || validate.data?.valid === false || create.isPending || update.isPending || createSecret.isPending}
                onClick={() => void save()}
              >
                {create.isPending || update.isPending || createSecret.isPending ? <Loader2 className="animate-spin" /> : <Check />}
                {selectedAutomationId ? "Save changes" : "Create and activate"}
              </Button>
            </div>
          ) : null}
        </DropDrawerContent>
      </DropDrawer>
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
                if (pendingClose.current) onOpenChange(false);
                else setScreen("list");
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

function ManagerHeader({ onBack, onClose, title }: {
  onBack?: () => void;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      {onBack ? (
        <Button aria-label="Back" onClick={onBack} size="icon" variant="ghost"><ArrowLeft /></Button>
      ) : <Zap className="size-4 text-content-secondary" />}
      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
      <Button aria-label="Close automations" onClick={onClose} size="icon" variant="ghost"><X /></Button>
    </div>
  );
}

function AutomationList({ data, error, loading, onCreate, onEdit, onLifecycle, onRuns }: {
  data: Array<{ actionCount: number; id: string; lastRunStatus: string | null; name: string; nextRunAt: string | null; status: string; triggerSummary: string }>;
  error: boolean;
  loading: boolean;
  onCreate: () => void;
  onEdit: (id: string) => void;
  onLifecycle: (id: string, action: "delete" | "duplicate" | "pause" | "resume") => void;
  onRuns: (id: string) => void;
}) {
  if (loading) return <PanelMessage icon={<Loader2 className="animate-spin" />} title="Loading automations…" />;
  if (error) return <PanelMessage icon={<TriangleAlertIcon />} title="Automations could not be loaded" />;
  if (!data.length) {
    return (
      <div className="flex min-h-full flex-col">
        <PanelMessage
          description="Automatically update pages and property values when database events occur."
          icon={<Zap />}
          title="Automations"
        />
        <div className="mt-auto border-t p-2">
          <Button className="w-full justify-start" onClick={onCreate} variant="ghost"><Plus />New automation</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="p-2">
      <Button className="mb-2 w-full justify-start" onClick={onCreate} variant="secondary"><Plus />New automation</Button>
      <div className="space-y-1">
        {data.map((automation) => (
          <div className="rounded-lg border p-3" key={automation.id}>
            <button className="w-full text-left" onClick={() => onEdit(automation.id)} type="button">
              <div className="flex items-center gap-2">
                <StatusDot status={automation.status} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{automation.name}</span>
                <span className="text-xs capitalize text-content-secondary">{automation.status}</span>
              </div>
              <p className="mt-1 truncate text-xs text-content-secondary">{automation.triggerSummary}</p>
              {automation.nextRunAt ? <p className="mt-1 truncate text-xs text-content-secondary">Next run {new Date(automation.nextRunAt).toLocaleString()}</p> : null}
            </button>
            <div className="mt-2 flex items-center gap-1 border-t pt-2">
              <Button onClick={() => onLifecycle(automation.id, automation.status === "active" ? "pause" : "resume")} size="sm" variant="ghost">
                {automation.status === "active" ? <Pause /> : <Play />}
                {automation.status === "active" ? "Pause" : "Resume"}
              </Button>
              <Button onClick={() => onRuns(automation.id)} size="sm" variant="ghost"><Clock />Runs</Button>
              <Button aria-label="Duplicate automation" className="ml-auto" onClick={() => onLifecycle(automation.id, "duplicate")} size="icon" variant="ghost"><Copy /></Button>
              <Button aria-label="Delete automation" onClick={() => onLifecycle(automation.id, "delete")} size="icon" variant="ghost"><Trash2 /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AutomationBuilder({ catalog, databaseId, dataSourceId, dataSourceName, draft, generatedName, loading, onChange, onConnectSlack }: {
  catalog?: DatabaseAutomationCatalog;
  databaseId: string;
  dataSourceId: string;
  dataSourceName: string;
  draft: BuilderDraft;
  generatedName: string;
  loading: boolean;
  onChange: (draft: BuilderDraft) => void;
  onConnectSlack: () => void;
}) {
  if (loading) return <PanelMessage icon={<Loader2 className="animate-spin" />} title="Loading automation…" />;
  const patch = (value: Partial<BuilderDraft>) => onChange({ ...draft, ...value });
  return (
    <div className="space-y-4 p-4">
      <Input
        aria-label="Automation name"
        onChange={(event) => patch({ customName: true, name: event.target.value })}
        placeholder={generatedName}
        value={draft.customName ? draft.name : generatedName}
      />
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">For pages in</span>
        <select
          aria-label="Automation scope"
          className="h-8 max-w-56 rounded-md border bg-control-background px-2 text-sm"
          onChange={(event) => patch({ scopeViewId: event.target.value })}
          value={draft.scopeViewId}
        >
          <option value="">{dataSourceName} · Entire data source</option>
          {catalog?.views.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
        </select>
      </label>
      <section>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-content-secondary">Run automation</span>
          <select
            aria-label="Automation trigger type"
            className="h-7 rounded-md border bg-control-background px-2 text-xs"
            onChange={(event) => {
              const triggerKind = event.target.value as BuilderDraft["triggerKind"];
              patch({
                actions: triggerKind === "schedule"
                  ? draft.actions.map((action) => action.type === "edit_trigger_page"
                    ? { ...action, type: "edit_pages" }
                    : action.type === "send_notification" && !["selected_user", "variable"].includes(action.recipientType)
                      ? { ...action, recipientType: "selected_user", recipientValue: "" }
                      : action)
                  : draft.actions,
                triggerKind,
              });
            }}
            value={draft.triggerKind}
          >
            <option value="event">When pages change</option><option value="schedule">On a schedule</option>
          </select>
        </div>
        {draft.triggerKind === "schedule" ? (
          <ScheduleEditor onChange={(schedule) => patch({ schedule })} schedule={draft.schedule} />
        ) : (
          <>
            <div className="mb-2 flex justify-end">
              <select aria-label="Event trigger matching" className="h-7 rounded-md border bg-control-background px-2 text-xs" onChange={(event) => patch({ match: event.target.value as "all" | "any" })} value={draft.match}>
                <option value="any">Any trigger</option><option value="all">All triggers</option>
              </select>
            </div>
            <div className="space-y-2">
              {draft.triggers.map((trigger, index) => (
                <TriggerCard
                  catalog={catalog}
                  key={trigger.id}
                  onChange={(next) => patch({ triggers: draft.triggers.map((item) => item.id === trigger.id ? next : item) })}
                  onRemove={draft.triggers.length > 1 ? () => patch({ triggers: draft.triggers.filter((item) => item.id !== trigger.id) }) : undefined}
                  trigger={trigger}
                  index={index}
                />
              ))}
            </div>
            <Button className="mt-2 w-full border-dashed" onClick={() => patch({ triggers: [...draft.triggers, newTrigger()] })} variant="outline"><Plus />Add trigger</Button>
          </>
        )}
      </section>
      <section>
        <div className="mb-2 text-xs font-medium text-content-secondary">Do this</div>
        {catalog?.actions.find((item) => item.type === "send_slack")?.reason === "Connect Slack to use this action" ? <Button className="mb-2 w-full" onClick={onConnectSlack} variant="outline">Connect Slack</Button> : null}
        <div className="space-y-2">
          {draft.actions.map((action, index) => (
            <ActionCard
              action={action}
              catalog={catalog}
              databaseId={databaseId}
              dataSourceId={dataSourceId}
              index={index}
              key={action.id}
              onChange={(next) => patch({ actions: draft.actions.map((item) => item.id === action.id ? next : item) })}
              onMove={(direction) => patch({ actions: move(draft.actions, index, index + direction) })}
              onRemove={draft.actions.length > 1 ? () => patch({ actions: draft.actions.filter((item) => item.id !== action.id) }) : undefined}
              scheduled={draft.triggerKind === "schedule"}
            />
          ))}
        </div>
        <Button className="mt-2 w-full border-dashed" onClick={() => patch({ actions: [...draft.actions, newAction()] })} variant="outline"><Plus />Add action</Button>
      </section>
    </div>
  );
}

function TriggerCard({ catalog, index, onChange, onRemove, trigger }: {
  catalog?: DatabaseAutomationCatalog;
  index: number;
  onChange: (trigger: TriggerDraft) => void;
  onRemove?: () => void;
  trigger: TriggerDraft;
}) {
  const property = catalog?.properties.find((item) => item.id === trigger.propertyId);
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center gap-2"><Zap className="size-4" /><span className="text-sm font-medium">Trigger {index + 1}</span>{onRemove ? <Button aria-label="Remove trigger" className="ml-auto" onClick={onRemove} size="icon" variant="ghost"><X /></Button> : null}</div>
      <div className="grid gap-2">
        <select className="h-8 rounded-md border bg-control-background px-2 text-sm" onChange={(event) => onChange({ ...trigger, type: event.target.value as TriggerDraft["type"] })} value={trigger.type}>
          <option value="page_added">Page added</option><option value="property_edited">Property edited</option>
        </select>
        {trigger.type === "property_edited" ? (
          <>
            <select className="h-8 rounded-md border bg-control-background px-2 text-sm" onChange={(event) => {
              const nextProperty = catalog?.properties.find((item) => item.id === event.target.value);
              onChange({ ...trigger, operand: "", operator: nextProperty?.operators[0] ?? "was_edited", propertyId: event.target.value });
            }} value={trigger.propertyId}>
              <option value="any">Any property</option>
              {catalog?.properties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select className="h-8 rounded-md border bg-control-background px-2 text-sm" onChange={(event) => onChange({ ...trigger, operator: event.target.value as DatabaseAutomationTriggerOperator })} value={trigger.operator}>
              {(trigger.propertyId === "any" ? ["was_edited"] : property?.operators ?? ["was_edited"]).map((operator) => <option key={operator} value={operator}>{humanize(operator)}</option>)}
            </select>
            {!operandless.has(trigger.operator) ? <Input aria-label="Trigger value" onChange={(event) => onChange({ ...trigger, operand: event.target.value })} placeholder="Value" value={trigger.operand} /> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function ScheduleEditor({ onChange, schedule }: {
  onChange: (schedule: ScheduleDraft) => void;
  schedule: ScheduleDraft;
}) {
  const patch = (value: Partial<ScheduleDraft>) => onChange({ ...schedule, ...value });
  const pattern = schedule.frequency === "custom" ? schedule.customPattern : schedule.frequency;
  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <label className="grid gap-1 text-xs font-medium text-content-secondary">
        Frequency
        <select aria-label="Schedule frequency" className="h-8 rounded-md border bg-control-background px-2 text-sm text-content-primary" onChange={(event) => patch({ frequency: event.target.value as ScheduleDraft["frequency"] })} value={schedule.frequency}>
          <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="custom">Custom</option>
        </select>
      </label>
      {schedule.frequency === "custom" ? (
        <label className="grid gap-1 text-xs font-medium text-content-secondary">
          Repeat unit
          <select aria-label="Custom schedule unit" className="h-8 rounded-md border bg-control-background px-2 text-sm text-content-primary" onChange={(event) => patch({ customPattern: event.target.value as ScheduleDraft["customPattern"] })} value={schedule.customPattern}>
            <option value="daily">Days</option><option value="weekly">Weeks</option><option value="monthly">Months</option><option value="yearly">Years</option>
          </select>
        </label>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs font-medium text-content-secondary">
          Every
          <Input aria-label="Schedule interval" max={365} min={1} onChange={(event) => patch({ interval: Math.max(1, Math.min(365, Number(event.target.value) || 1)) })} type="number" value={schedule.interval} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-content-secondary">
          Local time
          <Input aria-label="Schedule local time" onChange={(event) => patch({ localTime: event.target.value })} type="time" value={schedule.localTime} />
        </label>
      </div>
      {pattern === "weekly" ? (
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-content-secondary">Weekdays</legend>
          <div className="flex flex-wrap gap-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, day) => (
              <Button
                aria-pressed={schedule.weekdays.includes(day)}
                key={label}
                onClick={() => patch({ weekdays: toggleNumber(schedule.weekdays, day) })}
                size="sm"
                type="button"
                variant={schedule.weekdays.includes(day) ? "secondary" : "outline"}
              >{label}</Button>
            ))}
          </div>
        </fieldset>
      ) : null}
      {pattern === "monthly" || pattern === "yearly" ? (
        <label className="grid gap-1 text-xs font-medium text-content-secondary">
          Day of month
          <select aria-label="Schedule day of month" className="h-8 rounded-md border bg-control-background px-2 text-sm text-content-primary" onChange={(event) => patch({ dayOfMonth: event.target.value })} value={schedule.dayOfMonth}>
            {Array.from({ length: 31 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
            <option value="last">Last day</option>
          </select>
        </label>
      ) : null}
      {pattern === "yearly" ? (
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-content-secondary">Months</legend>
          <div className="grid grid-cols-6 gap-1">
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
              <Button aria-label={`Month ${month}`} aria-pressed={schedule.months.includes(month)} key={month} onClick={() => patch({ months: toggleNumber(schedule.months, month) })} size="sm" type="button" variant={schedule.months.includes(month) ? "secondary" : "outline"}>{month}</Button>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs font-medium text-content-secondary">
          Start date
          <Input aria-label="Schedule start date" onChange={(event) => patch({ startDate: event.target.value })} type="date" value={schedule.startDate} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-content-secondary">
          End date (optional)
          <Input aria-label="Schedule end date" min={schedule.startDate} onChange={(event) => patch({ endDate: event.target.value })} type="date" value={schedule.endDate} />
        </label>
      </div>
    </div>
  );
}

function ActionCard({ action, catalog, databaseId, dataSourceId, index, onChange, onMove, onRemove, scheduled }: {
  action: ActionDraft;
  catalog?: DatabaseAutomationCatalog;
  databaseId: string;
  dataSourceId: string;
  index: number;
  onChange: (action: ActionDraft) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove?: () => void;
  scheduled: boolean;
}) {
  const writable = catalog?.properties.filter((property) => property.writable) ?? [];
  const selectedProperty = catalog?.properties.find((property) => property.id === action.propertyId);
  const collection = ["multi_select", "person", "relation"].includes(selectedProperty?.type ?? "");
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center gap-1"><Zap className="size-4" /><span className="text-sm font-medium">Action {index + 1}</span><Button aria-label="Move action up" className="ml-auto" disabled={index === 0} onClick={() => onMove(-1)} size="icon" variant="ghost"><ArrowUp /></Button><Button aria-label="Move action down" onClick={() => onMove(1)} size="icon" variant="ghost"><ArrowDown /></Button>{onRemove ? <Button aria-label="Remove action" onClick={onRemove} size="icon" variant="ghost"><X /></Button> : null}</div>
      <div className="grid gap-2">
        <select className="h-8 rounded-md border bg-control-background px-2 text-sm" onChange={(event) => {
          const type = event.target.value as ActionDraft["type"];
          onChange({
            ...action,
            ...(type === "send_notification" && action.recipientType === "email"
              ? { recipientType: "selected_user" as const, recipientValue: "" }
              : {}),
            type,
          });
        }} value={action.type}>
          <option value="define_variables">Define variables</option>{!scheduled ? <option value="edit_trigger_page">Edit trigger page</option> : null}<option value="add_page">Add page</option><option value="edit_pages">Edit pages</option><option value="send_notification">Send notification</option>{catalog?.actions.find((item) => item.type === "send_gmail")?.available ? <option value="send_gmail">Send Gmail</option> : null}{catalog?.actions.find((item) => item.type === "send_webhook")?.available ? <option value="send_webhook">Send webhook</option> : null}{catalog?.actions.find((item) => item.type === "send_slack")?.available ? <option value="send_slack">Send Slack message</option> : null}
        </select>
        {action.type === "send_slack" ? (
          <SlackActionFields action={action} catalog={catalog} dataSourceId={dataSourceId} databaseId={databaseId} onChange={onChange} />
        ) : action.type === "send_webhook" ? (
          <>
            <Input aria-label="Webhook URL" onChange={(event) => onChange({ ...action, webhookUrl: event.target.value })} placeholder="https://example.com/webhook" type="url" value={action.webhookUrl} />
            <select aria-label="Webhook selected property" className="h-8 rounded-md border bg-control-background px-2 text-sm" onChange={(event) => onChange({ ...action, propertyId: event.target.value })} value={action.propertyId}>
              <option value="name">Name</option>{catalog?.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
            </select>
            <Input aria-label="Webhook payload field" onChange={(event) => onChange({ ...action, variableName: event.target.value })} placeholder="Additional field name (optional)" value={action.variableName} />
            {action.variableName.trim() ? <Input aria-label="Webhook payload value" onChange={(event) => onChange({ ...action, value: event.target.value })} placeholder="Additional field value" value={action.value} /> : null}
            <Input aria-label="Webhook header name" onChange={(event) => onChange({ ...action, webhookHeaderName: event.target.value, webhookSecretId: event.target.value === action.webhookHeaderName ? action.webhookSecretId : "" })} placeholder="Custom header name (optional)" value={action.webhookHeaderName} />
            <Input aria-label="Webhook header value" onChange={(event) => onChange({ ...action, webhookHeaderValue: event.target.value })} placeholder={action.webhookSecretId ? "Stored secret — enter to replace" : "Custom header value"} type="password" value={action.webhookHeaderValue} />
          </>
        ) : action.type === "send_gmail" ? (
          <>
            <select aria-label="Gmail connection" className="h-8 rounded-md border bg-control-background px-2 text-sm" onChange={(event) => onChange({ ...action, connectionId: event.target.value })} value={action.connectionId}>
              <option value="">Choose Gmail account</option>{catalog?.gmailConnections.filter((connection) => connection.status === "connected").map((connection) => <option key={connection.id} value={connection.id}>{connection.email}</option>)}
            </select>
            <select aria-label="Gmail recipient type" className="h-8 rounded-md border bg-control-background px-2 text-sm" onChange={(event) => onChange({ ...action, recipientType: event.target.value as ActionDraft["recipientType"], recipientValue: "", to: "" })} value={action.recipientType}>
              <option value="email">Email addresses</option><option value="selected_user">Selected user</option>{!scheduled ? <><option value="trigger_person">Trigger person</option><option value="page_creator">Page creator</option><option value="person_property">Person property</option></> : null}<option value="variable">Variable</option>
            </select>
            {action.recipientType === "email" ? <Input aria-label="Gmail recipients" onChange={(event) => onChange({ ...action, to: event.target.value })} placeholder="To (emails, comma-separated)" value={action.to} /> : action.recipientType === "selected_user" ? (
              <select aria-label="Gmail selected user" className="h-8 rounded-md border bg-control-background px-2 text-sm" onChange={(event) => onChange({ ...action, recipientValue: event.target.value })} value={action.recipientValue}><option value="">Choose a user</option>{catalog?.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select>
            ) : action.recipientType === "person_property" ? (
              <select aria-label="Gmail person property" className="h-8 rounded-md border bg-control-background px-2 text-sm" onChange={(event) => onChange({ ...action, recipientValue: event.target.value })} value={action.recipientValue}><option value="">Choose a person property</option>{catalog?.properties.filter((property) => property.type === "person").map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
            ) : action.recipientType === "variable" ? <Input aria-label="Gmail recipient variable" onChange={(event) => onChange({ ...action, recipientValue: event.target.value })} placeholder="Variable name" value={action.recipientValue} /> : null}
            <Input aria-label="Gmail CC recipients" onChange={(event) => onChange({ ...action, cc: event.target.value })} placeholder="CC (optional)" value={action.cc} />
            <Input aria-label="Gmail BCC recipients" onChange={(event) => onChange({ ...action, bcc: event.target.value })} placeholder="BCC (optional)" value={action.bcc} />
            <Input aria-label="Gmail subject" onChange={(event) => onChange({ ...action, subject: event.target.value })} placeholder="Subject" value={action.subject} />
            <Input aria-label="Gmail message" onChange={(event) => onChange({ ...action, value: event.target.value })} placeholder="Message" value={action.value} />
            <Input aria-label="Gmail sender name" onChange={(event) => onChange({ ...action, displayName: event.target.value })} placeholder="Display name (optional)" value={action.displayName} />
            <Input aria-label="Gmail reply-to" onChange={(event) => onChange({ ...action, replyTo: event.target.value })} placeholder="Reply-to (optional)" type="email" value={action.replyTo} />
          </>
        ) : action.type === "send_notification" ? (
          <>
            <select aria-label="Notification recipient type" className="h-8 rounded-md border bg-control-background px-2 text-sm" onChange={(event) => onChange({ ...action, recipientType: event.target.value as ActionDraft["recipientType"], recipientValue: "" })} value={action.recipientType}>
              <option value="selected_user">Selected user</option>{!scheduled ? <><option value="trigger_person">Trigger person</option><option value="page_creator">Page creator</option><option value="person_property">Person property</option></> : null}<option value="variable">Variable</option>
            </select>
            {action.recipientType === "selected_user" ? (
              <select aria-label="Notification recipient" className="h-8 rounded-md border bg-control-background px-2 text-sm" onChange={(event) => onChange({ ...action, recipientValue: event.target.value })} value={action.recipientValue}>
                <option value="">Choose a user</option>{catalog?.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            ) : action.recipientType === "person_property" ? (
              <select aria-label="Notification person property" className="h-8 rounded-md border bg-control-background px-2 text-sm" onChange={(event) => onChange({ ...action, recipientValue: event.target.value })} value={action.recipientValue}>
                <option value="">Choose a person property</option>{catalog?.properties.filter((property) => property.type === "person").map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
              </select>
            ) : action.recipientType === "variable" ? <Input aria-label="Notification recipient variable" onChange={(event) => onChange({ ...action, recipientValue: event.target.value })} placeholder="Variable name" value={action.recipientValue} /> : null}
            <Input aria-label="Notification message" onChange={(event) => onChange({ ...action, value: event.target.value })} placeholder="Message" value={action.value} />
            {!scheduled ? <label className="flex items-center gap-2 text-sm"><input checked={action.linkTriggerPage} onChange={(event) => onChange({ ...action, linkTriggerPage: event.target.checked })} type="checkbox" />Link to trigger page</label> : null}
          </>
        ) : action.type === "define_variables" ? (
          <><Input aria-label="Variable name" onChange={(event) => onChange({ ...action, variableName: event.target.value })} placeholder="Variable name" value={action.variableName} /><Input aria-label="Variable value" onChange={(event) => onChange({ ...action, value: event.target.value })} placeholder="Value" value={action.value} /></>
        ) : (
          <>
            <select className="h-8 rounded-md border bg-control-background px-2 text-sm" onChange={(event) => {
              const nextType = catalog?.properties.find((property) => property.id === event.target.value)?.type;
              const nextCollection = ["multi_select", "person", "relation"].includes(nextType ?? "");
              onChange({
                ...action,
                mode: nextCollection || action.mode === "set" || action.mode === "clear" ? action.mode : "set",
                propertyId: event.target.value,
              });
            }} value={action.propertyId}>
              <option value="name">Name</option>{writable.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
            </select>
            <select className="h-8 rounded-md border bg-control-background px-2 text-sm" onChange={(event) => onChange({ ...action, mode: event.target.value as ActionDraft["mode"] })} value={collection || action.mode === "set" || action.mode === "clear" ? action.mode : "set"}>
              <option value="set">Set</option>{collection ? <><option value="add">Add</option><option value="remove">Remove</option></> : null}<option value="clear">Clear</option>
            </select>
            {action.mode !== "clear" ? <Input aria-label="Action value" onChange={(event) => onChange({ ...action, value: event.target.value })} placeholder="Value" value={action.value} /> : null}
          </>
        )}
      </div>
    </div>
  );
}

function SlackActionFields({ action, catalog, databaseId, dataSourceId, onChange }: {
  action: ActionDraft;
  catalog?: DatabaseAutomationCatalog;
  databaseId: string;
  dataSourceId: string;
  onChange: (action: ActionDraft) => void;
}) {
  const channels = useSlackAutomationChannels(databaseId, dataSourceId, action.connectionId);
  return (
    <>
      <select aria-label="Slack connection" className="h-8 rounded-md border bg-control-background px-2 text-sm" onChange={(event) => onChange({ ...action, connectionId: event.target.value, slackChannelId: "" })} value={action.connectionId}>
        <option value="">Choose Slack workspace</option>{catalog?.slackConnections.filter((connection) => connection.status === "connected").map((connection) => <option key={connection.id} value={connection.id}>{connection.teamName}</option>)}
      </select>
      <select aria-label="Slack channel" className="h-8 rounded-md border bg-control-background px-2 text-sm" disabled={!action.connectionId || channels.isLoading} onChange={(event) => onChange({ ...action, slackChannelId: event.target.value })} value={action.slackChannelId}>
        <option value="">{channels.isLoading ? "Loading channels…" : "Choose a channel"}</option>{channels.data?.channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.isPrivate ? "🔒 " : "#"}{channel.name}</option>)}
      </select>
      <Input aria-label="Slack message" onChange={(event) => onChange({ ...action, value: event.target.value })} placeholder="Message" value={action.value} />
      <Input aria-label="Slack variable" onChange={(event) => onChange({ ...action, variableName: event.target.value })} placeholder="Append variable (optional)" value={action.variableName} />
      <div className="grid grid-cols-[8rem_1fr] gap-2">
        <select aria-label="Slack mention type" className="h-8 rounded-md border bg-control-background px-2 text-sm" onChange={(event) => onChange({ ...action, slackMentionKind: event.target.value as "channel" | "user" })} value={action.slackMentionKind}><option value="user">Mention user</option><option value="channel">Mention channel</option></select>
        <Input aria-label="Slack mention ID" onChange={(event) => onChange({ ...action, slackMentionId: event.target.value })} placeholder="Mention ID (optional)" value={action.slackMentionId} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input aria-label="Slack link label" onChange={(event) => onChange({ ...action, slackLinkLabel: event.target.value })} placeholder="Link label (optional)" value={action.slackLinkLabel} />
        <Input aria-label="Slack link URL" onChange={(event) => onChange({ ...action, slackLinkUrl: event.target.value })} placeholder="https://…" type="url" value={action.slackLinkUrl} />
      </div>
      {channels.isError ? <p className="text-xs text-action-danger-text" role="alert">Slack channels could not be loaded. Reconnect the workspace.</p> : null}
    </>
  );
}

function RunList({ loading, onSelect, runs }: { loading: boolean; onSelect: (id: string) => void; runs: Array<{ durationMs: number | null; id: string; status: string; triggerTime: string }> }) {
  if (loading) return <PanelMessage icon={<Loader2 className="animate-spin" />} title="Loading runs…" />;
  if (!runs.length) return <PanelMessage icon={<Clock />} title="No runs yet" description="Runs will appear here after a trigger matches." />;
  return <div className="p-2">{runs.map((item) => <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-action-neutral-hover" key={item.id} onClick={() => onSelect(item.id)} type="button"><StatusDot status={item.status} /><span className="min-w-0 flex-1"><span className="block text-sm font-medium capitalize">{item.status}</span><span className="block text-xs text-content-secondary">{new Date(item.triggerTime).toLocaleString()}</span></span><span className="text-xs text-content-secondary">{item.durationMs == null ? "—" : `${item.durationMs}ms`}</span></button>)}</div>;
}

function RunDetail({ loading, run }: { loading: boolean; run?: { errorSummary: string | null; status: string; steps?: Array<{ actionId: string; durationMs: number | null; errorSummary: string | null; status: string }> } }) {
  if (loading) return <PanelMessage icon={<Loader2 className="animate-spin" />} title="Loading run…" />;
  if (!run) return <PanelMessage icon={<TriangleAlertIcon />} title="Run unavailable" />;
  return <div className="space-y-3 p-4"><div className="flex items-center gap-2 rounded-lg border p-3"><StatusDot status={run.status} /><span className="text-sm font-semibold capitalize">{run.status}</span></div>{run.errorSummary ? <p className="rounded-md bg-feedback-error-subtle p-3 text-xs text-action-danger-text">{run.errorSummary}</p> : null}<div className="space-y-2">{run.steps?.map((step, index) => <div className="rounded-lg border p-3" key={`${step.actionId}:${index}`}><div className="flex items-center gap-2"><StatusDot status={step.status} /><span className="text-sm font-medium">Step {index + 1}</span><span className="ml-auto text-xs text-content-secondary">{step.durationMs == null ? "—" : `${step.durationMs}ms`}</span></div>{step.errorSummary ? <p className="mt-2 text-xs text-action-danger-text">{step.errorSummary}</p> : null}</div>)}</div></div>;
}

function PanelMessage({ description, icon, title }: { description?: string; icon: ReactNode; title: string }) {
  return <div className="flex min-h-72 flex-col items-center justify-center px-8 text-center"><span className="mb-3 text-content-secondary [&_svg]:size-7">{icon}</span><h3 className="text-sm font-semibold">{title}</h3>{description ? <p className="mt-2 max-w-72 text-sm text-content-secondary">{description}</p> : null}</div>;
}

function StatusDot({ status }: { status: string }) {
  return <span aria-label={status} className={cn("size-2 shrink-0 rounded-full", status === "active" || status === "succeeded" ? "bg-feedback-success" : status === "error" || status === "failed" ? "bg-feedback-error" : status === "running" || status === "queued" ? "bg-feedback-warning" : "bg-indicator-muted")} />;
}

function emptyDraft(): BuilderDraft {
  return {
    actions: [newAction()],
    customName: false,
    match: "any",
    name: "",
    schedule: newSchedule(),
    scopeViewId: "",
    triggerKind: "event",
    triggers: [newTrigger()],
  };
}
const newTrigger = (): TriggerDraft => ({ id: crypto.randomUUID(), operand: "", operator: "was_edited", propertyId: "any", type: "page_added" });
const newAction = (): ActionDraft => ({ bcc: "", cc: "", connectionId: "", displayName: "", id: crypto.randomUUID(), linkTriggerPage: true, mode: "set", propertyId: "name", recipientType: "selected_user", recipientValue: "", replyTo: "", slackChannelId: "", slackLinkLabel: "", slackLinkUrl: "", slackMentionId: "", slackMentionKind: "user", subject: "", to: "", type: "define_variables", value: "true", variableName: "value", webhookHeaderName: "", webhookHeaderValue: "", webhookSecretId: "", webhookUrl: "" });
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

function buildDefinition(draft: BuilderDraft, dataSourceId: string, timezone: string, catalog?: DatabaseAutomationCatalog): DatabaseAutomationDefinition | null {
  if (draft.triggerKind === "event" && draft.triggers.some((trigger) =>
    trigger.type === "property_edited" &&
    !operandless.has(trigger.operator) &&
    !trigger.operand.trim()
  )) return null;
  const clauses: DatabaseAutomationEventTriggerClause[] = draft.triggers.map((trigger) => trigger.type === "page_added"
    ? { id: trigger.id, type: "page_added" }
    : {
        id: trigger.id,
        operator: trigger.operator,
        propertyId: trigger.propertyId,
        type: "property_edited",
        ...(operandless.has(trigger.operator) ? {} : { operand: parseOperand(trigger.operand, catalog?.properties.find((property) => property.id === trigger.propertyId)?.type, trigger.operator) }),
      });
  const actions = draft.actions.map((action): DatabaseAutomationAction | null => {
    if (action.type === "define_variables") {
      if (!action.variableName.trim()) return null;
      return { id: action.id, type: "define_variables", variables: [{ expression: { type: "literal", value: parseLiteral(action.value) }, name: action.variableName.trim() }] };
    }
    if (action.type === "send_notification") {
      if (!action.value.trim()) return null;
      const recipient: AutomationNotificationRecipient | null = action.recipientType === "selected_user"
        ? action.recipientValue ? { type: "selected_user" as const, userId: action.recipientValue } : null
        : action.recipientType === "person_property"
          ? action.recipientValue ? { propertyId: action.recipientValue, type: "person_property" as const } : null
          : action.recipientType === "variable"
            ? action.recipientValue.trim() ? { type: "variable" as const, variableName: action.recipientValue.trim() } : null
            : action.recipientType === "trigger_person"
              ? { type: "trigger_person" }
              : { type: "page_creator" };
      if (!recipient) return null;
      return { id: action.id, message: { parts: [{ text: action.value, type: "text" }] }, ...(draft.triggerKind === "event" && action.linkTriggerPage ? { pageLink: { reference: "trigger_page" as const, type: "reference" as const } } : {}), recipients: [recipient], type: "send_notification" };
    }
    if (action.type === "send_gmail") {
      const to = gmailRecipientExpressions(action);
      if (!action.connectionId || !to.length || !action.subject.trim() || !action.value.trim()) return null;
      return {
        bcc: literalAddressExpressions(action.bcc),
        cc: literalAddressExpressions(action.cc),
        connectionId: action.connectionId,
        ...(action.displayName.trim() ? { displayName: { type: "literal" as const, value: action.displayName.trim() } } : {}),
        id: action.id,
        message: { parts: [{ text: action.value, type: "text" }] },
        ...(action.replyTo.trim() ? { replyTo: { type: "literal" as const, value: action.replyTo.trim() } } : {}),
        subject: { parts: [{ text: action.subject, type: "text" }] },
        to,
        type: "send_gmail",
      };
    }
    if (action.type === "send_webhook") {
      if (!action.webhookUrl.trim() || action.webhookHeaderName.trim() && !action.webhookSecretId && !action.webhookHeaderValue) return null;
      return {
        headers: action.webhookHeaderName.trim() && action.webhookSecretId
          ? [{ name: action.webhookHeaderName.trim(), secretId: action.webhookSecretId }]
          : [],
        id: action.id,
        payloadFields: action.variableName.trim()
          ? [{ key: action.variableName.trim(), value: { type: "literal", value: parseLiteral(action.value) } }]
          : [],
        selectedPropertyIds: [action.propertyId],
        type: "send_webhook",
        url: action.webhookUrl.trim(),
      };
    }
    if (action.type === "send_slack") {
      if (!action.connectionId || !action.slackChannelId || !action.value.trim()) return null;
      return {
        channelId: action.slackChannelId,
        connectionId: action.connectionId,
        id: action.id,
        message: { parts: [
          { text: action.value, type: "text" as const },
          ...(action.variableName.trim() ? [{ type: "value" as const, value: { name: action.variableName.trim(), reference: "variable" as const, type: "reference" as const } }] : []),
          ...(action.slackMentionId.trim() ? [{ id: action.slackMentionId.trim(), kind: action.slackMentionKind, type: "slack_mention" as const }] : []),
          ...(action.slackLinkUrl.trim() && action.slackLinkLabel.trim() ? [{ label: action.slackLinkLabel.trim(), type: "link" as const, url: action.slackLinkUrl.trim() }] : []),
        ] },
        type: "send_slack",
      };
    }
    const propertyType = catalog?.properties.find((property) => property.id === action.propertyId)?.type;
    const operation = { mode: action.mode, propertyId: action.propertyId, ...(action.mode === "clear" ? {} : { value: { type: "literal" as const, value: parseActionLiteral(action.value, propertyType) } }) };
    if (action.type === "edit_trigger_page") return { id: action.id, operations: [operation], type: "edit_trigger_page" };
    if (action.type === "add_page") return { dataSourceId, id: action.id, operations: [operation], type: "add_page" };
    return { id: action.id, operations: [operation], target: { dataSourceId, filter: { conditions: [{ id: `${action.id}-filter`, operator: "is_not_empty", propertyId: "name", type: "condition" }], match: "all" }, type: "filtered_data_source" }, type: "edit_pages" };
  });
  if (actions.some((action) => !action)) return null;
  const trigger: DatabaseAutomationDefinition["trigger"] = draft.triggerKind === "event"
    ? { clauses, kind: "event", match: draft.match }
    : { kind: "schedule", schedule: scheduleDefinition(draft.schedule, timezone) };
  return { actions: actions as DatabaseAutomationAction[], definitionVersion: 1, scope: draft.scopeViewId ? { type: "view", viewId: draft.scopeViewId } : { type: "data_source" }, timezone, trigger };
}

function parseOperand(value: string, propertyType: string | undefined, operator: DatabaseAutomationTriggerOperator): AutomationTriggerOperand {
  if (propertyType === "number") return Number(value || 0);
  if (propertyType === "checkbox") return value === "true";
  if (propertyType === "date") {
    if (operator === "is_between") return { end: new Date(value || Date.now()).toISOString(), start: new Date(value || Date.now()).toISOString(), type: "date_range" };
    if (operator === "is_relative_to_today") return { amount: Math.max(1, Number(value || 1)), direction: "past", type: "relative_date", unit: "day" };
    return { precision: "date", type: "date", value: new Date(value || Date.now()).toISOString() };
  }
  if (["select", "status", "multi_select"].includes(propertyType ?? "")) {
    return { entityType: "option", id: value, type: "entity" };
  }
  if (propertyType === "person") return { entityType: "user", id: value, type: "entity" };
  if (propertyType === "relation") return { entityType: "page", id: value, type: "entity" };
  return value;
}

function parseActionLiteral(value: string, propertyType: string | undefined) {
  if (["multi_select", "person", "relation"].includes(propertyType ?? "")) {
    const entityType = propertyType === "person" ? "user" : propertyType === "relation" ? "page" : "option";
    return [{ entityType, id: value, type: "entity" }];
  }
  if (["select", "status"].includes(propertyType ?? "")) {
    return { entityType: "option", id: value, type: "entity" };
  }
  return parseLiteral(value);
}

function parseLiteral(value: string): null | boolean | number | string {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return value;
}

function literalAddressExpressions(value: string) {
  return value
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean)
    .map((address) => ({ type: "literal" as const, value: address }));
}

function gmailRecipientExpressions(action: ActionDraft) {
  if (action.recipientType === "email") return literalAddressExpressions(action.to);
  if (action.recipientType === "selected_user") return action.recipientValue
    ? [{ reference: "selected_person" as const, type: "reference" as const, userId: action.recipientValue }]
    : [];
  if (action.recipientType === "person_property") return action.recipientValue
    ? [{ propertyId: action.recipientValue, reference: "trigger_property" as const, type: "reference" as const }]
    : [];
  if (action.recipientType === "variable") return action.recipientValue.trim()
    ? [{ name: action.recipientValue.trim(), reference: "variable" as const, type: "reference" as const }]
    : [];
  return [{ reference: action.recipientType, type: "reference" as const }];
}

function gmailRecipientDraft(
  expressions: Array<{ name?: string; propertyId?: string; reference?: string; type: string; userId?: string; value?: unknown }>,
): Pick<ActionDraft, "recipientType" | "recipientValue" | "to"> {
  const first = expressions[0];
  if (first?.type === "reference") {
    if (first.reference === "selected_person") return { recipientType: "selected_user", recipientValue: first.userId ?? "", to: "" };
    if (first.reference === "trigger_property") return { recipientType: "person_property", recipientValue: first.propertyId ?? "", to: "" };
    if (first.reference === "variable") return { recipientType: "variable", recipientValue: first.name ?? "", to: "" };
    if (first.reference === "trigger_person" || first.reference === "page_creator") return { recipientType: first.reference, recipientValue: "", to: "" };
  }
  return { recipientType: "email", recipientValue: "", to: literalExpressionText(expressions) };
}

function literalExpressionText(expressions: Array<{ type: string; value?: unknown }>) {
  return expressions.flatMap((expression) =>
    expression.type === "literal" && typeof expression.value === "string"
      ? [expression.value]
      : []
  ).join(", ");
}

function generateName(draft: BuilderDraft, catalog?: DatabaseAutomationCatalog) {
  if (draft.triggerKind === "schedule") {
    return `${humanize(draft.schedule.frequency)} at ${draft.schedule.localTime} → ${draft.actions[0] ? humanize(draft.actions[0].type) : "Run actions"}`;
  }
  const trigger = draft.triggers[0];
  const action = draft.actions[0];
  const property = catalog?.properties.find((item) => item.id === trigger?.propertyId)?.name;
  const when = trigger?.type === "page_added" ? "When page added" : `When ${property ?? "property"} edited`;
  const then = action ? humanize(action.type) : "Run actions";
  return `${when} → ${then}`;
}

function draftFromDefinition(name: string, definition: DatabaseAutomationDefinition): BuilderDraft {
  const base = emptyDraft();
  return {
    actions: definition.actions.flatMap((action): ActionDraft[] => {
      if (action.type === "define_variables") return [{ ...newAction(), id: action.id, type: action.type, value: String(action.variables[0]?.expression.type === "literal" ? action.variables[0].expression.value ?? "" : ""), variableName: action.variables[0]?.name ?? "value" }];
      if (action.type === "send_notification") {
        const recipient = action.recipients[0];
        return [{ ...newAction(), id: action.id, linkTriggerPage: action.pageLink?.type === "reference" && action.pageLink.reference === "trigger_page", recipientType: recipient?.type ?? "selected_user", recipientValue: recipient?.type === "selected_user" ? recipient.userId : recipient?.type === "person_property" ? recipient.propertyId : recipient?.type === "variable" ? recipient.variableName : "", type: action.type, value: action.message.parts.map((part) => part.type === "text" ? part.text : "").join("") }];
      }
      if (action.type === "send_gmail") {
        const recipient = gmailRecipientDraft(action.to);
        return [{
          ...newAction(),
          bcc: literalExpressionText(action.bcc),
          cc: literalExpressionText(action.cc),
          connectionId: action.connectionId,
          displayName: action.displayName?.type === "literal" ? String(action.displayName.value ?? "") : "",
          id: action.id,
          recipientType: recipient.recipientType,
          recipientValue: recipient.recipientValue,
          replyTo: action.replyTo?.type === "literal" ? String(action.replyTo.value ?? "") : "",
          subject: action.subject.parts.map((part) => part.type === "text" ? part.text : "").join(""),
          to: recipient.to,
          type: action.type,
          value: action.message.parts.map((part) => part.type === "text" ? part.text : "").join(""),
        }];
      }
      if (action.type === "send_webhook") {
        const header = action.headers[0];
        const field = action.payloadFields[0];
        return [{
          ...newAction(),
          id: action.id,
          propertyId: action.selectedPropertyIds[0] ?? "name",
          type: action.type,
          value: field?.value.type === "literal" ? String(field.value.value ?? "") : "",
          variableName: field?.key ?? "",
          webhookHeaderName: header?.name ?? "",
          webhookSecretId: header?.secretId ?? "",
          webhookUrl: action.url,
        }];
      }
      if (action.type === "send_slack") {
        const text = action.message.parts.find((part) => part.type === "text");
        const variable = action.message.parts.find((part) => part.type === "value" && part.value.type === "reference" && part.value.reference === "variable");
        const mention = action.message.parts.find((part) => part.type === "slack_mention");
        const link = action.message.parts.find((part) => part.type === "link");
        return [{
          ...newAction(), connectionId: action.connectionId, id: action.id,
          slackChannelId: action.channelId, slackLinkLabel: link?.label ?? "", slackLinkUrl: link?.url ?? "",
          slackMentionId: mention?.id ?? "", slackMentionKind: mention?.kind ?? "user", type: action.type,
          value: text?.text ?? "", variableName: variable?.type === "value" && variable.value.type === "reference" && variable.value.reference === "variable" ? variable.value.name : "",
        }];
      }
      if (
        action.type !== "add_page" &&
        action.type !== "edit_pages" &&
        action.type !== "edit_trigger_page"
      ) return [];
      const operation = action.operations[0];
      return [{ ...newAction(), id: action.id, mode: operation?.mode ?? "set", propertyId: operation?.propertyId ?? "name", type: action.type as ActionDraft["type"], value: operation?.value?.type === "literal" ? String(operation.value.value ?? "") : "", variableName: "value" }];
    }),
    customName: true,
    match: definition.trigger.kind === "event" ? definition.trigger.match : "any",
    name,
    schedule: definition.trigger.kind === "schedule" ? scheduleDraft(definition.trigger.schedule) : base.schedule,
    scopeViewId: definition.scope.type === "view" ? definition.scope.viewId : "",
    triggerKind: definition.trigger.kind,
    triggers: definition.trigger.kind === "event" ? definition.trigger.clauses.map((clause): TriggerDraft => clause.type === "page_added" ? { id: clause.id, operand: "", operator: "was_edited", propertyId: "any", type: "page_added" } : { id: clause.id, operand: typeof clause.operand === "string" || typeof clause.operand === "number" || typeof clause.operand === "boolean" ? String(clause.operand) : "", operator: clause.operator, propertyId: clause.propertyId, type: "property_edited" }) : base.triggers,
  };
}

function scheduleDefinition(draft: ScheduleDraft, timezone: string): DatabaseAutomationSchedule {
  const pattern = draft.frequency === "custom" ? draft.customPattern : draft.frequency;
  return {
    frequency: draft.frequency,
    interval: draft.interval,
    localTime: draft.localTime,
    startDate: draft.startDate,
    timezone,
    ...(draft.endDate ? { endDate: draft.endDate } : {}),
    ...(pattern === "weekly" ? { weekdays: draft.weekdays } : {}),
    ...(pattern === "monthly" || pattern === "yearly" ? { dayOfMonth: draft.dayOfMonth === "last" ? "last" : Number(draft.dayOfMonth) } : {}),
    ...(pattern === "yearly" ? { months: draft.months } : {}),
  };
}

function scheduleDraft(schedule: DatabaseAutomationSchedule): ScheduleDraft {
  const customPattern = schedule.months?.length ? "yearly" : schedule.dayOfMonth !== undefined ? "monthly" : schedule.weekdays?.length ? "weekly" : "daily";
  return {
    customPattern,
    dayOfMonth: String(schedule.dayOfMonth ?? 1),
    endDate: schedule.endDate ?? "",
    frequency: schedule.frequency,
    interval: schedule.interval,
    localTime: schedule.localTime,
    months: schedule.months ?? [1],
    startDate: schedule.startDate,
    weekdays: schedule.weekdays ?? [1],
  };
}

function toggleNumber(values: number[], value: number) {
  if (values.includes(value)) return values.length === 1 ? values : values.filter((item) => item !== value);
  return [...values, value].sort((left, right) => left - right);
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
