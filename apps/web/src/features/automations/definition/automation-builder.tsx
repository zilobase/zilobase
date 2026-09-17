import { type BuilderDraft, type TriggerPickerSelection, triggerFromSelection, move } from "./automation-draft";
import { ScheduleTriggerCard, TriggerCard, TriggerPicker } from "./automation-trigger-controls";
import { canUseCompactPropertyAction } from "../actions/property-action-model";
import { CompactPropertyActionCard, ActionPicker } from "../actions/property-action-controls";

import type { DatabaseAutomationCatalog } from "@zilobase/features/automations";

import { TriangleAlertIcon, Loader2 } from "@/shared/components/icons";
import { Button } from "@/shared/ui/button";

import { createNotionActionDraft, NotionActionEditor, type NotionActionDraft } from "../actions/notion-action-builder";
import { PanelMessage } from "../database-automation-screens";
import { AutomationSelect } from "./automation-select"

export function AutomationBuilder({ catalog, databaseId, dataSourceId, dataSourceName, draft, loading, onChange, onConnectSlack }: {
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
