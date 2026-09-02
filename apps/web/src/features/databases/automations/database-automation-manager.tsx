import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  AutomationTriggerOperand,
  DatabaseAutomationAction,
  DatabaseAutomationCatalog,
  DatabaseAutomationDefinition,
  DatabaseAutomationEventTriggerClause,
  DatabaseAutomationSchedule,
  DatabaseAutomationTriggerOperator,
} from "@zilobase/features/databases/automations";
import {
  useCreateDatabaseAutomation,
  useDatabaseAutomation,
  useDatabaseAutomationCatalog,
  useDatabaseAutomationLifecycle,
  useDatabaseAutomationRun,
  useDatabaseAutomationRuns,
  useDatabaseAutomations,
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
  id: string;
  mode: "add" | "clear" | "remove" | "set";
  propertyId: string;
  type: "add_page" | "define_variables" | "edit_pages" | "edit_trigger_page";
  value: string;
  variableName: string;
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
    if (selectedAutomationId && detail.data) {
      await update.mutateAsync({
        body: { definition, name: effectiveName },
        version: detail.data.version,
      });
    } else {
      await create.mutateAsync({ definition, name: effectiveName });
    }
    setBaseline(JSON.stringify(draft));
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
          className="flex h-[min(720px,calc(100vh-5rem))] w-[448px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-0 max-sm:h-[calc(100dvh-1rem)] max-sm:w-[calc(100vw-1rem)]"
          onCloseAutoFocus={(event) => event.preventDefault()}
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
                dataSourceName={dataSourceName}
                draft={draft}
                generatedName={generatedName}
                loading={Boolean(selectedAutomationId && detail.isLoading)}
                onChange={setDraft}
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
              {(create.error ?? update.error) ? (
                <p className="mb-2 text-xs text-action-danger-text" role="alert">
                  {(create.error ?? update.error) instanceof Error
                    ? (create.error ?? update.error)!.message
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
                disabled={!definition || !effectiveName || validate.data?.valid === false || create.isPending || update.isPending}
                onClick={() => void save()}
              >
                {create.isPending || update.isPending ? <Loader2 className="animate-spin" /> : <Check />}
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

function AutomationBuilder({ catalog, dataSourceName, draft, generatedName, loading, onChange }: {
  catalog?: DatabaseAutomationCatalog;
  dataSourceName: string;
  draft: BuilderDraft;
  generatedName: string;
  loading: boolean;
  onChange: (draft: BuilderDraft) => void;
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
                  ? draft.actions.map((action) => action.type === "edit_trigger_page" ? { ...action, type: "edit_pages" } : action)
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
        <div className="space-y-2">
          {draft.actions.map((action, index) => (
            <ActionCard
              action={action}
              catalog={catalog}
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

function ActionCard({ action, catalog, index, onChange, onMove, onRemove, scheduled }: {
  action: ActionDraft;
  catalog?: DatabaseAutomationCatalog;
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
        <select className="h-8 rounded-md border bg-control-background px-2 text-sm" onChange={(event) => onChange({ ...action, type: event.target.value as ActionDraft["type"] })} value={action.type}>
          <option value="define_variables">Define variables</option>{!scheduled ? <option value="edit_trigger_page">Edit trigger page</option> : null}<option value="add_page">Add page</option><option value="edit_pages">Edit pages</option>
        </select>
        {action.type === "define_variables" ? (
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
const newAction = (): ActionDraft => ({ id: crypto.randomUUID(), mode: "set", propertyId: "name", type: "define_variables", value: "true", variableName: "value" });
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
      if (action.type === "define_variables") return [{ id: action.id, mode: "set", propertyId: "name", type: action.type, value: String(action.variables[0]?.expression.type === "literal" ? action.variables[0].expression.value ?? "" : ""), variableName: action.variables[0]?.name ?? "value" }];
      if (
        action.type !== "add_page" &&
        action.type !== "edit_pages" &&
        action.type !== "edit_trigger_page"
      ) return [];
      const operation = action.operations[0];
      return [{ id: action.id, mode: operation?.mode ?? "set", propertyId: operation?.propertyId ?? "name", type: action.type as ActionDraft["type"], value: operation?.value?.type === "literal" ? String(operation.value.value ?? "") : "", variableName: "value" }];
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
