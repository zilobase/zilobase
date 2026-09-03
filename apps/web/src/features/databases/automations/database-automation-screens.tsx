import type { ReactNode } from "react"
import {
  ArrowLeft,
  Clock,
  Copy,
  Loader2,
  Pause,
  Play,
  Plus,
  Trash2,
  TriangleAlertIcon,
  Zap,
} from "@/shared/components/icons"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { DropDrawerItem, DropDrawerSeparator } from "@/shared/ui/dropdrawer"

export function ManagerHeader({ onBack, title }: {
  onBack?: () => void;
  title: string;
}) {
  return (
    <div className="flex min-h-10 shrink-0 items-center gap-2 px-2 py-1.5">
      {onBack ? (
        <Button aria-label="Back" onClick={onBack} size="icon-sm" variant="ghost"><ArrowLeft /></Button>
      ) : <Zap className="size-4 text-content-secondary" />}
      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
    </div>
  );
}

export function AutomationList({ data, error, loading, onCreate, onEdit, onLifecycle, onRuns }: {
  data: Array<{ actionCount: number; id: string; lastRunStatus: string | null; name: string; nextRunAt: string | null; status: string; triggerSummary: string }>;
  error: boolean;
  loading: boolean;
  onCreate: () => void;
  onEdit: (id: string) => void;
  onLifecycle: (id: string, action: "delete" | "duplicate" | "pause" | "resume") => void;
  onRuns: (id: string) => void;
}) {
  if (loading) {
    return <div className="flex items-center gap-2 px-2 py-4 text-xs text-content-secondary"><Loader2 className="size-4 animate-spin" />Loading automations…</div>;
  }
  if (error) {
    return <div className="flex items-center gap-2 px-2 py-4 text-xs text-action-danger-text"><TriangleAlertIcon className="size-4" />Automations could not be loaded</div>;
  }
  return (
    <div className="pb-1">
      <DropDrawerItem className="font-medium" onSelect={onCreate}>
        <Plus />
        <span>New automation</span>
      </DropDrawerItem>
      <DropDrawerSeparator />
      {!data.length ? (
        <div className="px-2 py-4 text-xs/relaxed text-content-secondary">
          No automations yet. Create one to update pages or notify people when this database changes.
        </div>
      ) : data.map((automation) => (
        <div className="group/automation rounded-md" key={automation.id}>
          <DropDrawerItem className="min-h-12 items-start py-2" onSelect={() => onEdit(automation.id)}>
            <StatusDot status={automation.status} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{automation.name}</span>
                <span className="shrink-0 text-[11px] capitalize text-content-secondary">{automation.status}</span>
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-content-secondary">{automation.triggerSummary}</span>
            </span>
          </DropDrawerItem>
          <div className="-mt-1 mb-1 flex items-center gap-0.5 px-2 pl-7">
            <Button aria-label={automation.status === "active" ? "Pause automation" : "Resume automation"} onClick={() => onLifecycle(automation.id, automation.status === "active" ? "pause" : "resume")} size="icon-sm" type="button" variant="ghost">
              {automation.status === "active" ? <Pause /> : <Play />}
            </Button>
            <Button aria-label="View automation runs" onClick={() => onRuns(automation.id)} size="icon-sm" type="button" variant="ghost"><Clock /></Button>
            <Button aria-label="Duplicate automation" onClick={() => onLifecycle(automation.id, "duplicate")} size="icon-sm" type="button" variant="ghost"><Copy /></Button>
            <Button aria-label="Delete automation" className="ml-auto text-action-danger-text" onClick={() => onLifecycle(automation.id, "delete")} size="icon-sm" type="button" variant="ghost"><Trash2 /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RunList({ loading, onSelect, runs }: { loading: boolean; onSelect: (id: string) => void; runs: Array<{ durationMs: number | null; id: string; status: string; triggerTime: string }> }) {
  if (loading) return <div className="flex items-center gap-2 px-2 py-4 text-xs text-content-secondary"><Loader2 className="size-4 animate-spin" />Loading runs…</div>;
  if (!runs.length) return <div className="px-2 py-4 text-xs/relaxed text-content-secondary">No runs yet. Runs appear here after a trigger matches.</div>;
  return <div className="p-1">{runs.map((item) => <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-action-neutral-hover active:bg-action-neutral-pressed" key={item.id} onClick={() => onSelect(item.id)} type="button"><StatusDot status={item.status} /><span className="min-w-0 flex-1"><span className="block text-xs font-medium capitalize">{item.status}</span><span className="block truncate text-[11px] text-content-secondary">{new Date(item.triggerTime).toLocaleString()}</span></span><span className="text-[11px] text-content-secondary">{item.durationMs == null ? "—" : `${item.durationMs}ms`}</span></button>)}</div>;
}

export function RunDetail({ loading, run }: { loading: boolean; run?: { errorSummary: string | null; status: string; steps?: Array<{ actionId: string; durationMs: number | null; errorSummary: string | null; status: string }> } }) {
  if (loading) return <div className="flex items-center gap-2 px-2 py-4 text-xs text-content-secondary"><Loader2 className="size-4 animate-spin" />Loading run…</div>;
  if (!run) return <div className="flex items-center gap-2 px-2 py-4 text-xs text-content-secondary"><TriangleAlertIcon className="size-4" />Run unavailable</div>;
  return <div className="space-y-1 p-1"><div className="flex items-center gap-2 rounded-md px-2 py-2"><StatusDot status={run.status} /><span className="text-xs font-semibold capitalize">{run.status}</span></div>{run.errorSummary ? <p className="rounded-md bg-feedback-error-subtle p-2 text-xs text-action-danger-text">{run.errorSummary}</p> : null}{run.steps?.map((step, index) => <div className="rounded-md px-2 py-2 hover:bg-action-neutral-hover" key={`${step.actionId}:${index}`}><div className="flex items-center gap-2"><StatusDot status={step.status} /><span className="text-xs font-medium">Step {index + 1}</span><span className="ml-auto text-[11px] text-content-secondary">{step.durationMs == null ? "—" : `${step.durationMs}ms`}</span></div>{step.errorSummary ? <p className="mt-1 text-[11px] text-action-danger-text">{step.errorSummary}</p> : null}</div>)}</div>;
}

export function PanelMessage({ description, icon, title }: { description?: string; icon: ReactNode; title: string }) {
  return <div className="flex min-h-72 flex-col items-center justify-center px-8 text-center"><span className="mb-3 text-content-secondary [&_svg]:size-7">{icon}</span><h3 className="text-sm font-semibold">{title}</h3>{description ? <p className="mt-2 max-w-72 text-sm text-content-secondary">{description}</p> : null}</div>;
}

function StatusDot({ status }: { status: string }) {
  return <span aria-label={status} className={cn("size-2 shrink-0 rounded-full", status === "active" || status === "succeeded" ? "bg-feedback-success" : status === "error" || status === "failed" ? "bg-feedback-error" : status === "running" || status === "queued" ? "bg-feedback-warning" : "bg-indicator-muted")} />;
}

