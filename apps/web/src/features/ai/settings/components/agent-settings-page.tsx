import {
  canSaveSettingsTrigger,
  applySettingsTriggerDraft,
  settingsTriggerTargetInput,
} from "../model/trigger-draft";
import { settingsActionsBusy, settingsProgressLabel } from "../model/draft-actions";
import { useNavigate } from "@tanstack/react-router";
import { createPortal } from "react-dom";
import { SettingsDraftActions } from "./settings-draft-actions";
import { SettingsReviewSummary } from "./settings-review-summary";
import { SavedInstructionPicker } from "./saved-instruction-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import "../../agent-interface.css";
import { useSession } from "@zilobase/features/auth/react";
import { usePageNavigation } from "@zilobase/features/pages/react";
import {
  useCustomAgentRuns,
  useCustomAgentTriggers,
  useRotateCustomAgentWebhookSecret,
} from "@zilobase/features/ai-chat/react";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useZilobaseFeatures } from "@zilobase/features";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import {
  settingsDefinitionSchema,
  type AiAgentProfileDetail,
  type AgentSettingsTab,
  type AgentSettingsEvent,
  type AgentSettingsDefinition,
} from "@zilobase/features/ai-chat";
import { PageEditorPane } from "@/features/pages/pane/page-editor-pane";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/app-tabs";
import {
  useSettingsDraft,
  isSettingsEditing,
  agentSettingsVersionsQueryOptions,
} from "../use-settings-draft";
import { SettingsConnectors } from "./settings-connectors";
import { PersonalMcpActivity, AgentMcpActivity } from "./mcp-connections";
import { toast } from "sonner";

function ScopedAgentSettingsPage({
  scope = "personal",
  agent,
  initialTab,
  onTabChange,
  draft,
}: {
  draft: ReturnType<typeof useSettingsDraft>;
  scope?: string;
  agent?: AiAgentProfileDetail;
  initialTab?: string | null;
  onTabChange?: (tab: AgentSettingsTab) => void;
  onClose?: () => void;
}) {
  const [headerTarget, setHeaderTarget] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    setHeaderTarget(document.getElementById("agent-settings-header-actions"));
  }, []);
  const [tab, setTab] = React.useState<AgentSettingsTab>(normalizeSettingsTab(initialTab));
  const [editorEpoch, setEditorEpoch] = React.useState(0);
  const [aiEditing, setAiEditing] = React.useState(() => isSettingsEditing(scope));
  React.useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<AgentSettingsEvent>).detail;
      if (detail.scope === scope) setAiEditing(detail.status === "editing");
    };
    window.addEventListener("agent-settings", listener);
    return () => window.removeEventListener("agent-settings", listener);
  }, [scope]);
  const navigate = useNavigate();
  const { apiFetch } = useZilobaseFeatures();
  const versions = useQuery(
    agentSettingsVersionsQueryOptions(apiFetch, draft, tab === "versions" && Boolean(draft.state)),
  );
  React.useEffect(() => setTab(normalizeSettingsTab(initialTab)), [initialTab]);
  const selectTab = (next: AgentSettingsTab) => {
    setTab(next);
    onTabChange?.(next);
  };
  const state = draft.state;
  const d = state?.definition;
  const review = draft.reviewOpen ? (state?.review ?? null) : null;
  const disabled = !state?.canEdit || settingsActionsBusy(draft);
  function renderSettingsHeader() {
    const tabs: AgentSettingsTab[] = [
      "instructions",
      "connectors",
      ...(scope === "personal" ? [] : (["access"] as AgentSettingsTab[])),
      "activity",
      "versions",
    ];

    return (
      <header className="sticky top-0 z-20 grid min-w-0 shrink-0 gap-3 bg-surface-canvas dark:bg-surface-navigation px-5 py-3">
        {headerTarget ? (
          createPortal(<SettingsDraftActions draft={draft} />, headerTarget)
        ) : (
          <SettingsDraftActions draft={draft} />
        )}
        <Tabs value={tab} onValueChange={(v) => selectTab(v as AgentSettingsTab)}>
          <div className="min-w-0 max-w-full overflow-x-auto">
            <TabsList aria-label="Agent settings">
              {tabs.map((t) => (
                <TabsTrigger className="capitalize" key={t} value={t} width="content">
                  {t === "access" ? "Triggers & Access" : t}
                  {draft.changedTabs.includes(t) && (
                    <span
                      className="ml-1 inline-block size-1.5 rounded-full bg-action-primary"
                      aria-label="Unsaved changes"
                    />
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
        <div className="flex items-center gap-3 overflow-x-auto text-xs text-content-secondary">
          {state && <span className="shrink-0">Saved version {state.version}</span>}
          <span className="sr-only" aria-live="polite">
            {settingsProgressLabel(aiEditing, draft.syncing, Boolean(state))}
          </span>
          {tab === "instructions" && d && (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <SavedInstructionPicker
                disabled={disabled}
                onSelect={(page) => {
                  draft.patch({ instructionPageId: page.id });
                  setEditorEpoch((n) => n + 1);
                }}
              />
              <Button
                variant="default"
                size="sm"
                disabled={disabled}
                onClick={() => draft.createInstruction.mutate()}
              >
                {draft.createInstruction.isPending
                  ? "Creating instruction…"
                  : d.instructionPageId
                    ? "New instruction"
                    : "Create instruction"}
              </Button>
            </div>
          )}
        </div>
        {draft.error && (
          <p role="alert" className="text-sm text-feedback-danger-text">
            {draft.error}
          </p>
        )}
      </header>
    );
  }
  function renderVersionHistory() {
    return (
      <div className="grid gap-3 px-5 py-6">
        <h2 className="font-heading text-base font-medium">Version history</h2>
        {versions.error && <p role="alert">{versions.error.message}</p>}
        {versions.data?.versions.map((v) => (
          <div className="flex items-center gap-3 border-b py-3" key={v.id}>
            <span>Version {v.version}</span>
            <span className="flex-1 text-xs text-content-secondary">
              {new Date(v.createdAt).toLocaleString()}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                draft.patch(settingsDefinitionSchema.parse(v.definition));
                setEditorEpoch((n) => n + 1);
                selectTab("instructions");
              }}
            >
              Restore to draft
            </Button>
          </div>
        ))}
      </div>
    );
  }
  function renderInstructionPane() {
    if (!d?.instructionPageId) return null;
    return (
      <PageEditorPane
        key={`${d.instructionPageId}:${editorEpoch}`}
        pageId={d.instructionPageId}
        onOpenPage={(pageId) => void navigate({ to: "/p/$pageId", params: { pageId } })}
        readOnly={disabled}
        showCollaborationPresence
        className={
          review?.fields.includes("instructionTitle")
            ? "agent-instruction-title-changed"
            : undefined
        }
        reviewDiff={
          review &&
          draft.changedFields.some(
            (field) => field === "instructions" || field === "instructionDocument",
          )
            ? {
                beforeMarkdown: review.before.instructions,
                afterMarkdown: review.after.instructions,
              }
            : null
        }
      />
    );
  }

  function renderSettingsContent() {
    if (!d) return null;
    switch (tab) {
      case "instructions":
        return renderInstructionPane();
      case "connectors":
        return (
          <div className="px-5 py-6">
            <SettingsConnectors
              review={review}
              scope={scope}
              definition={d}
              onChange={draft.patch}
              disabled={disabled}
            />
          </div>
        );
      case "activity":
        return (
          <div className="px-5 py-6">
            {agent ? (
              <>
                <SettingsRunActivity agentId={agent.id} />
                <AgentMcpActivity agent={agent} />
              </>
            ) : (
              <PersonalMcpActivity />
            )}
          </div>
        );
      case "versions":
        return renderVersionHistory();
      case "access":
        return scope !== "personal" ? (
          <>
            <SettingsTriggers
              review={review}
              scope={scope}
              definition={d}
              onChange={draft.patch}
              disabled={disabled}
            />
            <SettingsAccess
              review={review}
              definition={d}
              onChange={draft.patch}
              disabled={disabled}
            />
          </>
        ) : null;
    }
  }

  return (
    <aside
      className="flex h-full min-h-0 min-w-0 flex-col overflow-x-clip bg-surface-canvas dark:bg-surface-navigation"
      data-agent-settings-page={scope}
    >
      {renderSettingsHeader()}
      <div className="min-h-0 flex-1 overflow-y-auto pb-12">
        {review && <SettingsReviewSummary review={review} tab={tab} />}

        {renderSettingsContent()}
      </div>
    </aside>
  );
}
function normalizeSettingsTab(tab?: string | null): AgentSettingsTab {
  if (tab === "tools") return "connectors";
  if (tab === "share" || tab === "triggers") return "access";
  return tab === "connectors" || tab === "activity" || tab === "versions" || tab === "access"
    ? tab
    : "instructions";
}
type Fields = {
  review?: import("@zilobase/features/ai-chat").AgentSettingsReview | null;
  definition: AgentSettingsDefinition;
  onChange: (patch: Partial<AgentSettingsDefinition>) => void;
  disabled: boolean;
};
function SettingsTriggers({
  review,
  scope,
  definition: d,
  onChange,
  disabled,
}: Fields & { scope: string }) {
  const [kind, setKind] = React.useState("schedule");
  const [cadence, setCadence] = React.useState("daily");
  const [databaseEvent, setDatabaseEvent] = React.useState("row_added");
  const [propertyId, setPropertyId] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [secret, setSecret] = React.useState<string | null>(null);
  const persisted = useCustomAgentTriggers(scope);
  const rotate = useRotateCustomAgentWebhookSecret(scope);
  const [target, setTarget] = React.useState("");
  const [label, setLabel] = React.useState("");
  const triggerDraft = { kind, cadence, databaseEvent, propertyId, target, label, editingId };
  const targetInput = settingsTriggerTargetInput(kind, cadence);
  return (
    <fieldset disabled={disabled} className="grid gap-4 px-5 py-6">
      <h2 className="font-heading text-base font-medium">Triggers</h2>
      <p className="text-sm text-content-secondary">
        Runs use the saved version. Trigger edits take effect after Save.
      </p>
      {d.triggers.map((t) => (
        <div
          key={t.id}
          data-ai-changed={
            (review?.fields.includes("triggers") &&
              JSON.stringify(review.before.triggers.find((old) => old.id === t.id)) !==
                JSON.stringify(t)) ||
            undefined
          }
          className="flex items-center gap-2 border-b py-2"
        >
          <span className="flex-1">
            {t.label}
            <small className="ml-2 text-content-secondary">{t.kind}</small>
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditingId(t.id);
              setKind(t.kind);
              setLabel(t.label);
              setCadence(String(t.config.cadence ?? "daily"));
              setTarget(
                String(
                  t.config.intervalMinutes ??
                    t.config.databaseId ??
                    t.config.pageId ??
                    t.config.meetingId ??
                    "",
                ),
              );
              setDatabaseEvent(String(t.config.event ?? "row_added"));
              setPropertyId(String(t.config.propertyId ?? ""));
            }}
          >
            Edit
          </Button>
          {t.kind === "webhook" && persisted.data?.triggers.some((x) => x.id === t.id) && (
            <Button
              size="sm"
              variant="ghost"
              disabled={rotate.isPending}
              onClick={() =>
                rotate.mutate(
                  { triggerId: t.id },
                  {
                    onSuccess: (result) => setSecret(result.secret),
                    onError: (e) => toast.error(e.message),
                  },
                )
              }
            >
              Rotate secret
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              onChange({
                triggers: d.triggers.map((x) =>
                  x.id === t.id
                    ? {
                        ...x,
                        status: x.status === "active" ? "paused" : "active",
                      }
                    : x,
                ),
              })
            }
          >
            {t.status === "active" ? "Pause" : "Enable"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange({ triggers: d.triggers.filter((x) => x.id !== t.id) })}
          >
            Remove
          </Button>
        </div>
      ))}
      <label className="grid gap-1 text-sm">
        Trigger type
        <Select disabled={disabled} value={kind} onValueChange={(value) => setKind(value)}>
          <SelectTrigger aria-label="Trigger type" className="w-full">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="schedule">Schedule</SelectItem>
            <SelectItem value="database">Database row added</SelectItem>
            <SelectItem value="comment">Page comment</SelectItem>
            <SelectItem value="mention">Agent mention</SelectItem>
            <SelectItem value="meeting">Meeting completion</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
          </SelectContent>
        </Select>
      </label>
      {secret && (
        <div className="grid gap-2 text-sm">
          <p>Copy this webhook secret now. It is not stored in version history.</p>
          <Input aria-label="Webhook secret" value={secret} readOnly />
          <Button variant="ghost" size="sm" onClick={() => setSecret(null)}>
            Hide secret
          </Button>
        </div>
      )}
      {kind === "schedule" && (
        <Select disabled={disabled} value={cadence} onValueChange={(value) => setCadence(value)}>
          <SelectTrigger aria-label="Schedule cadence" className="w-full">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {["daily", "weekly", "monthly", "yearly", "custom"].map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {kind === "database" && (
        <>
          <Select
            disabled={disabled}
            value={databaseEvent}
            onValueChange={(value) => setDatabaseEvent(value)}
          >
            <SelectTrigger aria-label="Database event" className="w-full">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="row_added">Row added</SelectItem>
              <SelectItem value="row_removed">Row removed</SelectItem>
              <SelectItem value="property_changed">Property changed</SelectItem>
            </SelectContent>
          </Select>
          {databaseEvent === "property_changed" && (
            <Input
              aria-label="Property filter"
              placeholder="Property ID (optional)"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
            />
          )}
        </>
      )}
      <Input
        aria-label="Trigger name"
        placeholder="Trigger name"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      {targetInput && (
        <Input
          aria-label={targetInput.label}
          placeholder={targetInput.placeholder}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
      )}
      <Button
        className="w-fit"
        disabled={!canSaveSettingsTrigger(triggerDraft)}
        onClick={() => {
          onChange({
            triggers: applySettingsTriggerDraft(
              d.triggers,
              triggerDraft,
              editingId ?? crypto.randomUUID(),
            ),
          });
          setLabel("");
          setTarget("");
          setEditingId(null);
        }}
      >
        {editingId ? "Update trigger" : "Add trigger"}
      </Button>
    </fieldset>
  );
}
function SettingsAccess({ definition: d, onChange, disabled, review }: Fields) {
  const workspaceId = useActiveWorkspaceId();
  const navigation = usePageNavigation(workspaceId);
  const resourceName = (type: string, id: string) =>
    (type === "page" ? navigation.data?.pages : navigation.data?.databases)?.find(
      (p) => p.id === id,
    )?.name ?? "Unavailable resource";
  const [resourceType, setType] = React.useState<"page" | "database">("page");
  const [resourceId, setId] = React.useState("");
  const [accessLevel, setLevel] = React.useState<"view" | "comment" | "edit">("view");
  return (
    <fieldset disabled={disabled} className="grid gap-4 px-5 py-6">
      <h2 className="font-heading text-base font-medium">Resource access</h2>
      <p className="text-sm text-content-secondary">
        The instruction page and its accessible links are included automatically when you Save. Add
        other permissions below.
      </p>
      {d.instructionResources?.map((r) => (
        <div
          data-ai-changed={
            (review?.fields.includes("instructionResources") &&
              !review.before.instructionResources?.some(
                (old) => old.resourceType === r.resourceType && old.resourceId === r.resourceId,
              )) ||
            undefined
          }
          key={`instruction:${r.resourceType}:${r.resourceId}`}
          className="flex items-center gap-2 border-b py-2 text-sm"
        >
          <span className="min-w-0 flex-1 truncate">
            {resourceName(r.resourceType, r.resourceId) || "Untitled"}
          </span>
          <span className="text-xs text-content-secondary">From instructions · View</span>
        </div>
      ))}
      {d.resources.map((r) => (
        <div
          className="flex items-center gap-2 border-b py-2"
          data-ai-changed={
            (review?.fields.includes("resources") &&
              JSON.stringify(
                review.before.resources.find(
                  (old) => old.resourceType === r.resourceType && old.resourceId === r.resourceId,
                ),
              ) !== JSON.stringify(r)) ||
            undefined
          }
          key={`${r.resourceType}:${r.resourceId}`}
        >
          <span className="min-w-0 flex-1 truncate">
            {resourceName(r.resourceType, r.resourceId)} · {r.accessLevel}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange({ resources: d.resources.filter((x) => x !== r) })}
          >
            Remove
          </Button>
        </div>
      ))}
      <Select
        disabled={disabled}
        value={resourceType}
        onValueChange={(value) => setType(value as typeof resourceType)}
      >
        <SelectTrigger aria-label="Resource type" className="w-full">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="page">Page</SelectItem>
          <SelectItem value="database">Database</SelectItem>
        </SelectContent>
      </Select>
      <Select disabled={disabled} value={resourceId} onValueChange={(value) => setId(value)}>
        <SelectTrigger aria-label="Resource" className="w-full">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {(resourceType === "page" ? navigation.data?.pages : navigation.data?.databases)?.map(
            (p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name || "Untitled"}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>
      <Select
        disabled={disabled}
        value={accessLevel}
        onValueChange={(value) => setLevel(value as typeof accessLevel)}
      >
        <SelectTrigger aria-label="Resource permission" className="w-full">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="view">View</SelectItem>
          <SelectItem value="comment">Comment</SelectItem>
          <SelectItem value="edit">Edit</SelectItem>
        </SelectContent>
      </Select>
      <Button
        className="w-fit"
        disabled={!resourceId.trim()}
        onClick={() => {
          onChange({
            resources: [
              ...d.resources.filter(
                (x) => x.resourceId !== resourceId || x.resourceType !== resourceType,
              ),
              { resourceId, resourceType, accessLevel },
            ],
          });
          setId("");
        }}
      >
        Grant access
      </Button>
    </fieldset>
  );
}

function SettingsRunActivity({ agentId }: { agentId: string }) {
  const runs = useCustomAgentRuns(agentId);
  return (
    <section className="mb-8 grid gap-3">
      <h2 className="font-heading text-base font-medium">Runs</h2>
      {runs.data?.runs.length === 0 && (
        <p className="text-sm text-content-secondary">No runs yet.</p>
      )}
      {runs.data?.runs.map((r) => (
        <div className="border-b py-3 text-sm" key={r.id}>
          <strong className="capitalize">{r.status.replaceAll("_", " ")}</strong>
          {r.outputSummary && <p className="mt-2 whitespace-pre-wrap">{r.outputSummary}</p>}
          {r.errorSummary && <p className="text-feedback-danger-text">{r.errorSummary}</p>}
        </div>
      ))}
    </section>
  );
}

type SettingsPageProps = Omit<React.ComponentProps<typeof ScopedAgentSettingsPage>, "draft"> & {
  draft?: ReturnType<typeof useSettingsDraft>;
};
function IndependentSettingsPage(props: Omit<SettingsPageProps, "draft">) {
  const draft = useSettingsDraft(props.scope ?? "personal");
  return <ScopedAgentSettingsPage {...props} draft={draft} />;
}
export function AgentSettingsPage(props: SettingsPageProps) {
  const workspaceId = useActiveWorkspaceId();
  const { data: session } = useSession();
  const key = `${workspaceId}:${session?.user?.id}:${props.scope ?? "personal"}`;
  return props.draft ? (
    <ScopedAgentSettingsPage key={key} {...props} draft={props.draft} />
  ) : (
    <IndependentSettingsPage key={key} {...props} />
  );
}
